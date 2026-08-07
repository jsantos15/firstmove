'use client';

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from '@firstmove/core';
import { CoachBubble } from '@/components/practice/CoachBubble';
import { BoardPanel } from '@/components/board/BoardPanel';
import { SidePanel } from '@/components/board/SidePanel';
import { NavBtn } from '@/components/board/NavBtn';
import { useBoardSettings } from '@/hooks/useBoardSettings';
import { playMoveOrCaptureSound, isCaptureSan, unlockMoveSound, keepMoveSoundAwake, stopMoveSoundWake } from '@/lib/moveSound';
import { usePositionAnalysis, ENGINE_DISPLAY_NAME } from '@/hooks/usePositionAnalysis';
import { useCoachSettings } from '@/hooks/useCoachSettings';
import { useOpeningName } from '@/hooks/useOpeningName';
import { getCustomPieces } from '@/lib/piecesets';
import { BoardSettingsPopover } from '@/components/board/BoardSettingsPopover';
import { AnalysisWorkerPool, workerPoolSize } from '@/lib/client/analysisPool';
import { enrichGameMove } from '@/lib/client/enrichGameMove';
import { useAuth } from '@/app/providers';
import {
  useUserGames,
  useSaveUserGame,
  useDeleteUserGame,
  useUserGameById,
  useSharedUserGame,
} from '@/hooks/useUserGames';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { InlineSignIn } from '@/components/ui/InlineSignIn';
import {
  MoveClassificationIcon,
  CLASSIFICATION_COLOR,
  MOVE_LABEL_TEXT_COLOR,
  UNBADGED_REVIEW_CATEGORIES,
} from '@/components/ui/MoveClassificationIcon';
import { getAllOpeningPositionSans } from '@firstmove/supabase';
import type { UserGame, UserGameSource } from '@firstmove/supabase';
import {
  buildAnalyzedGameFromPgn,
  buildGameAnalysisCoachFeedbackFromAnalyzedGameMove,
  buildGameReviewReport,
  GAME_REVIEW_CATEGORIES,
  GAME_REVIEW_CATEGORY_LABELS,
  getAnalyzedGameMoveReviewCategory,
  type CoachFeedback,
  type GameReviewCategory,
  type GameReviewReport,
} from '@/lib/coachFeedback';
import type { AnalyzedGame, AnalyzedGameMove } from '@firstmove/core';

interface GameDetails {
  white: string; whiteElo: string;
  black: string; blackElo: string;
  result: string; event: string;
  timeControl: string; termination: string;
  location: string; round: string;
  eco: string; date: string;
}

const EMPTY_GAME_DETAILS: GameDetails = {
  white: '', whiteElo: '', black: '', blackElo: '',
  result: '*', event: '', timeControl: '', termination: '',
  location: '', round: '', eco: '', date: '',
};

function parsePgnHeaders(pgn: string): GameDetails {
  const get = (key: string) => pgn.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`))?.[1] ?? '';
  return {
    white: get('White').replace(/\?/g, ''),
    whiteElo: get('WhiteElo').replace(/\?/g, ''),
    black: get('Black').replace(/\?/g, ''),
    blackElo: get('BlackElo').replace(/\?/g, ''),
    result: get('Result') || '*',
    event: get('Event').replace(/\?/g, ''),
    timeControl: get('TimeControl').replace(/\?/g, ''),
    termination: get('Termination'),
    location: get('Site').replace(/\?/g, ''),
    round: get('Round').replace(/\?/g, ''),
    eco: get('ECO'),
    date: get('Date').replace(/\?/g, ''),
  };
}

// Tags GameDetails can edit, in standard PGN "Seven Tag Roster" order followed by
// the common supplemental tags this app also exposes.
const EDITABLE_PGN_TAGS: [tag: string, field: keyof GameDetails, required: boolean][] = [
  ['Event', 'event', true],
  ['Site', 'location', true],
  ['Date', 'date', true],
  ['Round', 'round', true],
  ['White', 'white', true],
  ['Black', 'black', true],
  ['Result', 'result', true],
  ['WhiteElo', 'whiteElo', false],
  ['BlackElo', 'blackElo', false],
  ['ECO', 'eco', false],
  ['TimeControl', 'timeControl', false],
  ['Termination', 'termination', false],
];

// Rewrites a PGN's header tags to match the current (possibly user-edited) GameDetails,
// leaving the movetext body — including [%clk] annotations — and any non-editable header
// tags (e.g. a provider's WhiteRatingDiff/Variant/Link) untouched. This is what makes
// edits made in the "Edit Game Details" modal actually stick: without it, Save wrote the
// edited fields to their own DB columns but left the *pgn text's own* header tags stale,
// and re-importing always rebuilds GameDetails by parsing those tags (see parsePgnHeaders)
// — so the edit would silently revert the moment the game was reloaded.
// Splits a pgn's leading `[Tag "value"]` header block from its movetext body.
function splitPgnHeaderAndBody(pgn: string): { tagOrder: string[]; tagValues: Map<string, string>; body: string } {
  const lines = pgn.split(/\r?\n/);
  const tagOrder: string[] = [];
  const tagValues = new Map<string, string>();
  let bodyStart = 0;
  for (const line of lines) {
    const m = line.match(/^\[(\w+)\s+"([^"]*)"\]\s*$/);
    if (!m) break;
    tagOrder.push(m[1]!);
    tagValues.set(m[1]!, m[2]!);
    bodyStart++;
  }
  const body = lines.slice(bodyStart).join('\n').replace(/^\s+/, '');
  return { tagOrder, tagValues, body };
}

// The movetext only (no header tags) — used when parsing variations, where header
// lines would otherwise just be harmless-but-wasted tokens fed through chess.move().
function extractPgnMovetext(pgn: string): string {
  return splitPgnHeaderAndBody(pgn).body;
}

function applyGameDetailsToPgn(pgn: string, details: GameDetails): string {
  const { tagOrder, tagValues, body } = splitPgnHeaderAndBody(pgn);

  for (const [tag, field, required] of EDITABLE_PGN_TAGS) {
    const value = details[field].trim();
    if (!value) {
      if (required) {
        if (!tagValues.has(tag)) tagOrder.push(tag);
        tagValues.set(tag, tag === 'Result' ? '*' : '?');
      } else {
        tagValues.delete(tag);
      }
      continue;
    }
    if (!tagValues.has(tag)) tagOrder.push(tag);
    tagValues.set(tag, value);
  }

  const seen = new Set<string>();
  const headerLines: string[] = [];
  for (const tag of tagOrder) {
    if (seen.has(tag) || !tagValues.has(tag)) continue;
    seen.add(tag);
    headerLines.push(`[${tag} "${tagValues.get(tag)}"]`);
  }
  return `${headerLines.join('\n')}\n\n${body}`;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const INITIAL_EVAL_CP = 20;
const STOCKFISH_DEPTH = 16;

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelTab = 'explore' | 'review';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Parse [%clk h:mm:ss] annotations from a PGN string, returning formatted times
// in the order they appear (ply 0 = white's first move, ply 1 = black's, etc.).
// Chess.com clocks frequently carry fractional seconds (e.g. "0:02:59.9") — the
// seconds group must allow a decimal part or those entries silently fail to
// match, dropping clocks out of the array and desyncing every later ply.
function parsePgnClocks(pgn: string): string[] {
  return parsePgnRawClocks(pgn).map(formatRawClock);
}

// Same as parsePgnClocks but returns the verbatim "h:mm:ss(.f)?" text captured from
// each [%clk ...] tag, unrounded — used when a move is carried into an ExploreTree
// (see buildSeedTree) so its original clock reading can be serialized back out
// byte-for-byte rather than through parsePgnClocks's display-oriented rounding.
function parsePgnRawClocks(pgn: string): string[] {
  const clocks: string[] = [];
  const re = /\[%clk\s+(\d+:\d+:\d+(?:\.\d+)?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn)) !== null) clocks.push(m[1]!);
  return clocks;
}

// Formats a raw "h:mm:ss(.f)?" clock reading (as captured by parsePgnRawClocks, or
// carried verbatim on a MoveEntry.clock) into the same display form parsePgnClocks
// produces — dropping a zero hour component and any fractional seconds.
function formatRawClock(raw: string): string {
  const m = raw.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return raw;
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  const s = Math.floor(parseFloat(m[3]!));
  return h > 0
    ? `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${min}:${String(s).padStart(2, '0')}`;
}

// Formats a total-seconds duration the same way parsePgnClocks formats a clock reading.
function formatClockSeconds(totalSeconds?: number): string | null {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return null;
  const h = Math.floor(totalSeconds / 3600);
  const min = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0
    ? `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${min}:${String(s).padStart(2, '0')}`;
}

// Reads the base time (seconds) from a PGN TimeControl header like "180" or "600+5".
function parseTimeControlSeconds(timeControl: string): number | undefined {
  const match = timeControl.match(/^(\d+)/);
  return match ? parseInt(match[1]!, 10) : undefined;
}

// Returns the most recent clock for each color at the given ply index.
function getClocksAtPly(clocks: string[], plyIndex: number): { w: string | null; b: string | null } {
  if (plyIndex < 0 || clocks.length === 0) return { w: null, b: null };
  let wClock: string | null = null;
  let bClock: string | null = null;
  for (let i = 0; i <= Math.min(plyIndex, clocks.length - 1); i++) {
    if (i % 2 === 0) wClock = clocks[i] ?? null;
    else bClock = clocks[i] ?? null;
  }
  return { w: wClock, b: bClock };
}

// Same as getClocksAtPly, but for a move path that may cross from the main line into
// a branch (see getActivePath) — reads each move's own carried-over MoveEntry.clock
// instead of indexing into a flat top-level-PGN clocks array, since a branch's moves
// aren't part of that array. A move with no clock (e.g. one the user played fresh in
// Explore, which never had a [%clk] reading to begin with) leaves the last-known
// value in place rather than resetting to null, matching getClocksAtPly's behavior
// once a game runs past the end of its own clock annotations.
function getClocksAtPath(path: MoveEntry[]): { w: string | null; b: string | null } {
  let wClock: string | null = null;
  let bClock: string | null = null;
  for (let i = 0; i < path.length; i++) {
    const raw = path[i]?.clock;
    if (!raw) continue;
    if (i % 2 === 0) wClock = formatRawClock(raw);
    else bClock = formatRawClock(raw);
  }
  return { w: wClock, b: bClock };
}

// Formats a provider's base+increment clock (in seconds) as "10+0" style, minutes+seconds.
function formatTimeControl(initial?: number, increment?: number): string | null {
  if (initial == null) return null;
  const minutes = initial >= 60 ? Math.round(initial / 60) : initial;
  const unit = initial >= 60 ? '' : 's';
  return `${minutes}${unit}+${increment ?? 0}`;
}

const PIECE_VALS: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const PIECE_SYMS: Record<string, string> = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const PIECE_ORDER = ['q', 'r', 'b', 'n', 'p'] as const;

interface MaterialData {
  whiteCaptured: Record<string, number>;  // black pieces white has taken
  blackCaptured: Record<string, number>;  // white pieces black has taken
  advantage: number;                       // positive = white ahead
}

function computeMaterial(fen: string): MaterialData {
  const board = fen.split(' ')[0] ?? '';
  const cnt = (ch: string) => (board.match(new RegExp(ch, 'g')) ?? []).length;
  const whiteCaptured = { q: Math.max(0, 1 - cnt('q')), r: Math.max(0, 2 - cnt('r')), b: Math.max(0, 2 - cnt('b')), n: Math.max(0, 2 - cnt('n')), p: Math.max(0, 8 - cnt('p')) };
  const blackCaptured = { q: Math.max(0, 1 - cnt('Q')), r: Math.max(0, 2 - cnt('R')), b: Math.max(0, 2 - cnt('B')), n: Math.max(0, 2 - cnt('N')), p: Math.max(0, 8 - cnt('P')) };
  const wScore = Object.entries(whiteCaptured).reduce((s, [k, v]) => s + (PIECE_VALS[k] ?? 0) * v, 0);
  const bScore = Object.entries(blackCaptured).reduce((s, [k, v]) => s + (PIECE_VALS[k] ?? 0) * v, 0);
  return { whiteCaptured, blackCaptured, advantage: wScore - bScore };
}

// Inline styles for captured piece symbols — white pieces are bright, black pieces are dark
// with a subtle light outline so they read as "black" without vanishing on the dark panel bg.
const WHITE_PIECE_STYLE: React.CSSProperties = { color: 'rgb(243,244,246)' };
const BLACK_PIECE_STYLE: React.CSSProperties = { color: '#1a1a1a', textShadow: '0 0 0 1px rgba(255,255,255,0.45), 0 0 4px rgba(255,255,255,0.25)', WebkitTextStroke: '0.4px rgba(200,200,200,0.5)' };

// ─── Time class icons ─────────────────────────────────────────────────────────
// Original hand-drawn icons (not Chess.com's/Lichess's own brand assets — those are
// proprietary) conveying the same at-a-glance concept per speed, in the same inline-SVG
// style used for every other icon in this file (no icon package/font, no image assets).
// Covers every time class either provider reports: Chess.com's `time_class` is exactly
// bullet/blitz/rapid/daily; Lichess's `speed` is ultraBullet/bullet/blitz/rapid/
// classical/correspondence (verified against each provider's API docs) — daily and
// correspondence are the same UI concept (very slow, days-per-move) so they share an icon.

type TimeClassKey = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily' | 'correspondence';

const TIME_CLASS_LABELS: Record<TimeClassKey, string> = {
  ultrabullet: 'UltraBullet',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  daily: 'Daily',
  correspondence: 'Correspondence',
};

const TIME_CLASS_COLORS: Record<TimeClassKey, string> = {
  ultrabullet: 'text-red-400',
  bullet: 'text-orange-400',
  blitz: 'text-amber-400',
  rapid: 'text-emerald-400',
  classical: 'text-sky-400',
  daily: 'text-amber-300',
  correspondence: 'text-amber-300',
};

function normalizeTimeClass(raw: string | undefined | null): TimeClassKey | null {
  if (!raw) return null;
  const key = raw.toLowerCase();
  return key in TIME_CLASS_LABELS ? (key as TimeClassKey) : null;
}

/** A small icon for a game's time class — ready to drop into GameCard/etc. once wired up. */
function TimeClassIcon({ timeClass, className = 'h-3.5 w-3.5' }: { timeClass: string | undefined | null; className?: string }) {
  const key = normalizeTimeClass(timeClass);
  if (!key) return null;
  const common = `shrink-0 ${TIME_CLASS_COLORS[key]} ${className}`;

  switch (key) {
    case 'bullet':
    case 'ultrabullet':
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" className={common} aria-label={TIME_CLASS_LABELS[key]}>
          <path d="M10 1.4c2.6 1.9 4.1 5.1 4.1 8.3 0 1.7-.4 3.2-1.1 4.6l-1.5-1c.5-1.1.8-2.3.8-3.6 0-2.4-1-4.7-2.3-6.1-1.3 1.4-2.3 3.7-2.3 6.1 0 1.3.3 2.5.8 3.6l-1.5 1C6.4 13 6 11.4 6 9.7c0-3.2 1.5-6.4 4-8.3Z" />
          <path d="M7.8 13.9 5.7 17.6l2-.4L8.9 15l1.1 1.9 2 .4-2.1-3.7a5.9 5.9 0 0 1-2.1.3Z" />
          {key === 'ultrabullet' && (
            <path fillRule="evenodd" d="M2.5 9.7a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75Zm13.25-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1 0-1.5Z" clipRule="evenodd" />
          )}
        </svg>
      );
    case 'blitz':
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" className={common} aria-label={TIME_CLASS_LABELS[key]}>
          <path fillRule="evenodd" d="M11.983 1.907a.75.75 0 0 0-1.292-.657L4.204 9.75a.75.75 0 0 0 .557 1.25h4.038l-1.782 6.093a.75.75 0 0 0 1.292.657l6.487-8.5a.75.75 0 0 0-.557-1.25H10.2l1.783-6.093Z" clipRule="evenodd" />
        </svg>
      );
    case 'rapid':
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className={common} aria-label={TIME_CLASS_LABELS[key]}>
          <circle cx="10" cy="11" r="6.5" />
          <path d="M10 8v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 2h4M10 2v2" strokeLinecap="round" />
        </svg>
      );
    case 'classical':
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className={common} aria-label={TIME_CLASS_LABELS[key]}>
          <path
            d="M5.5 2.5h9M5.5 17.5h9M6.5 2.5c0 3 1.5 5 3.5 6.5-2 1.5-3.5 3.5-3.5 6.5M13.5 2.5c0 3-1.5 5-3.5 6.5 2 1.5 3.5 3.5 3.5 6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'daily':
    case 'correspondence':
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className={common} aria-label={TIME_CLASS_LABELS[key]}>
          <circle cx="10" cy="10" r="3.25" />
          <path
            d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

function PlayerRow({
  name, title, elo, country, avatar, captured, advantage, clock, isActive, playerColor,
}: {
  name: string;
  title?: string | null;
  elo?: string;
  country?: string | null;
  avatar?: string | null;
  captured: Record<string, number>;
  advantage: number;
  clock?: string | null;
  isActive: boolean;
  playerColor: 'white' | 'black';
}) {
  // White player captures black pieces (dark style); black player captures white pieces (light style)
  const capturedPieceStyle = playerColor === 'white' ? BLACK_PIECE_STYLE : WHITE_PIECE_STYLE;
  const pawnSymbol = playerColor === 'white' ? '♙' : '♟';
  const pawnColor = playerColor === 'white' ? 'text-gray-100' : 'text-zinc-500';

  // Group by piece type for chess.com-style stacked display (same-type pieces overlap slightly)
  const pieceGroups = PIECE_ORDER
    .map(p => ({ sym: PIECE_SYMS[p], count: Math.max(0, captured[p] ?? 0) }))
    .filter(g => g.count > 0);
  const hasMaterial = pieceGroups.length > 0;

  return (
    <div className="flex items-center h-full px-2 gap-2.5 min-w-0">
      {/* Avatar — nearly fills row height (50px in a 60px row) */}
      <div className="shrink-0 rounded overflow-hidden bg-white/10 flex items-center justify-center" style={{ width: '50px', height: '50px' }}>
        {avatar
          ? <img src={avatar} alt={name} className="h-full w-full object-cover" />
          : <span className={`text-[44px] leading-none select-none ${pawnColor}`}>{pawnSymbol}</span>
        }
      </div>

      {/* Name on top row, material on bottom row */}
      <div className="flex flex-col justify-center gap-1.5 min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <TitleBadge title={title} className="self-center" />
          <span className="text-sm font-semibold text-gray-200 truncate leading-none">{name || '—'}</span>
          {elo && <span className="text-xs text-gray-500 shrink-0 leading-none">({elo})</span>}
          {country && (
            <span
              className={`fi fi-${country.trim().toLowerCase()} shrink-0 rounded-[1px]`}
              style={{ width: '1rem', height: '0.75rem' }}
              title={country}
            />
          )}
        </div>
        <div className="flex items-center min-w-0 min-h-[16px]">
          {hasMaterial && (
            <>
              {pieceGroups.map((group, gi) => (
                <div key={gi} className="flex items-center" style={{ marginLeft: gi > 0 ? '0.2em' : undefined }}>
                  {Array(group.count).fill(null).map((_, i) => (
                    <span
                      key={i}
                      className="text-sm leading-none select-none"
                      style={{ ...capturedPieceStyle, marginLeft: i > 0 ? '-0.55em' : undefined }}
                    >
                      {group.sym}
                    </span>
                  ))}
                </div>
              ))}
              {advantage > 0 && <span className="ml-1 text-sm font-semibold text-gray-300 leading-none">+{advantage}</span>}
            </>
          )}
        </div>
      </div>

      {/* Clock */}
      {clock && (
        <div className={`shrink-0 flex items-center gap-1 ${isActive ? 'text-gray-200' : 'text-gray-500'}`}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 shrink-0">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v3l2 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-mono">{clock}</span>
        </div>
      )}
    </div>
  );
}

const CLASSIFICATION_DOT = CLASSIFICATION_COLOR;

function formatPvLine(startFen: string, pvUci: string[], maxMoves = 6): string {
  try {
    const parts = startFen.split(' ');
    const startSide = parts[1] ?? 'w';
    const startMoveNum = parseInt(parts[5] ?? '1', 10);
    if (pvUci.length === 0) return '...';
    const chess = new Chess(startFen);
    const tokens: string[] = [];
    let currentMoveNum = startMoveNum;
    let currentSide = startSide;
    for (let i = 0; i < pvUci.length && i < maxMoves; i++) {
      const uci = pvUci[i]!;
      if (i === 0 && currentSide === 'b') {
        tokens.push(`${currentMoveNum}…`);
      } else if (currentSide === 'w') {
        tokens.push(`${currentMoveNum}.`);
      }
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n' });
      if (!move) break;
      tokens.push(move.san);
      if (currentSide === 'b') { currentMoveNum++; currentSide = 'w'; } else { currentSide = 'b'; }
    }
    return tokens.join(' ') || '...';
  } catch {
    return '...';
  }
}

type PvToken = { type: 'num'; text: string } | { type: 'move'; san: string; uciIdx: number };

function pvToTokens(startFen: string, pvUci: string[], maxMoves = 6): PvToken[] {
  try {
    const parts = startFen.split(' ');
    const startSide = parts[1] ?? 'w';
    const startMoveNum = parseInt(parts[5] ?? '1', 10);
    if (pvUci.length === 0) return [];
    const chess = new Chess(startFen);
    const tokens: PvToken[] = [];
    let currentMoveNum = startMoveNum;
    let currentSide = startSide;
    for (let i = 0; i < pvUci.length && i < maxMoves; i++) {
      const uci = pvUci[i]!;
      if (i === 0 && currentSide === 'b') {
        tokens.push({ type: 'num', text: `${currentMoveNum}…` });
      } else if (currentSide === 'w') {
        tokens.push({ type: 'num', text: `${currentMoveNum}.` });
      }
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n' });
      if (!move) break;
      tokens.push({ type: 'move', san: move.san, uciIdx: i });
      if (currentSide === 'b') { currentMoveNum++; currentSide = 'w'; } else { currentSide = 'b'; }
    }
    return tokens;
  } catch {
    return [];
  }
}

function formatEval(cp: number | null): string {
  if (cp === null) return '...';
  if (cp >= 9000) return '+M';
  if (cp <= -9000) return '-M';
  const pawns = cp / 100;
  return (cp >= 0 ? '+' : '') + pawns.toFixed(1);
}

interface BestMoveRecommendation {
  san: string;
  evalCp?: number;
  category: GameReviewCategory | null;
  /** True when san is simply confirming the move that was actually played (it already
   * was the engine's top choice) rather than suggesting a different one — Import Game
   * mode only; getBestMoveRecommendation is the only place that ever sets this. */
  alreadyPlayed?: boolean;
}

// The engine-line panel shows the best *continuation* from wherever the board is
// right now; this answers a different question — for the move that was actually
// selected, was there something better available at the time? When the played move
// already was the engine's top choice, that's simply reported back (classification
// and eval come straight from the move's own already-computed data). Otherwise a
// synthetic "what if this had been played instead" move is classified through the
// same getAnalyzedGameMoveReviewCategory logic the move-list badges use — san and
// afterPlayedEvalCp swapped to the best move's own values, bestMoveSan left equal to
// itself so the classifier's isBestMove check resolves true and centipawn loss comes
// out to exactly 0, same as it would if this actually were the played move.
function getBestMoveRecommendation(move: AnalyzedGameMove | undefined): BestMoveRecommendation | null {
  if (!move || !move.hasEngineAnalysis) return null;
  if (!move.bestMoveSan || move.bestMoveSan === move.san) {
    return { san: move.san, evalCp: move.afterPlayedEvalCp, category: getAnalyzedGameMoveReviewCategory(move), alreadyPlayed: true };
  }
  const asBestMove: AnalyzedGameMove = {
    ...move,
    san: move.bestMoveSan,
    afterPlayedEvalCp: move.afterBestEvalCp ?? move.afterPlayedEvalCp,
  };
  return { san: move.bestMoveSan, evalCp: move.afterBestEvalCp, category: getAnalyzedGameMoveReviewCategory(asBestMove) };
}

// Import Game mode phrases the recommendation as retrospective commentary ("X was a
// better move") rather than the live panel's present-tense "X is Best", since here a
// move has actually already been played. These are suffixes only — the move itself is
// already rendered separately as its own colored span to the left (see BestMoveSection),
// so no phrase repeats it. A large, varied pool — keyed off san+evalCp so the same
// position always reads the same way, but different positions rarely repeat — stands in
// for what would otherwise be one flat, repetitive "is Best" sentence read over and over
// across a whole game review. Split by how large the miss was: BIGGER_EDGE for a
// genuinely stronger alternative (brilliant/great), SMALL_EDGE for a move that was
// already fine but not quite the top engine choice (best/excellent/good/book).
const BIGGER_EDGE_SUFFIXES = [
  'was a much stronger continuation.',
  'was significantly better here.',
  'would have been a far stronger choice.',
  'was a considerably sharper try.',
  'packed a lot more punch.',
  'was clearly the stronger path.',
  'made a much bigger difference.',
  'was the decisive continuation here.',
  'was a far more forcing choice.',
  'hit much harder.',
  'was the move that really mattered.',
  'was a major step up.',
];
const SMALL_EDGE_SUFFIXES = [
  'was a better move.',
  'was even a better option.',
  'edged this one out slightly.',
  'was a touch more accurate.',
  'was marginally stronger.',
  'was the more precise choice.',
  'held a slightly firmer grip.',
  'was a small step up.',
  'was a cleaner choice here.',
  'nudged the evaluation further.',
  'was slightly more exact.',
  'kept a small edge.',
  'was a bit more accurate.',
  'was the tidier option.',
  'squeezed out a little more.',
];
const ALREADY_BEST_SUFFIXES = [
  'was the best move here.',
  'was exactly right.',
  'was the top choice.',
  "couldn't be improved on.",
  'was spot on.',
  'was the strongest option available.',
  'was precisely what the position called for.',
  'nailed it.',
];

function hashStringToIndex(value: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash % modulo;
}

// Returns just the part of the sentence after the move — pair with the move's own
// colored span (already rendered separately) to read as one continuous sentence.
function pastTenseBestMoveSuffix(recommendation: BestMoveRecommendation): string {
  // Book moves get one fixed, plain label instead of the varied pools below — a book
  // move being "better" or "best" isn't a meaningful judgment, it's just still theory.
  if (recommendation.category === 'book') return 'is a book move';
  const key = `${recommendation.san}:${recommendation.evalCp ?? 0}`;
  const pool = recommendation.alreadyPlayed
    ? ALREADY_BEST_SUFFIXES
    : recommendation.category === 'brilliant' || recommendation.category === 'great'
      ? BIGGER_EDGE_SUFFIXES
      : SMALL_EDGE_SUFFIXES;
  return pool[hashStringToIndex(key, pool.length)]!;
}

// Sits between the coach bubble and the Engine settings row. Shows the same
// recommendation the board arrow does — precomputed "what was the best move here" for a
// real Imported Game position, or a live "what's best to play next" (with a loading spinner
// until the engine has an answer) for Open Analysis or a genuine branch — so the two never
// disagree; the caller (which has access to both the precomputed and live data sources)
// decides which applies and hands down the single already-resolved recommendation. Only
// rendered at all for a loaded game with moves (see call site). Reserves height for two
// text rows: the recommendation itself today, with a second row free for a later "why"
// explanation alongside it.
function BestMoveSection({
  recommendation,
  loading,
  message,
  isImportedGameMode,
}: {
  recommendation: BestMoveRecommendation | null;
  loading: boolean;
  message: string;
  isImportedGameMode: boolean;
}) {
  return (
    <div className="h-[52px] shrink-0 border-b border-white/5 px-3 flex flex-col justify-center gap-0.5">
      {recommendation && recommendation.category ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <MoveClassificationIcon category={recommendation.category} size={16} />
          <span className={`shrink-0 text-xs font-semibold ${MOVE_LABEL_TEXT_COLOR[recommendation.category] ?? 'text-white'}`}>
            {recommendation.san}
          </span>
          <span className="min-w-0 truncate text-xs text-gray-500">
            {isImportedGameMode ? pastTenseBestMoveSuffix(recommendation) : `is ${GAME_REVIEW_CATEGORY_LABELS[recommendation.category]}`}
          </span>
          <span className="min-w-0 flex-1" />
          <span
            className={`shrink-0 rounded border px-1.5 py-px font-mono text-xs font-bold tabular-nums ${
              (recommendation.evalCp ?? 0) >= 0 ? 'border-zinc-500/60 text-white' : 'border-red-400/40 text-red-400'
            }`}
          >
            {formatEval(recommendation.evalCp ?? null)}
          </span>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-1.5 text-gray-600">
          {loading && <SpinnerIcon className="h-3 w-3 shrink-0" />}
          <p className="truncate text-xs">{message}</p>
        </div>
      )}
    </div>
  );
}

type ExplorePair = {
  moveNumber: number;
  white: { san: string; idx: number } | null;
  black: { san: string; idx: number } | null;
};

type ExploreEntry = { san: string; fen: string; from: string; to: string };

function buildExplorePairs(history: ExploreEntry[], startFen: string): ExplorePair[] {
  if (history.length === 0) return [];
  const parts = startFen.split(' ');
  const startTurn = parts[1] ?? 'w';
  const startMoveNum = parseInt(parts[5] ?? '1', 10);
  const pairs: ExplorePair[] = [];
  for (let i = 0; i < history.length; i++) {
    const isWhite = i % 2 === 0 ? startTurn === 'w' : startTurn === 'b';
    const moveOffset = i + (startTurn === 'b' ? 1 : 0);
    const moveNum = startMoveNum + Math.floor(moveOffset / 2);
    if (isWhite) {
      pairs.push({ moveNumber: moveNum, white: { san: history[i]!.san, idx: i }, black: null });
    } else {
      const last = pairs[pairs.length - 1];
      if (last && last.black === null) {
        last.black = { san: history[i]!.san, idx: i };
      } else {
        pairs.push({ moveNumber: moveNum, white: null, black: { san: history[i]!.san, idx: i } });
      }
    }
  }
  return pairs;
}

// ─── Variation Tree Types ─────────────────────────────────────────────────────

// `clock` is the verbatim [%clk ...] reading for this move, if the source pgn had one —
// only ever set for moves carried in from an original import (buildSeedTree/parseMovetextToTree);
// moves the user plays fresh in the Explore tab have none.
type MoveEntry = { id: string; san: string; fen: string; from: string; to: string; clock?: string };

// A single line in the variation tree (main line or a branch)
type VariationLine = {
  id: string;
  parentLineId: string | null; // null = main line
  divergeAtPly: number;        // index in parent's moves[] where this branch diverges (ignored for main line)
  depth: number;               // 0=main, 1..3=branch levels (max depth 3 = 4 levels total)
  moves: MoveEntry[];
};

type ExploreTree = {
  rootFen: string;
  lines: VariationLine[];  // lines[0] is always the main line
};

type ExploreNav = {
  lineId: string | null;  // null when no tree exists
  plyIndex: number;       // -1 = before first move (root); only valid on main line
};

function getFenMeta(fen: string): { side: 'w' | 'b'; moveNum: number } {
  const parts = fen.split(' ');
  return { side: (parts[1] ?? 'w') as 'w' | 'b', moveNum: parseInt(parts[5] ?? '1', 10) };
}

function getLineStartFen(tree: ExploreTree, line: VariationLine): string {
  if (line.parentLineId === null) return tree.rootFen;
  const parent = tree.lines.find(l => l.id === line.parentLineId);
  if (!parent) return tree.rootFen;
  return line.divergeAtPly === 0
    ? tree.rootFen
    : (parent.moves[line.divergeAtPly - 1]?.fen ?? tree.rootFen);
}

function removeLineAndChildren(lines: VariationLine[], lineId: string): VariationLine[] {
  const children = lines.filter(l => l.parentLineId === lineId);
  let result = lines.filter(l => l.id !== lineId);
  for (const child of children) {
    result = removeLineAndChildren(result, child.id);
  }
  return result;
}

// Returns the ordered move sequence from the tree root to the current nav position,
// tracing through any parent lines when on a branch.
function getActivePath(tree: ExploreTree, nav: ExploreNav): MoveEntry[] {
  if (!nav.lineId || nav.plyIndex < 0) return [];
  const line = tree.lines.find(l => l.id === nav.lineId);
  if (!line) return [];

  // Walk up to the root, collecting the chain of lines
  const chain: VariationLine[] = [];
  let cur: VariationLine | undefined = line;
  while (cur) {
    chain.unshift(cur);
    if (!cur.parentLineId) break;
    cur = tree.lines.find(l => l.id === cur!.parentLineId);
  }

  const moves: MoveEntry[] = [];
  for (let i = 0; i < chain.length; i++) {
    const l = chain[i]!;
    if (i < chain.length - 1) {
      // Parent line — take moves up to (but not including) the next branch's divergeAtPly
      const childLine = chain[i + 1]!;
      moves.push(...l.moves.slice(0, childLine.divergeAtPly));
    } else {
      // Current (leaf) line — take moves up to the current ply index
      moves.push(...l.moves.slice(0, nav.plyIndex + 1));
    }
  }
  return moves;
}

function truncateChildBranches(lines: VariationLine[], parentId: string, fromPly: number): VariationLine[] {
  const childrenToRemove = lines.filter(l => l.parentLineId === parentId && l.divergeAtPly >= fromPly);
  let result = lines;
  for (const child of childrenToRemove) {
    result = removeLineAndChildren(result, child.id);
  }
  return result;
}

// Swaps the content of a branch with its parent at the divergence point.
// Used iteratively by promoteToMainLine to bubble a branch up to main.
function swapBranchWithParent(tree: ExploreTree, branchId: string): ExploreTree {
  const branch = tree.lines.find(l => l.id === branchId);
  if (!branch?.parentLineId) return tree;
  const parent = tree.lines.find(l => l.id === branch.parentLineId);
  if (!parent) return tree;
  const P = branch.divergeAtPly;
  const newParentMoves = [...parent.moves.slice(0, P), ...branch.moves];
  const newBranchMoves = parent.moves.slice(P);
  return {
    ...tree,
    lines: tree.lines.map(l => {
      if (l.id === parent.id) return { ...l, moves: newParentMoves };
      if (l.id === branchId) return { ...l, moves: newBranchMoves };
      // Other siblings of branch at divergeAtPly >= P → re-parent to branch, adjust ply
      if (l.parentLineId === parent.id && l.divergeAtPly >= P && l.id !== branchId)
        return { ...l, parentLineId: branchId, divergeAtPly: l.divergeAtPly - P };
      // Children of branch → re-parent to parent at shifted ply
      if (l.parentLineId === branchId)
        return { ...l, parentLineId: parent.id, divergeAtPly: l.divergeAtPly + P };
      return l;
    }),
  };
}

function recomputeDepths(lines: VariationLine[]): VariationLine[] {
  const depthMap = new Map<string, number>();
  const queue: string[] = [];
  const main = lines.find(l => l.parentLineId === null);
  if (!main) return lines;
  depthMap.set(main.id, 0);
  queue.push(main.id);
  while (queue.length > 0) {
    const pid = queue.shift()!;
    const pd = depthMap.get(pid) ?? 0;
    for (const l of lines) {
      if (l.parentLineId === pid) { depthMap.set(l.id, pd + 1); queue.push(l.id); }
    }
  }
  return lines.map(l => ({ ...l, depth: depthMap.get(l.id) ?? l.depth }));
}

// Promotes a branch to the main line by repeatedly swapping it upward.
// Former main and intermediate ancestors become sibling branches at their divergence points.
function promoteToMainLine(tree: ExploreTree, lineId: string): ExploreTree {
  let currentTree = tree;
  let targetId = lineId;
  while (true) {
    const target = currentTree.lines.find(l => l.id === targetId);
    if (!target || target.parentLineId === null) break;
    const parentId = target.parentLineId;
    currentTree = swapBranchWithParent(currentTree, targetId);
    targetId = parentId; // promoted content is now in the parent slot — continue from there
  }
  return { ...currentTree, lines: recomputeDepths(currentTree.lines) };
}

// Removes moves from fromPly onwards in the given line (inclusive), plus any child branches.
function deleteFromHere(tree: ExploreTree, lineId: string, fromPly: number): ExploreTree {
  let newLines = truncateChildBranches(tree.lines, lineId, fromPly);
  newLines = newLines.map(l => l.id === lineId ? { ...l, moves: l.moves.slice(0, fromPly) } : l);
  // Drop the branch entirely if it now has no moves (only applies to non-main branches)
  const line = newLines.find(l => l.id === lineId);
  if (line && line.moves.length === 0 && line.parentLineId !== null)
    newLines = removeLineAndChildren(newLines, lineId);
  return { ...tree, lines: newLines };
}

// Shared logic for adding one MoveEntry to the tree at the current nav position.
// Used by both tryMove (single move) and handlePvClick (batch of moves).
function applyMoveToTree(
  tree: ExploreTree | null,
  nav: ExploreNav,
  entry: MoveEntry,
  rootFen: string,
): { tree: ExploreTree; nav: ExploreNav } {
  const MAX_PER_POINT = 4;

  if (!tree || !nav.lineId) {
    const mainId = crypto.randomUUID();
    return {
      tree: { rootFen, lines: [{ id: mainId, parentLineId: null, divergeAtPly: 0, depth: 0, moves: [entry] }] },
      nav: { lineId: mainId, plyIndex: 0 },
    };
  }

  const currentLine = tree.lines.find(l => l.id === nav.lineId)!;
  const nextPly = nav.plyIndex + 1;
  const nextMove = currentLine.moves[nextPly];

  if (!nextMove) {
    const cleanedLines = truncateChildBranches(tree.lines, currentLine.id, nextPly);
    return {
      tree: { ...tree, lines: cleanedLines.map(l => l.id === currentLine.id ? { ...l, moves: [...l.moves.slice(0, nextPly), entry] } : l) },
      nav: { lineId: currentLine.id, plyIndex: nextPly },
    };
  }

  if (nextMove.san === entry.san) {
    return { tree, nav: { lineId: currentLine.id, plyIndex: nextPly } };
  }

  // Divergence — check for an existing branch starting with the same move
  const existing = tree.lines.find(l =>
    l.parentLineId === currentLine.id && l.divergeAtPly === nextPly && l.moves[0]?.san === entry.san
  );
  if (existing) {
    return { tree, nav: { lineId: existing.id, plyIndex: 0 } };
  }

  if (currentLine.depth >= 3) {
    const cleanedLines = truncateChildBranches(tree.lines, currentLine.id, nextPly);
    return {
      tree: { ...tree, lines: cleanedLines.map(l => l.id === currentLine.id ? { ...l, moves: [...l.moves.slice(0, nextPly), entry] } : l) },
      nav: { lineId: currentLine.id, plyIndex: nextPly },
    };
  }

  const siblingsHere = tree.lines.filter(l => l.parentLineId === currentLine.id && l.divergeAtPly === nextPly);
  const newBranchId = crypto.randomUUID();
  const newBranch: VariationLine = { id: newBranchId, parentLineId: currentLine.id, divergeAtPly: nextPly, depth: currentLine.depth + 1, moves: [entry] };
  if (siblingsHere.length >= MAX_PER_POINT) {
    const oldest = siblingsHere[0]!;
    return { tree: { ...tree, lines: [...removeLineAndChildren(tree.lines, oldest.id), newBranch] }, nav: { lineId: newBranchId, plyIndex: 0 } };
  }
  return { tree: { ...tree, lines: [...tree.lines, newBranch] }, nav: { lineId: newBranchId, plyIndex: 0 } };
}

// ─── Variation-tree PGN round-tripping ───────────────────────────────────────
// Serializes/parses the *entire* branch tree (not just whichever line is currently
// navigated) using standard PGN Recursive Annotation Variation syntax — "(...)"
// attached right after the move it's an alternative to — so branches created in the
// Explore tab survive a Save/reload instead of only the one line that happened to be
// active when Save was clicked.

function serializeExploreTree(tree: ExploreTree): string {
  const rootMeta = getFenMeta(tree.rootFen);
  const mainLine = tree.lines.find(l => l.parentLineId === null);
  if (!mainLine || mainLine.moves.length === 0) return '';

  function serializeLine(line: VariationLine, globalStartPly: number): string {
    const tokens: string[] = [];
    for (let i = 0; i < line.moves.length; i++) {
      const globalPly = globalStartPly + i;
      const isWhiteMove = rootMeta.side === 'w' ? globalPly % 2 === 0 : globalPly % 2 === 1;
      const moveNum = rootMeta.moveNum + Math.floor((rootMeta.side === 'w' ? globalPly : globalPly + 1) / 2);
      if (isWhiteMove) tokens.push(`${moveNum}.`);
      else if (i === 0) tokens.push(`${moveNum}...`);
      tokens.push(line.moves[i]!.san);
      const clock = line.moves[i]!.clock;
      if (clock) tokens.push(`{[%clk ${clock}]}`);

      // Variations diverging right at this ply are alternatives to the move just
      // printed — standard PGN attaches them immediately after it, in parens.
      const children = tree.lines.filter(l => l.parentLineId === line.id && l.divergeAtPly === i);
      for (const child of children) {
        tokens.push(`(${serializeLine(child, globalPly)})`);
      }
    }
    return tokens.join(' ');
  }

  return serializeLine(mainLine, 0);
}

// Comments "{...}" are kept as whole tokens (rather than stripped) so parseMovetextToTree
// can pull a [%clk ...] reading back out of the one immediately following a move.
function tokenizePgnMovetext(text: string): string[] {
  const tokens: string[] = [];
  const re = /\{[^}]*\}|\(|\)|[^\s(){}]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) tokens.push(m[0]);
  return tokens;
}

function parseMovetextToTree(movetext: string, rootFen: string): ExploreTree {
  const tokens = tokenizePgnMovetext(movetext);
  const lines: VariationLine[] = [];
  let idx = 0;

  function skipBalancedParens() {
    let depth = 1;
    while (idx < tokens.length && depth > 0) {
      if (tokens[idx] === '(') depth++;
      else if (tokens[idx] === ')') depth--;
      idx++;
    }
  }

  // Depth-first, pre-order: a line's VariationLine object is pushed to `lines` before
  // its own moves (and any nested variations within them) are parsed, so the main line
  // — parsed first, at the top level — always ends up at lines[0], matching the
  // convention the rest of this file's ExploreTree code relies on.
  function parseSequence(startFen: string, parentLine: VariationLine | null, divergeAtPly: number) {
    const chess = new Chess(startFen);
    const line: VariationLine = {
      id: crypto.randomUUID(),
      parentLineId: parentLine?.id ?? null,
      divergeAtPly,
      depth: parentLine ? parentLine.depth + 1 : 0,
      moves: [],
    };
    lines.push(line);

    while (idx < tokens.length) {
      const tok = tokens[idx]!;
      if (tok === ')') break;
      if (tok === '(') {
        idx++;
        if (line.moves.length === 0) { skipBalancedParens(); continue; }
        // A variation is an alternative to the move just played in this line — it
        // resumes from the position *before* that move.
        const lastIdx = line.moves.length - 1;
        const beforeFen = lastIdx === 0 ? startFen : line.moves[lastIdx - 1]!.fen;
        parseSequence(beforeFen, line, lastIdx);
        if (tokens[idx] === ')') idx++;
        continue;
      }
      if (tok.startsWith('{') && tok.endsWith('}')) {
        // A comment immediately following a move — pull its [%clk ...] reading (if
        // any) back onto that move; any other comment content is discarded, same as
        // parsing has always done for this tree-shaped save path.
        idx++;
        const clockMatch = tok.match(/\[%clk\s+(\d+:\d+:\d+(?:\.\d+)?)\]/);
        if (clockMatch && line.moves.length > 0) line.moves[line.moves.length - 1]!.clock = clockMatch[1];
        continue;
      }
      if (/^\$\d+$/.test(tok) || /^\d+\.+$/.test(tok)) { idx++; continue; }
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) { idx++; break; }
      idx++;
      const sanRaw = tok.replace(/^\d+\.+/, '');
      try {
        const mv = chess.move(sanRaw);
        if (mv) line.moves.push({ id: crypto.randomUUID(), san: mv.san, fen: chess.fen(), from: mv.from, to: mv.to });
      } catch { /* illegal/unrecognized token — skip it rather than aborting the whole parse */ }
    }
  }

  parseSequence(rootFen, null, 0);
  return { rootFen, lines };
}

// Whether a pgn's movetext contains RAV variations "(...)" outside of {comments} — import
// only pre-builds the full explore tree when there's actually a branch to restore;
// otherwise exploreTree stays null and lazily seeds itself on the user's first free move,
// matching prior behavior for the common (unbranched) case.
function pgnHasVariations(pgn: string): boolean {
  return /\(/.test(pgn.replace(/\{[^}]*\}/g, ''));
}

function extractGameTitle(pgn: string): string | null {
  const white = pgn.match(/\[White "([^"]+)"\]/)?.[1];
  const black = pgn.match(/\[Black "([^"]+)"\]/)?.[1];
  if (white && black) return `${white} vs ${black}`;
  if (white) return white;
  return null;
}

// ─── Move List ────────────────────────────────────────────────────────────────


interface MoveItem {
  san: string;
  plyIndex: number;
  classification: GameReviewCategory | null;
  evalCp?: number;
}

interface MovePair {
  moveNumber: number;
  white: MoveItem | null;
  black: MoveItem | null;
}

function buildMovePairs(moves: AnalyzedGameMove[]): MovePair[] {
  const pairs: MovePair[] = [];
  for (const move of moves) {
    const pairNum = Math.floor(move.plyIndex / 2);
    while (pairs.length <= pairNum) {
      pairs.push({ moveNumber: pairs.length + 1, white: null, black: null });
    }
    const item: MoveItem = {
      san: move.san,
      plyIndex: move.plyIndex,
      classification: getAnalyzedGameMoveReviewCategory(move),
      evalCp: move.hasEngineAnalysis ? move.afterPlayedEvalCp : undefined,
    };
    if (move.playedBy === 'white') {
      pairs[pairNum].white = item;
    } else {
      pairs[pairNum].black = item;
    }
  }
  return pairs;
}

function MoveChip({
  item,
  currentPlyIndex,
  onNavigate,
}: {
  item: MoveItem;
  currentPlyIndex: number;
  onNavigate: (plyIndex: number) => void;
}) {
  const isActive = item.plyIndex === currentPlyIndex;
  const category = item.classification;
  const showBadge = category !== null && !UNBADGED_REVIEW_CATEGORIES.includes(category);
  const labelColor = showBadge
    ? MOVE_LABEL_TEXT_COLOR[category]
    : isActive
      ? 'text-amber-300'
      : 'text-gray-300 group-hover:text-white';

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.plyIndex)}
      className={`group flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-[5px] font-mono text-[13px] transition-colors hover:bg-white/5 ${
        isActive ? 'bg-amber-400/15' : ''
      }`}
    >
      {showBadge && <MoveClassificationIcon category={category} size={16} className="mr-0.5" />}
      <span className={`truncate ${labelColor}`}>{item.san}</span>
    </button>
  );
}

function AnalysisMoveList({
  game,
  currentPlyIndex,
  onNavigate,
}: {
  game: AnalyzedGame;
  currentPlyIndex: number;
  onNavigate: (plyIndex: number) => void;
}) {
  const pairs = useMemo(() => buildMovePairs(game.moves), [game.moves]);
  const activeRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPlyIndex]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {pairs.map(pair => {
          const isActiveRow =
            pair.white?.plyIndex === currentPlyIndex || pair.black?.plyIndex === currentPlyIndex;
          return (
            <div
              key={pair.moveNumber}
              ref={isActiveRow ? activeRowRef : undefined}
              className="flex items-center"
            >
              <span className="w-8 shrink-0 pr-1 text-right font-mono text-[13px] text-gray-600">
                {pair.moveNumber}.
              </span>
              <div className="flex flex-1">
                {pair.white ? (
                  <MoveChip
                    item={pair.white}
                    currentPlyIndex={currentPlyIndex}
                    onNavigate={onNavigate}
                  />
                ) : (
                  <span className="flex-1" />
                )}
                {pair.black ? (
                  <MoveChip
                    item={pair.black}
                    currentPlyIndex={currentPlyIndex}
                    onNavigate={onNavigate}
                  />
                ) : (
                  <span className="flex-1" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Session Games List ────────────────────────────────────────────────────────

// Eval-over-time "dominance" graph — white fill from the top down to the eval curve,
// dark fill below it, so the split point tracks who's better exactly the way Chess.com/
// Lichess's own game graphs read. Mate/extreme scores are clamped to ±MAX_PAWNS so one
// spike doesn't flatten the rest of the game's swings into invisibility. Only plots as
// far as analysis has actually reached (hasEngineAnalysis), so it fills in progressively
// rather than jumping straight to the final shape.
const DOMINANCE_GRAPH_MAX_PAWNS = 10;

// Hex equivalents of the Tailwind bg-* classes CLASSIFICATION_COLOR uses for these five
// categories — the graph's move-quality dots are plain positioned elements (see below),
// styled with an inline backgroundColor, so they can't consume a Tailwind class directly.
// Only the categories explicitly called out as "significant" get a dot; the rest (book/
// best/excellent/good/inaccuracy) are common enough that marking every one would just
// clutter the line.
const DOMINANCE_MARKER_COLORS: Partial<Record<GameReviewCategory, string>> = {
  brilliant: '#22d3ee', // cyan-400
  great: '#60a5fa', // blue-400
  mistake: '#fb923c', // orange-400
  miss: '#fb7185', // rose-400
  blunder: '#ef4444', // red-500
};

// Stockfish has nothing to search in a position with no legal moves (checkmate), so it
// replies with no score at all rather than a mate value — that flows back through
// enrichGameMove's `?? move.afterPlayedEvalCp` fallback as the neutral default (0),
// reading as "dead even" instead of a decisive result for whoever just delivered mate.
// Overridden here rather than trusted from the stored eval, for both the curve and its
// move-quality dots.
function dominanceGraphEvalCp(move: AnalyzedGameMove): number {
  if (move.afterFen) {
    try {
      if (new Chess(move.afterFen).isCheckmate()) {
        return move.playedBy === 'white' ? DOMINANCE_GRAPH_MAX_PAWNS * 100 : -DOMINANCE_GRAPH_MAX_PAWNS * 100;
      }
    } catch { /* malformed fen — fall through with the stored eval */ }
  }
  return move.afterPlayedEvalCp;
}

function DominanceGraphPanel({
  game,
  currentPlyIndex,
  onSelectPly,
  className = '',
}: {
  game: AnalyzedGame | null;
  currentPlyIndex: number;
  onSelectPly: (ply: number) => void;
  className?: string;
}) {
  const points = useMemo(() => {
    if (!game) return [];
    const pts: { ply: number; evalCp: number }[] = [{ ply: -1, evalCp: 0 }];
    for (const move of game.moves) {
      if (!move.hasEngineAnalysis) break;
      pts.push({ ply: move.plyIndex, evalCp: dominanceGraphEvalCp(move) });
    }
    return pts;
  }, [game]);

  if (!game || points.length < 2) {
    return (
      <div className={`flex items-center justify-center px-4 py-2 text-center ${className}`}>
        <p className="text-xs leading-5 text-gray-600">
          {game ? 'Analyzing — the graph fills in as moves are reviewed.' : 'Import and analyze a game to see how the advantage swung.'}
        </p>
      </div>
    );
  }

  const totalPly = game.moves.length - 1;
  const toX = (ply: number) => (totalPly <= 0 ? 0 : ((ply + 1) / (totalPly + 1)) * 100);
  // y=0 is the chart's top edge, y=100 its bottom, and the white fill always runs from
  // the top down to this curve — so a *larger* y (further down) means more of that
  // column is white. White being ahead (positive cp) must push the curve DOWN, not up,
  // to read as "more white," matching the eval bar's own positive-is-white convention.
  const toY = (cp: number) => {
    const pawns = Math.max(-DOMINANCE_GRAPH_MAX_PAWNS, Math.min(DOMINANCE_GRAPH_MAX_PAWNS, cp / 100));
    return 50 + (pawns / DOMINANCE_GRAPH_MAX_PAWNS) * 50;
  };

  const curve = points.map(p => `${toX(p.ply).toFixed(2)} ${toY(p.evalCp).toFixed(2)}`);
  const linePath = `M ${curve.join(' L ')}`;
  const lastX = toX(points[points.length - 1]!.ply);
  const firstX = toX(points[0]!.ply);
  const whiteAreaPath = `M ${firstX.toFixed(2)} 0 L ${curve.join(' L ')} L ${lastX.toFixed(2)} 0 Z`;
  const markerX = toX(currentPlyIndex);

  const moveMarkers = game.moves.flatMap(move => {
    if (!move.hasEngineAnalysis) return [];
    const category = getAnalyzedGameMoveReviewCategory(move);
    const color = category ? DOMINANCE_MARKER_COLORS[category] : undefined;
    if (!category || !color) return [];
    return [{ ply: move.plyIndex, evalCp: dominanceGraphEvalCp(move), color, label: `${move.san} (${GAME_REVIEW_CATEGORY_LABELS[category]})` }];
  });

  // Selecting a ply from a client X coordinate — shared by click and drag-scrub so
  // pressing down and moving the pointer (without releasing) scrubs the board live,
  // not just a single point per click. Cheap: onSelectPly is just goTo, a state update
  // with no engine/network work, so firing it on every pointermove is fine.
  const selectFromClientX = (clientX: number, rect: DOMRect) => {
    const frac = (clientX - rect.left) / rect.width;
    const ply = Math.round(frac * (totalPly + 1)) - 1;
    onSelectPly(Math.max(-1, Math.min(totalPly, ply)));
  };

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full cursor-pointer rounded touch-none"
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          selectFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
        }}
        onPointerMove={e => {
          if (e.buttons !== 1) return;
          selectFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
        }}
      >
        <rect x="0" y="0" width="100" height="100" fill="#2a2d3a" />
        <path d={whiteAreaPath} fill="#e5e5e5" />
        <path d={linePath} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(0,0,0,0.25)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        {currentPlyIndex >= -1 && (
          <line x1={markerX} y1="0" x2={markerX} y2="100" stroke="rgb(245,158,11)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* Move-quality dots are separate positioned elements, not SVG <circle>s — the
          chart above uses preserveAspectRatio="none" to fill a wide-and-short box, which
          would squash a plain circle into an ellipse at that aspect ratio. */}
      {moveMarkers.map(m => (
        <span
          key={m.ply}
          title={m.label}
          className="pointer-events-none absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40"
          style={{ left: `${toX(m.ply)}%`, top: `${toY(m.evalCp)}%`, backgroundColor: m.color }}
        />
      ))}
    </div>
  );
}

function GameReviewReportPanel({
  report,
  hasEngineAnalysis,
  className = '',
}: {
  report: GameReviewReport | null;
  hasEngineAnalysis: boolean;
  className?: string;
}) {
  if (!report) {
    return (
      <div className={`flex items-center justify-center px-4 py-3 text-center ${className}`}>
        <p className="text-xs leading-5 text-gray-600">
          Import and analyze a game to see review categories.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-col overflow-y-auto px-3 py-2 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/5 pb-2">
        <p className="text-xs font-semibold text-white">Game Review</p>
        {!hasEngineAnalysis && (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            needs engine
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_2.5rem_2.5rem] items-center gap-x-2 gap-y-1.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-600">Category</span>
        <span className="text-center text-[10px] uppercase tracking-wider text-gray-600">White</span>
        <span className="text-center text-[10px] uppercase tracking-wider text-gray-600">Black</span>

        {GAME_REVIEW_CATEGORIES.map(category => (
          <div key={category} className="contents">
            <div className="flex min-w-0 items-center gap-2 py-1">
              <span className={`h-2 w-2 shrink-0 rounded-full ${CLASSIFICATION_DOT[category]}`} />
              <span className="truncate text-xs font-medium text-gray-300">
                {GAME_REVIEW_CATEGORY_LABELS[category]}
              </span>
            </div>
            <span className="text-center text-xs font-semibold tabular-nums text-gray-200">
              {report.white.categories[category]}
            </span>
            <span className="text-center text-xs font-semibold tabular-nums text-gray-200">
              {report.black.categories[category]}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 border-t border-white/5 pt-2">
        <div className="grid grid-cols-[1fr_2.5rem_2.5rem] items-center gap-x-2 text-xs">
          <span className="font-medium text-gray-400">Reviewed moves</span>
          <span className="text-center font-semibold tabular-nums text-gray-200">
            {report.white.total}
          </span>
          <span className="text-center font-semibold tabular-nums text-gray-200">
            {report.black.total}
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-gray-600">
          Accuracy and Game Rating are held for the benchmarking pass.
        </p>
      </div>
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

type ImportTab = 'mine' | 'chesscom' | 'lichess' | 'pgn';

// Variants whose moves follow standard chess movement/legality rules *and* whose win
// condition is a regular checkmate/resignation/draw — i.e. actually analyzable by a
// standard chess engine in a way that means what the game was actually about.
// Chess960/fromPosition just change the starting position, so they're included.
// Excluded: crazyhouse/bughouse (drop mechanic — illegal-for-standard positions),
// antichess/atomic/horde/racingKings (illegal-for-standard positions and/or the goal
// isn't a normal win — antichess's goal is literally to lose all your pieces),
// kingOfTheHill/threeCheck (fully legal standard moves, but an alternate win condition
// means engine eval — which only measures normal-win chances — doesn't reflect what
// the game was actually being played for).
// Chess.com `rules` values: chess, chess960, bughouse, kingofthehill, threecheck, crazyhouse.
// Lichess `variant` values: standard, chess960, crazyhouse, antichess, atomic, horde,
// kingOfTheHill, racingKings, threeCheck, fromPosition.
const ANALYZABLE_VARIANTS = new Set(['chess', 'standard', 'chess960', 'fromposition']);

function isAnalyzableVariant(variant: string | undefined | null): boolean {
  if (!variant) return true; // absent almost always means standard chess
  return ANALYZABLE_VARIANTS.has(variant.toLowerCase());
}

interface FetchedGame {
  id: string;
  whiteName: string;
  whiteRating: string | number;
  whiteResult?: string;
  blackName: string;
  blackRating: string | number;
  blackResult?: string;
  result: string;
  date: string;
  timeClass?: string;
  opening?: string;
  pgn: string;
  fen?: string;
  eco?: string;
  rated?: boolean;
  variant?: string;
  clockInitial?: number;
  clockIncrement?: number;
  whiteAccuracy?: number;
  blackAccuracy?: number;
  sourceGameId?: string;
  sourceUrl?: string;
  providerData?: Record<string, unknown>;
  label?: string;
  /** 2-letter country codes, resolved lazily for Chess.com/Lichess list rows (or
   *  read straight from the DB for Saved Analysis) so GameCard can show a flag. */
  whiteCountry?: string | null;
  blackCountry?: string | null;
  /** FIDE/provider title (GM, IM, WGM, etc.), resolved the same way as country. */
  whiteTitle?: string | null;
  blackTitle?: string | null;
}

function fetchedGameToImportMeta(game: FetchedGame, source: UserGameSource): ImportMeta {
  return {
    source,
    eco: game.eco,
    openingName: game.opening,
    timeClass: game.timeClass,
    rated: game.rated,
    variant: game.variant,
    clockInitial: game.clockInitial,
    clockIncrement: game.clockIncrement,
    whiteResult: game.whiteResult,
    blackResult: game.blackResult,
    whiteAccuracy: game.whiteAccuracy,
    blackAccuracy: game.blackAccuracy,
    sourceGameId: game.sourceGameId,
    sourceUrl: game.sourceUrl,
    providerData: game.providerData,
    whiteCountry: game.whiteCountry,
    blackCountry: game.blackCountry,
    whiteTitle: game.whiteTitle,
    blackTitle: game.blackTitle,
  };
}

/** Provenance captured alongside an imported game's PGN so a later Save can store it. */
interface ImportMeta {
  source: UserGameSource;
  eco?: string;
  openingName?: string;
  timeClass?: string;
  rated?: boolean;
  variant?: string;
  clockInitial?: number;
  clockIncrement?: number;
  whiteResult?: string;
  blackResult?: string;
  whiteAccuracy?: number;
  blackAccuracy?: number;
  sourceGameId?: string;
  sourceUrl?: string;
  providerData?: Record<string, unknown>;
  /** The Lichess/Chess.com username that was searched for, so the board can
   *  orient with that player's pieces at the bottom (the usual "my games" view). */
  importedUsername?: string;
  /** Avatar (Chess.com only) and 2-letter country code resolved from the provider's
   *  public profile API, persisted so a reload from My Games doesn't depend on a
   *  fresh network round-trip. */
  whiteAvatar?: string | null;
  blackAvatar?: string | null;
  whiteCountry?: string | null;
  blackCountry?: string | null;
  /** FIDE/provider title (GM, IM, WGM, etc.), resolved from the same provider
   *  profile lookup as avatar/country. */
  whiteTitle?: string | null;
  blackTitle?: string | null;
  /** The Saved Analysis row this game was loaded from, if any — lets Save update
   *  that same row in place instead of creating a new one. */
  savedGameId?: string;
  /** User-editable label so multiple saved copies of the same game (via "Save As")
   *  can be told apart in the Saved Analysis list. */
  label?: string;
}

const EMPTY_IMPORT_META: ImportMeta = { source: 'manual' };

// Remembers the last username a signed-in user searched for per provider, so
// reopening Import doesn't require retyping it (scoped by user id since the
// browser/profile could be shared).
function lastImportUsernameKey(provider: 'lichess' | 'chesscom', userId: string): string {
  return `firstmove:lastImportUsername:${provider}:${userId}`;
}

function userGameToFetchedGame(g: UserGame): FetchedGame {
  return {
    id: g.id,
    whiteName: g.white || 'White',
    whiteRating: g.white_elo ?? '',
    whiteResult: g.white_result ?? undefined,
    blackName: g.black || 'Black',
    blackRating: g.black_elo ?? '',
    blackResult: g.black_result ?? undefined,
    result: g.result || '*',
    date: g.played_date || new Date(g.created_at).toLocaleDateString(),
    timeClass: g.time_class ?? undefined,
    opening: g.opening_name ?? undefined,
    pgn: g.pgn,
    fen: g.fen ?? undefined,
    label: g.label ?? undefined,
    whiteCountry: g.white_country ?? undefined,
    blackCountry: g.black_country ?? undefined,
    whiteTitle: g.white_title ?? undefined,
    blackTitle: g.black_title ?? undefined,
  };
}

function userGameToImportMeta(g: UserGame): ImportMeta {
  return {
    savedGameId: g.id,
    source: (g.source as UserGameSource) ?? 'manual',
    eco: g.eco ?? undefined,
    openingName: g.opening_name ?? undefined,
    timeClass: g.time_class ?? undefined,
    rated: g.rated ?? undefined,
    variant: g.variant ?? undefined,
    clockInitial: g.clock_initial_seconds ?? undefined,
    clockIncrement: g.clock_increment_seconds ?? undefined,
    whiteResult: g.white_result ?? undefined,
    blackResult: g.black_result ?? undefined,
    whiteAccuracy: g.white_accuracy ?? undefined,
    blackAccuracy: g.black_accuracy ?? undefined,
    sourceGameId: g.source_game_id ?? undefined,
    sourceUrl: g.source_url ?? undefined,
    providerData: (g.provider_data as Record<string, unknown> | null) ?? undefined,
    whiteAvatar: g.white_avatar_url ?? undefined,
    blackAvatar: g.black_avatar_url ?? undefined,
    whiteCountry: g.white_country ?? undefined,
    blackCountry: g.black_country ?? undefined,
    whiteTitle: g.white_title ?? undefined,
    blackTitle: g.black_title ?? undefined,
    importedUsername: g.imported_username ?? undefined,
    label: g.label ?? undefined,
  };
}

function SpinnerIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// Counts only the main line's plies — ignoring any RAV variations our own Saved
// Analysis format may contain — for the "N moves" shown on a game card.
function countPlies(pgn: string): number {
  const tokens = tokenizePgnMovetext(extractPgnMovetext(pgn));
  let count = 0;
  let depth = 0;
  for (const tok of tokens) {
    if (tok === '(') { depth++; continue; }
    if (tok === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    if (tok.startsWith('{') && tok.endsWith('}')) continue;
    if (/^\$\d+$/.test(tok) || /^\d+\.+$/.test(tok)) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue;
    count++;
  }
  return count;
}

function matchesTimeClassFilter(rawTimeClass: string | null | undefined, filter: 'all' | TimeClassKey): boolean {
  return filter === 'all' || normalizeTimeClass(rawTimeClass) === filter;
}

// Chess.com/Lichess game-list endpoints don't include a player's country or title on
// the game itself (only their name/rating) — those live on the separate public profile
// endpoint, so list rows need their own lookup rather than reusing the single-game
// fetch below.
interface ProviderProfileInfo {
  country: string | null;
  title: string | null;
}

async function fetchProviderProfile(provider: 'lichess' | 'chesscom', username: string): Promise<ProviderProfileInfo> {
  if (!username) return { country: null, title: null };
  try {
    if (provider === 'chesscom') {
      const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}`);
      if (!res.ok) return { country: null, title: null };
      const data = await res.json() as { country?: string; title?: string };
      return {
        country: data.country?.split('/').pop()?.toUpperCase() ?? null,
        title: data.title ?? null,
      };
    }
    const res = await fetch(`https://lichess.org/api/user/${encodeURIComponent(username)}`);
    if (!res.ok) return { country: null, title: null };
    const data = await res.json() as { profile?: { country?: string }; title?: string };
    const rawCode = data.profile?.country;
    // Lichess uses region-qualified codes for sub-national flags (e.g. "GB-ENG") —
    // take the leading 2-letter country part, same as the single-game fetch does.
    return {
      country: rawCode ? rawCode.split('-')[0]!.toUpperCase() : null,
      title: data.title ?? null,
    };
  } catch {
    return { country: null, title: null };
  }
}

// Shared column template between GameListHeader and every GameCard row so headers
// line up with data — mirrors Chess.com's game-history table (icon | players |
// result | accuracy | moves | date | delete), adapted to the widths this modal has.
// Players is capped (not a growing 1fr) so Result doesn't get pushed far away from
// the names; the flexible column sits right after Players instead, absorbing
// whatever width a wider modal leaves over — which pushes the Result/Accuracy/
// Moves/Date/Delete cluster as a whole toward the right edge, with Delete (the true
// last column, nothing trailing it) landing flush against it. Result/Accuracy/Moves/
// Date are sized to fit their own header *labels* ("ACCURACY" etc.), not just their
// (much narrower) data — that mismatch was what made adjacent headers collide.
const GAME_ROW_GRID_COLS = 'grid-cols-[22px_minmax(0,170px)_1fr_40px_58px_46px_66px_24px]';

// FIDE/provider titles Chess.com and Lichess both surface on their public profile
// APIs. Deliberately excludes non-title statuses either provider's `title` field can
// also return (e.g. Chess.com's "BOT") — those aren't a rank badge and shouldn't be
// styled like one.
const TITLE_LABELS: Record<string, string> = {
  GM: 'Grandmaster',
  WGM: 'Woman Grandmaster',
  IM: 'International Master',
  WIM: 'Woman International Master',
  FM: 'FIDE Master',
  WFM: 'Woman FIDE Master',
  CM: 'Candidate Master',
  WCM: 'Woman Candidate Master',
  NM: 'National Master',
  WNM: 'Woman National Master',
};

function TitleBadge({ title, className = '' }: { title?: string | null; className?: string }) {
  if (!title || !(title in TITLE_LABELS)) return null;
  return (
    <span
      className={`shrink-0 rounded-sm bg-amber-500/90 px-1 py-px text-[10px] font-bold leading-none text-black ${className}`}
      title={TITLE_LABELS[title]}
    >
      {title}
    </span>
  );
}

function GameListHeader() {
  return (
    <div className={`grid ${GAME_ROW_GRID_COLS} items-center gap-x-3 border-b border-white/8 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-gray-600`}>
      <span className="col-start-1" aria-hidden="true" />
      <span className="col-start-2">Players</span>
      <span className="col-start-4 text-center">Result</span>
      <span className="col-start-5 text-center">Accuracy</span>
      <span className="col-start-6 text-center">Moves</span>
      <span className="col-start-7 text-center">Date</span>
      <span className="col-start-8" aria-hidden="true" />
    </div>
  );
}

function GameCard({
  game, onSelect, onDelete, highlightUsername,
}: {
  game: FetchedGame;
  onSelect: () => void;
  onDelete?: () => void;
  /** The Chess.com/Lichess username this list was searched for — only passed for the
   *  Chess.com/Lichess import tabs, never for Saved Analysis, so only there does the
   *  card get a win/loss edge color for that specific player. */
  highlightUsername?: string;
}) {
  // The Moves column shows the move-number count (the game's own move list's first
  // column, e.g. "24") rather than a raw ply count (which would double-count each
  // pair as 2) — a move is "reached" as soon as White plays it, so this rounds up.
  const moveCount = useMemo(() => Math.ceil(countPlies(game.pgn) / 2), [game.pgn]);
  const whiteDigit = game.result === '1-0' ? '1' : game.result === '0-1' ? '0' : '½';
  const blackDigit = game.result === '0-1' ? '1' : game.result === '1-0' ? '0' : '½';
  const whiteAccuracyText = game.whiteAccuracy != null ? game.whiteAccuracy.toFixed(1) : '–';
  const blackAccuracyText = game.blackAccuracy != null ? game.blackAccuracy.toFixed(1) : '–';

  // Only Chess.com/Lichess lists pass highlightUsername, and only a decisive result for
  // that specific player gets the edge color — anything else (Saved Analysis, a draw,
  // or a name that doesn't match either side) gets a transparent (invisible) edge.
  let edgeColorClass = 'border-l-transparent';
  if (highlightUsername) {
    const searched = highlightUsername.trim().toLowerCase();
    const isWhite = game.whiteName.trim().toLowerCase() === searched;
    const isBlack = game.blackName.trim().toLowerCase() === searched;
    const ownResult = isWhite ? game.whiteResult : isBlack ? game.blackResult : undefined;
    const oppResult = isWhite ? game.blackResult : isBlack ? game.whiteResult : undefined;
    if (ownResult === 'win') edgeColorClass = 'border-l-emerald-400';
    else if (oppResult === 'win') edgeColorClass = 'border-l-red-400';
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full border-l-2 ${edgeColorClass} px-2 py-1.5 text-left transition-colors hover:bg-amber-400/[0.04]`}
    >
      {game.label && (
        <div className="mb-1 truncate text-[11px] font-semibold text-gray-400">{game.label}</div>
      )}
      <div className={`grid ${GAME_ROW_GRID_COLS} items-center gap-x-3 gap-y-0.5`}>
        <div className="col-start-1 row-start-1 row-span-2 flex items-center justify-center">
          <TimeClassIcon timeClass={game.timeClass} className="h-4 w-4" />
        </div>

        <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-1">
          <TitleBadge title={game.whiteTitle} />
          <span className="truncate text-[13px] font-medium text-gray-200">{game.whiteName}</span>
          {game.whiteRating !== '' && <span className="shrink-0 text-[11px] text-gray-600 font-mono">({game.whiteRating})</span>}
          {game.whiteCountry && (
            <span
              className={`fi fi-${game.whiteCountry.trim().toLowerCase()} shrink-0 rounded-[1px]`}
              style={{ width: '0.85rem', height: '0.65rem' }}
              title={game.whiteCountry}
            />
          )}
        </div>
        <span className={`col-start-4 row-start-1 text-center text-[12px] font-semibold tabular-nums ${game.result === '1-0' ? 'text-white' : 'text-gray-500'}`}>
          {whiteDigit}
        </span>
        <span className="col-start-5 row-start-1 text-center text-[11px] tabular-nums text-gray-600">{whiteAccuracyText}</span>

        <span className="col-start-6 row-start-1 row-span-2 text-center text-[11px] tabular-nums text-gray-500">{moveCount}</span>
        <span className="col-start-7 row-start-1 row-span-2 text-center text-[11px] tabular-nums text-gray-500">{game.date}</span>
        <span className="col-start-8 row-start-1 row-span-2 flex items-center justify-center">
          {onDelete && (
            <span
              role="button"
              tabIndex={0}
              title="Remove from Saved Analysis"
              onClick={e => { e.stopPropagation(); onDelete(); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onDelete(); } }}
              className="rounded p-1 text-gray-700 transition-colors hover:text-red-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M6.5 1.5a.5.5 0 0 0-.5.5v1H3a.75.75 0 0 0 0 1.5h.28l.63 8.19A2 2 0 0 0 5.9 14.5h4.2a2 2 0 0 0 1.99-1.81l.63-8.19H13A.75.75 0 0 0 13 3h-3v-1a.5.5 0 0 0-.5-.5h-3ZM6 4v8.5a.5.5 0 0 0 1 0V4H6Zm3 0v8.5a.5.5 0 0 0 1 0V4H9Z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </span>

        <div className="col-start-2 row-start-2 flex min-w-0 items-center gap-1">
          <TitleBadge title={game.blackTitle} />
          <span className="truncate text-[13px] font-medium text-gray-300">{game.blackName}</span>
          {game.blackRating !== '' && <span className="shrink-0 text-[11px] text-gray-600 font-mono">({game.blackRating})</span>}
          {game.blackCountry && (
            <span
              className={`fi fi-${game.blackCountry.trim().toLowerCase()} shrink-0 rounded-[1px]`}
              style={{ width: '0.85rem', height: '0.65rem' }}
              title={game.blackCountry}
            />
          )}
        </div>
        <span className={`col-start-4 row-start-2 text-center text-[12px] font-semibold tabular-nums ${game.result === '0-1' ? 'text-white' : 'text-gray-500'}`}>
          {blackDigit}
        </span>
        <span className="col-start-5 row-start-2 text-center text-[11px] tabular-nums text-gray-600">{blackAccuracyText}</span>
      </div>
      {game.opening && (
        <div className="mt-1 truncate pl-[30px] text-[10px] text-gray-600">{game.opening}</div>
      )}
    </button>
  );
}

// A plain `onClick` + target-check on a modal backdrop is the standard "click outside
// to close" pattern, but it's wrong: the native `click` event's target is whatever
// element the mouse *released* over, not where the mousedown started. So starting a
// drag or text selection inside the modal and releasing over the backdrop (e.g. while
// scrolling a long list, or just an imprecise drag) reads as "clicked outside" and
// closes it. Only close when *both* the mousedown and the resulting click land
// directly on the backdrop itself.
function useBackdropClose(onClose: () => void) {
  const mouseDownOnBackdrop = useRef(false);
  return {
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
      mouseDownOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent<HTMLDivElement>) => {
      if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose();
      mouseDownOnBackdrop.current = false;
    },
  };
}

// Escape closing a modal is standard OS/browser dialog behavior, alongside the X/Cancel
// button and (where present) backdrop click — active gates the listener for modals that
// stay mounted in the parent component even while hidden (state-toggled, not unmounted).
function useEscapeClose(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClose]);
}

function ImportModal({
  onClose,
  onImport,
  error,
}: {
  onClose: () => void;
  onImport: (pgn: string, fen: string, meta?: ImportMeta) => void;
  error: string | null;
}) {
  const [tab, setTab] = useState<ImportTab>('mine');
  const [pgn, setPgn] = useState('');
  const [fen, setFen] = useState('');
  const backdropClose = useBackdropClose(onClose);
  useEscapeClose(onClose);
  const [timeClassFilter, setTimeClassFilter] = useState<'all' | TimeClassKey>('all');
  // Reset the filter when switching tabs — a class present in one list may not exist
  // in another, and carrying it over would silently leave the list looking empty.
  useEffect(() => { setTimeClassFilter('all'); }, [tab]);

  const { user } = useAuth();
  const { data: myGames, isLoading: myGamesLoading } = useUserGames();
  const deleteUserGame = useDeleteUserGame();

  const [lichessUser, setLichessUser] = useState('');
  const [lichessGames, setLichessGames] = useState<FetchedGame[]>([]);
  const [lichessLoading, setLichessLoading] = useState(false);
  const [lichessError, setLichessError] = useState<string | null>(null);
  const lichessSkipRef = useRef(0);

  const [ccUser, setCcUser] = useState('');
  const [ccGames, setCcGames] = useState<FetchedGame[]>([]);
  const [ccLoading, setCcLoading] = useState(false);
  const [ccError, setCcError] = useState<string | null>(null);
  const ccMonthBackRef = useRef(0);

  // Country/title lookups are cached per (provider, username) across both the initial
  // load and any "Load more" pages, so the same opponent appearing in several games (or
  // pages) only costs one profile fetch for the life of this modal instance.
  const profileCacheRef = useRef<Map<string, ProviderProfileInfo>>(new Map());
  const isMountedRef = useRef(true);
  useEffect(() => () => { isMountedRef.current = false; }, []);

  function applyCachedProfiles(games: FetchedGame[], provider: 'lichess' | 'chesscom'): FetchedGame[] {
    const cache = profileCacheRef.current;
    return games.map(g => {
      const white = cache.get(`${provider}:${g.whiteName.toLowerCase()}`);
      const black = cache.get(`${provider}:${g.blackName.toLowerCase()}`);
      return {
        ...g,
        whiteCountry: g.whiteCountry ?? white?.country,
        blackCountry: g.blackCountry ?? black?.country,
        whiteTitle: g.whiteTitle ?? white?.title,
        blackTitle: g.blackTitle ?? black?.title,
      };
    });
  }

  // Fires after a batch of games loads — resolves country/title for whichever names in
  // that batch aren't already cached, then patches them into state once they land.
  // Doesn't block the initial render: cards show without a flag/title until this resolves.
  async function enrichGamesWithProfiles(
    provider: 'lichess' | 'chesscom',
    games: FetchedGame[],
    setGames: React.Dispatch<React.SetStateAction<FetchedGame[]>>,
  ) {
    const cache = profileCacheRef.current;
    const names = new Set<string>();
    for (const g of games) {
      names.add(g.whiteName.toLowerCase());
      names.add(g.blackName.toLowerCase());
    }
    const toFetch = Array.from(names).filter(n => n && !cache.has(`${provider}:${n}`));
    if (toFetch.length === 0) {
      setGames(prev => applyCachedProfiles(prev, provider));
      return;
    }
    await Promise.allSettled(toFetch.map(async name => {
      const info = await fetchProviderProfile(provider, name);
      cache.set(`${provider}:${name}`, info);
    }));
    if (!isMountedRef.current) return;
    setGames(prev => applyCachedProfiles(prev, provider));
  }

  // Prefill the last username this signed-in user searched for on each provider,
  // so returning to Import doesn't require retyping (usually their own username).
  useEffect(() => {
    if (!user) return;
    const savedLichess = localStorage.getItem(lastImportUsernameKey('lichess', user.id));
    const savedCc = localStorage.getItem(lastImportUsernameKey('chesscom', user.id));
    if (savedLichess) setLichessUser(prev => prev || savedLichess);
    if (savedCc) setCcUser(prev => prev || savedCc);
  }, [user]);

  async function handleFileUpload(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setPgn(text);
  }

  async function loadLichessGames(reset: boolean) {
    const username = lichessUser.trim();
    if (!username) return;
    setLichessLoading(true);
    setLichessError(null);
    if (reset) lichessSkipRef.current = 0;
    const skip = lichessSkipRef.current;
    try {
      const res = await fetch(
        `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=20&skip=${skip}&pgnInJson=true&tags=true&opening=true&clocks=true&evals=false`,
        { headers: { Accept: 'application/x-ndjson' } }
      );
      if (!res.ok) {
        throw new Error(res.status === 404 ? `"${username}" not found on Lichess` : `Error ${res.status}`);
      }
      if (reset && user) localStorage.setItem(lastImportUsernameKey('lichess', user.id), username);
      const text = await res.text();
      const lines = text.trim().split('\n').filter(Boolean);
      if (reset && lines.length === 0) throw new Error(`No games found for "${username}"`);
      const games: FetchedGame[] = lines.map((line, i) => {
        const g = JSON.parse(line) as Record<string, unknown>;
        const players = (g.players ?? {}) as Record<string, Record<string, unknown>>;
        const w = players.white ?? {};
        const b = players.black ?? {};
        const wUser = w.user as Record<string, unknown> | undefined;
        const bUser = b.user as Record<string, unknown> | undefined;
        const opening = (g.opening as Record<string, unknown> | undefined)?.name as string | undefined;
        const eco = (g.opening as Record<string, unknown> | undefined)?.eco as string | undefined;
        const clock = g.clock as Record<string, unknown> | undefined;
        const winner = g.winner as string | undefined;
        const status = g.status as string | undefined;
        const gameId = (g.id as string) ?? `lich-${skip}-${i}`;
        return {
          id: gameId,
          whiteName: (wUser?.name as string) ?? 'White',
          whiteRating: (w.rating as number) ?? '',
          whiteResult: winner === 'white' ? 'win' : status,
          blackName: (bUser?.name as string) ?? 'Black',
          blackRating: (b.rating as number) ?? '',
          blackResult: winner === 'black' ? 'win' : status,
          result: winner === 'white' ? '1-0' : winner === 'black' ? '0-1' : '½-½',
          date: g.createdAt ? new Date(g.createdAt as number).toLocaleDateString() : '',
          timeClass: g.speed as string | undefined,
          opening,
          pgn: (g.pgn as string) ?? '',
          eco,
          rated: g.rated as boolean | undefined,
          variant: g.variant as string | undefined,
          clockInitial: clock?.initial as number | undefined,
          clockIncrement: clock?.increment as number | undefined,
          sourceGameId: gameId,
          sourceUrl: `https://lichess.org/${gameId}`,
          providerData: g,
        };
      });
      // Advance the pagination cursor by the raw (unfiltered) count so "load more"
      // still lines up with Lichess's own skip parameter — only what's displayed is filtered.
      lichessSkipRef.current = skip + games.length;
      const analyzableGames = games.filter(g => isAnalyzableVariant(g.variant));
      if (reset) setLichessGames(analyzableGames);
      else setLichessGames(prev => [...prev, ...analyzableGames]);
      void enrichGamesWithProfiles('lichess', analyzableGames, setLichessGames);
    } catch (e) {
      setLichessError(e instanceof Error ? e.message : 'Failed to load games');
    } finally {
      setLichessLoading(false);
    }
  }

  async function loadChesscomGames(reset: boolean) {
    const username = ccUser.trim().toLowerCase();
    if (!username) return;
    setCcLoading(true);
    setCcError(null);
    if (reset) ccMonthBackRef.current = 0;
    const monthBack = ccMonthBackRef.current;
    const d = new Date();
    d.setMonth(d.getMonth() - monthBack);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    try {
      const res = await fetch(
        `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${yyyy}/${mm}`
      );
      if (!res.ok) {
        throw new Error(res.status === 404 ? `"${username}" not found on Chess.com` : `Error ${res.status}`);
      }
      if (reset && user) localStorage.setItem(lastImportUsernameKey('chesscom', user.id), username);
      const data = await res.json() as { games?: unknown[] };
      const rawGames = [...(data.games ?? [])].reverse();
      if (reset && rawGames.length === 0) throw new Error(`No games found for "${username}" this month — try loading more`);
      const games: FetchedGame[] = rawGames.map((raw, i) => {
        const g = raw as Record<string, unknown>;
        const w = (g.white ?? {}) as Record<string, unknown>;
        const b = (g.black ?? {}) as Record<string, unknown>;
        const result = w.result === 'win' ? '1-0' : b.result === 'win' ? '0-1' : '½-½';
        const gamePgn = (g.pgn as string) ?? '';
        const opening = gamePgn.match(/\[Opening\s+"([^"]*)"\]/)?.[1] ?? undefined;
        const eco = gamePgn.match(/\[ECO\s+"([^"]*)"\]/)?.[1] ?? undefined;
        const accuracies = g.accuracies as Record<string, unknown> | undefined;
        const timeControl = g.time_control as string | undefined;
        const [tcBase, tcInc] = timeControl?.split('+') ?? [];
        return {
          id: (g.uuid as string) ?? `cc-${yyyy}${mm}-${i}`,
          whiteName: (w.username as string) ?? 'White',
          whiteRating: (w.rating as number) ?? '',
          whiteResult: w.result as string | undefined,
          blackName: (b.username as string) ?? 'Black',
          blackRating: (b.rating as number) ?? '',
          blackResult: b.result as string | undefined,
          result,
          date: g.end_time ? new Date((g.end_time as number) * 1000).toLocaleDateString() : '',
          timeClass: g.time_class as string | undefined,
          opening,
          pgn: gamePgn,
          eco,
          rated: g.rated as boolean | undefined,
          variant: g.rules as string | undefined,
          clockInitial: tcBase && !Number.isNaN(Number(tcBase)) ? Number(tcBase) : undefined,
          clockIncrement: tcInc && !Number.isNaN(Number(tcInc)) ? Number(tcInc) : undefined,
          whiteAccuracy: accuracies?.white as number | undefined,
          blackAccuracy: accuracies?.black as number | undefined,
          sourceGameId: g.uuid as string | undefined,
          sourceUrl: g.url as string | undefined,
          providerData: g,
        };
      });
      ccMonthBackRef.current = monthBack + 1;
      const analyzableGames = games.filter(g => isAnalyzableVariant(g.variant));
      if (reset) setCcGames(analyzableGames);
      else setCcGames(prev => [...prev, ...analyzableGames]);
      void enrichGamesWithProfiles('chesscom', analyzableGames, setCcGames);
    } catch (e) {
      setCcError(e instanceof Error ? e.message : 'Failed to load games');
    } finally {
      setCcLoading(false);
    }
  }

  const isLichess = tab === 'lichess';
  const isSite = tab === 'lichess' || tab === 'chesscom';
  const siteUser = isLichess ? lichessUser : ccUser;
  const setSiteUser = isLichess ? setLichessUser : setCcUser;
  const siteGames = isLichess ? lichessGames : ccGames;
  const siteLoading = isLichess ? lichessLoading : ccLoading;
  const siteError = isLichess ? lichessError : ccError;
  const loadSiteGames = isLichess ? loadLichessGames : loadChesscomGames;
  const hasGames = siteGames.length > 0;

  // A row of filter chips for whichever time classes are actually present in the given
  // list — hidden entirely if there's nothing to filter (0 or 1 distinct class).
  function renderTimeClassFilters(rawTimeClasses: (string | null | undefined)[]) {
    const available = Array.from(new Set(
      rawTimeClasses.map(normalizeTimeClass).filter((k): k is TimeClassKey => k !== null)
    ));
    if (available.length < 2) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setTimeClassFilter('all')}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
            timeClassFilter === 'all' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
          }`}
        >
          All
        </button>
        {available.map(k => (
          <button
            key={k}
            type="button"
            onClick={() => setTimeClassFilter(k)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
              timeClassFilter === k ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            <TimeClassIcon timeClass={k} className="h-3 w-3" />
            {TIME_CLASS_LABELS[k]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onMouseDown={backdropClose.onMouseDown}
      onClick={backdropClose.onClick}
    >
      <div className="mx-4 w-full max-w-[37rem] flex flex-col rounded-2xl border border-white/10 bg-[#14161f] shadow-2xl shadow-black/60 h-[680px] max-h-[85vh]">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-base font-semibold text-white">Import Game</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Source tabs */}
        <div className="shrink-0 flex gap-1 px-4 pb-3 border-b border-white/8">
          {(['mine', 'chesscom', 'lichess', 'pgn'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                tab === t
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {t === 'mine' ? 'Saved Analysis' : t === 'chesscom' ? 'Chess.com' : t === 'lichess' ? 'Lichess' : 'PGN / FEN'}
            </button>
          ))}
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* ── Saved Analysis tab ── */}
          {tab === 'mine' && (
            <div className="h-full p-4 flex flex-col gap-3">
              {!user ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                  <p className="text-sm text-gray-500">Sign in to see games you&apos;ve saved from analysis.</p>
                  <div className="w-full max-w-[260px]">
                    <InlineSignIn />
                  </div>
                </div>
              ) : myGamesLoading ? (
                <div className="flex-1 flex items-center justify-center text-gray-600">
                  <SpinnerIcon className="h-5 w-5" />
                </div>
              ) : !myGames || myGames.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-gray-700">
                    <path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5V5.457c0-.398-.158-.78-.44-1.06L11.063 1.44A1.5 1.5 0 0 0 10.043 1H2.5Z" />
                  </svg>
                  <p className="text-sm text-gray-600">No saved games yet — analyze a game and hit Save to add it here.</p>
                </div>
              ) : (
                <>
                  {renderTimeClassFilters(myGames.map(g => g.time_class))}
                  <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-white/8">
                    <GameListHeader />
                    {/* [&>button:last-child] closes off the bottom of the list with its own
                        border, since the flex-1 container can be taller than its content
                        (few saved games) — without this the last card floats with no edge
                        near it, and only the outer container's border is far below it. */}
                    <div className="divide-y divide-white/5 [&>button:last-child]:border-b [&>button:last-child]:border-white/8">
                      {myGames
                        .filter(g => matchesTimeClassFilter(g.time_class, timeClassFilter))
                        .map(game => {
                          const fetched = userGameToFetchedGame(game);
                          return (
                            <GameCard
                              key={game.id}
                              game={fetched}
                              onSelect={() => onImport(fetched.pgn, fetched.fen ?? '', userGameToImportMeta(game))}
                              onDelete={() => deleteUserGame.mutate(game.id)}
                            />
                          );
                        })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── PGN / FEN tab ── */}
          {tab === 'pgn' && (
            <div className="h-full p-4 flex flex-col gap-3">
              <textarea
                value={pgn}
                onChange={e => setPgn(e.target.value)}
                placeholder={'Paste PGN here...\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...'}
                className="w-full flex-1 min-h-0 resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs leading-5 text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-amber-400/40"
                spellCheck={false}
              />
              <input
                value={fen}
                onChange={e => setFen(e.target.value)}
                placeholder="Optional starting FEN (for non-standard positions)"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 font-mono text-xs text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-amber-400/40"
              />
              {error && <p className="text-xs leading-5 text-red-400">{error}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onImport(pgn, fen, EMPTY_IMPORT_META)}
                  className="flex-1 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-[#0f1117] transition-colors hover:bg-amber-300"
                >
                  Analyze
                </button>
                <label className="cursor-pointer rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:border-white/20 hover:text-white">
                  Upload .pgn
                  <input
                    type="file"
                    accept=".pgn,.txt"
                    className="sr-only"
                    onChange={e => {
                      void handleFileUpload(e.target.files?.[0] ?? null);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          {/* ── Lichess / Chess.com tabs ── */}
          {isSite && (
            <div className="h-full p-4 flex flex-col gap-3">

              {/* Username search bar */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={`Enter ${isLichess ? 'Lichess' : 'Chess.com'} username`}
                  value={siteUser}
                  onChange={e => setSiteUser(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void loadSiteGames(true); }}
                  className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-amber-400/40"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => void loadSiteGames(true)}
                  disabled={siteLoading || !siteUser.trim()}
                  className="shrink-0 flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-[#0f1117] transition-colors hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {siteLoading && !hasGames ? <><SpinnerIcon />Loading</> : 'Load Games'}
                </button>
              </div>

              {/* Error message */}
              {siteError && (
                <p className="text-xs text-red-400 leading-relaxed">{siteError}</p>
              )}

              {/* Empty / hint state */}
              {!siteLoading && !siteError && !hasGames && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-gray-700">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <p className="text-sm text-gray-600">
                    {siteUser.trim()
                      ? 'No games found'
                      : `Enter a ${isLichess ? 'Lichess' : 'Chess.com'} username\nto browse recent games`}
                  </p>
                </div>
              )}

              {/* Games list */}
              {hasGames && (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-600 pt-1">
                    Recent Games — {siteUser}
                  </div>
                  {renderTimeClassFilters(siteGames.map(g => g.timeClass))}
                  <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-white/8">
                    <GameListHeader />
                    <div className="divide-y divide-white/5">
                      {siteGames
                        .filter(g => matchesTimeClassFilter(g.timeClass, timeClassFilter))
                        .map(game => (
                          <GameCard
                            key={game.id}
                            game={game}
                            highlightUsername={siteUser}
                            onSelect={() => onImport(game.pgn, game.fen ?? '', {
                              ...fetchedGameToImportMeta(game, isLichess ? 'lichess' : 'chesscom'),
                              importedUsername: siteUser,
                            })}
                          />
                        ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadSiteGames(false)}
                    disabled={siteLoading}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
                  >
                    {siteLoading ? <><SpinnerIcon />Loading more...</> : 'Load More Games'}
                  </button>
                </>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Knight Arrow ─────────────────────────────────────────────────────────────

function isKnightMove(uci: string): boolean {
  if (uci.length < 4) return false;
  const df = Math.abs(uci.charCodeAt(2) - uci.charCodeAt(0));
  const dr = Math.abs(Number(uci[3]) - Number(uci[1]));
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
}

function KnightArrow({
  from, to, color, boardSize, flipped,
}: {
  from: string; to: string; color: string; boardSize: number; flipped: boolean;
}) {
  const sq = boardSize / 8;
  // Match react-chessboard's arrow style exactly
  const strokeWidth = boardSize / 40;
  const endReducer = boardSize / 32; // how far back from dest center the line ends

  const fromFile = from.charCodeAt(0) - 97;
  const fromRank = Number(from[1]) - 1;
  const toFile = to.charCodeAt(0) - 97;
  const toRank = Number(to[1]) - 1;

  const svgX = (f: number) => (flipped ? 7 - f : f) * sq + sq / 2;
  const svgY = (r: number) => (flipped ? r : 7 - r) * sq + sq / 2;

  const x1 = svgX(fromFile);
  const y1 = svgY(fromRank);
  const x2 = svgX(toFile);
  const y2 = svgY(toRank);

  const df = Math.abs(toFile - fromFile);
  const dr = Math.abs(toRank - fromRank);

  // Corner: travel the longer leg first, then the shorter leg
  const cx = dr >= df ? x1 : x2;
  const cy = dr >= df ? y2 : y1;

  // Shorten last segment by endReducer, matching react-chessboard's line shortening
  const dx = x2 - cx;
  const dy = y2 - cy;
  const segLen = Math.sqrt(dx * dx + dy * dy);
  const ex = cx + dx * (segLen - endReducer) / segLen;
  const ey = cy + dy * (segLen - endReducer) / segLen;

  const markerId = `knight-${from}${to}`;

  return (
    <svg
      width={boardSize}
      height={boardSize}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="2"
          markerHeight="2.5"
          refX="1.25"
          refY="1.25"
          orient="auto"
        >
          <polygon points="0.3 0, 2 1.25, 0.3 2.5" fill={color} />
        </marker>
      </defs>
      <path
        d={`M ${x1} ${y1} L ${cx} ${cy} L ${ex} ${ey}`}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="butt"
        opacity={0.65}
        markerEnd={`url(#${markerId})`}
      />
    </svg>
  );
}

// Move-quality badge overlaid on the board itself, at the current ply's destination
// square — always shown (unlike MoveChip's move-list badge, which hides book/excellent/
// good/best). Same absolute-overlay pattern as KnightArrow above: an inert boardSize x
// boardSize layer, sibling to (not inside) the board's own overflow-hidden wrapper, so the
// badge can overhang the square's corner like chess.com/Chessigma without getting clipped.
function MoveBoardBadge({
  square, category, boardSize, flipped,
}: {
  square: string; category: GameReviewCategory; boardSize: number; flipped: boolean;
}) {
  const sq = boardSize / 8;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  const badgeSize = Math.max(29, Math.min(50, Math.round(sq * 0.72)));
  // Nudged in from the square's exact corner toward its center (by a fraction of the
  // badge's own size, so it scales naturally) — sitting right on the corner read as too
  // detached from the piece it's badging.
  const inset = badgeSize * 0.3;
  const cx = col * sq + sq - inset;
  const cy = row * sq + inset;

  return (
    <div
      style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: boardSize, height: boardSize, pointerEvents: 'none',
      }}
    >
      <div style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%, -50%)' }}>
        <MoveClassificationIcon category={category} size={badgeSize} className="shadow-[0_1px_4px_rgba(0,0,0,0.5)]" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// useSearchParams() requires a Suspense boundary in the App Router (otherwise the whole
// route de-opts out of static rendering and Next warns/fails the production build) — the
// actual page content is unchanged, just wrapped one level down.
export default function AnalysisPage() {
  return (
    <Suspense fallback={null}>
      <AnalysisPageContent />
    </Suspense>
  );
}

// Every named opening's move sequence — static, shared across every game any session
// imports, so fetched at most once per page load rather than per-import (see
// computeBookPlyCount below for how it's used to prefix-match a played game against theory).
let openingPositionSansCache: Promise<string[][]> | null = null;
function loadOpeningPositionSans(): Promise<string[][]> {
  if (!openingPositionSansCache) openingPositionSansCache = getAllOpeningPositionSans();
  return openingPositionSansCache;
}

function AnalysisPageContent() {
  const [analyzedGame, setAnalyzedGame] = useState<AnalyzedGame | null>(null);
  const [currentPlyIndex, setCurrentPlyIndex] = useState(-1);
  const [lastMoveSquares, setLastMoveSquares] = useState<{ from: string; to: string } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [engineProgress, setEngineProgress] = useState(0);
  const [engineError, setEngineError] = useState<string | null>(null);
  const enginePoolRef = useRef<AnalysisWorkerPool | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>('explore');
  const [coachByPly, setCoachByPly] = useState<Map<number, CoachFeedback | null>>(new Map());
  const [boardSize, setBoardSize] = useState(480);
  const [maxBoardWidth, setMaxBoardWidth] = useState<number | undefined>(undefined);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const activeExploreMoveRef = useRef<HTMLButtonElement | null>(null);
  const [engineSettingsOpen, setEngineSettingsOpen] = useState(false);
  const engineSettingsRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user has ever manually adjusted the engine-lines slider this
  // session — until they do, the count auto-defaults contextually (see the effect
  // below), so it stops overriding their choice the moment they express one.
  const [engineLinesTouched, setEngineLinesTouched] = useState(false);
  const [exploreTree, setExploreTree] = useState<ExploreTree | null>(null);
  const [exploreNav, setExploreNav] = useState<ExploreNav>({ lineId: null, plyIndex: -1 });
  const [moveContextMenu, setMoveContextMenu] = useState<{ x: number; y: number; lineId: string; plyIndex: number } | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [baseFen, setBaseFen] = useState<string | null>(null);
  const [positionMode, setPositionMode] = useState<'fen' | 'pgn'>('pgn');
  const [positionText, setPositionText] = useState('');
  const [positionDirty, setPositionDirty] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);
  const positionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [gameDetails, setGameDetails] = useState<GameDetails>(EMPTY_GAME_DETAILS);
  const [rawPgn, setRawPgn] = useState('');
  const [whiteAvatar, setWhiteAvatar] = useState<string | null>(null);
  const [blackAvatar, setBlackAvatar] = useState<string | null>(null);
  const [whiteCountry, setWhiteCountry] = useState<string | null>(null);
  const [blackCountry, setBlackCountry] = useState<string | null>(null);
  const [whiteTitle, setWhiteTitle] = useState<string | null>(null);
  const [blackTitle, setBlackTitle] = useState<string | null>(null);
  const [showGameDetailsModal, setShowGameDetailsModal] = useState(false);
  const [gameDetailsDraft, setGameDetailsDraft] = useState<GameDetails>(EMPTY_GAME_DETAILS);
  // User-editable label distinguishing saved copies of the same game — DB-only
  // metadata, never embedded in the pgn text (unlike gameDetails' PGN header fields).
  const [analysisLabel, setAnalysisLabel] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [showNewAnalysisModal, setShowNewAnalysisModal] = useState(false);
  const [importMeta, setImportMeta] = useState<ImportMeta>(EMPTY_IMPORT_META);
  const [showSaveAuthPrompt, setShowSaveAuthPrompt] = useState(false);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSaveAsMenu, setShowSaveAsMenu] = useState(false);
  const saveAsMenuRef = useRef<HTMLDivElement>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const overwriteConfirmBackdrop = useBackdropClose(() => setShowOverwriteConfirm(false));
  const newAnalysisModalBackdrop = useBackdropClose(() => setShowNewAnalysisModal(false));
  useEscapeClose(() => setShowGameDetailsModal(false), showGameDetailsModal);
  useEscapeClose(() => setShowOverwriteConfirm(false), showOverwriteConfirm);
  useEscapeClose(() => setShowNewAnalysisModal(false), showNewAnalysisModal);
  useEscapeClose(() => setShowSaveAuthPrompt(false), showSaveAuthPrompt);

  useEffect(() => {
    if (!showSaveAsMenu) return;
    function onPointerDown(e: MouseEvent) {
      if (saveAsMenuRef.current && !saveAsMenuRef.current.contains(e.target as Node)) setShowSaveAsMenu(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showSaveAsMenu]);
  const { user } = useAuth();
  const saveUserGame = useSaveUserGame();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlGameId = searchParams.get('id') ?? undefined;
  const { data: ownedUrlGame, isFetched: ownedUrlGameFetched } = useUserGameById(urlGameId);
  // Passing undefined (not urlGameId) while signed out disables the fetch entirely — the
  // point of requiresSignInForUrl below is that a signed-out visitor gets nothing back at
  // all, not just an unrendered response; a real network fetch still returning the full
  // game to the client would defeat the gate even if the UI never displays it.
  const { data: sharedUrlGame, isFetched: sharedUrlGameFetched } = useSharedUserGame(user ? urlGameId : undefined);
  // Every /analysis?id=... open requires being signed in — own game or someone else's
  // shared link, doesn't matter (RLS's "Anyone can view any game by id" policy doesn't
  // distinguish; the gate is enforced here, app-side). Plain /analysis (no id — pasting a
  // PGN, Open Analysis) is unaffected and stays fully usable while signed out, matching
  // the rest of the app's try-before-signup pattern.
  const requiresSignInForUrl = !!urlGameId && !user;
  const [urlLoadNotFound, setUrlLoadNotFound] = useState(false);
  const [pendingUrlPosition, setPendingUrlPosition] = useState<{ move: number; line: number; flip: boolean | null } | null>(null);
  const { theme, animationDuration, settings, setSettings } = useBoardSettings();
  const { settings: coachSettings } = useCoachSettings();
  const customPieces = useMemo(() => getCustomPieces(settings.pieceSetId), [settings.pieceSetId]);

  // Default engine-line count is contextual: 1 line for an imported/pasted game (the
  // best-move-recommendation section below already surfaces the single top line, so
  // a busy 2-3 line panel isn't the useful default there), 2 for open/blank-position
  // analysis (unchanged from before). Only the *default* is contextual — the moment
  // the user drags the Lines slider themselves, engineLinesTouched flips true and
  // this stops overriding their explicit choice for the rest of the session.
  useEffect(() => {
    if (engineLinesTouched) return;
    const isImportedGame = analyzedGame !== null && analyzedGame.moves.length > 0;
    setSettings({ engineLines: isImportedGame ? 1 : 2 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzedGame, engineLinesTouched]);

  // Cap board size to the available horizontal space so the board shrinks instead
  // of clipping when the viewport is narrow (e.g. DevTools open). The centered
  // layout is preserved at full width, restoring the gap beside the right panel.
  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      // SidePanel: w-104 (416px) at <lg, lg:w-114 (456px) at ≥1024px viewport
      const sideW = window.innerWidth >= 1024 ? 456 : 416;
      const max = Math.max(100, el.clientWidth - 24 - sideW - 12 - 36); // pad(2×12) + side + gap(12) + evalBar(36)
      setMaxBoardWidth(max);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Stable refs so callbacks don't go stale
  const analyzedGameRef = useRef<AnalyzedGame | null>(null);
  analyzedGameRef.current = analyzedGame;
  const currentPlyRef = useRef(-1);
  currentPlyRef.current = currentPlyIndex;
  const totalMovesRef = useRef(0);
  totalMovesRef.current = analyzedGame?.moves.length ?? 0;
  const exploreTreeRef = useRef<ExploreTree | null>(null);
  exploreTreeRef.current = exploreTree;
  const isEngineRunningRef = useRef(false);
  isEngineRunningRef.current = isEngineRunning;
  const moveSoundEnabledRef = useRef(settings.moveSound);
  moveSoundEnabledRef.current = settings.moveSound;

  // Primes/keeps the move-sound AudioContext alive across the same user gestures
  // PracticeBoard listens for, so the very first move's click isn't silently dropped
  // by the browser's autoplay-gesture requirement.
  useEffect(() => {
    if (!settings.moveSound) return;

    const unlock = () => unlockMoveSound(settings.moveSound);
    const unlockWhenVisible = () => {
      if (document.visibilityState === 'visible') unlockMoveSound(settings.moveSound);
    };
    const keepAwake = () => keepMoveSoundAwake(settings.moveSound);
    const listenerOptions: AddEventListenerOptions = { passive: true, capture: true };
    const keyListenerOptions: AddEventListenerOptions = { capture: true };

    window.addEventListener('pointerdown', keepAwake, listenerOptions);
    window.addEventListener('pointerup', unlock, listenerOptions);
    window.addEventListener('pointercancel', stopMoveSoundWake, listenerOptions);
    window.addEventListener('keydown', unlock, keyListenerOptions);
    window.addEventListener('focus', unlock);
    document.addEventListener('visibilitychange', unlockWhenVisible);

    return () => {
      stopMoveSoundWake();
      window.removeEventListener('pointerdown', keepAwake, { capture: true });
      window.removeEventListener('pointerup', unlock, { capture: true });
      window.removeEventListener('pointercancel', stopMoveSoundWake, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
      window.removeEventListener('focus', unlock);
      document.removeEventListener('visibilitychange', unlockWhenVisible);
    };
  }, [settings.moveSound]);

  const goTo = useCallback((plyIndex: number, game?: AnalyzedGame) => {
    const g = game ?? analyzedGameRef.current;
    if (!g) return;
    const clamped = Math.max(-1, Math.min(plyIndex, g.moves.length - 1));
    if (clamped !== currentPlyRef.current) {
      playMoveOrCaptureSound(moveSoundEnabledRef.current, clamped >= 0 && isCaptureSan(g.moves[clamped]?.san));
    }
    setCurrentPlyIndex(clamped);

    // Move the explore cursor along the tree's main line instead of discarding the
    // whole tree — this used to unconditionally null exploreTree on every call, so
    // pressing Next/Previous (or an arrow key) after branching in the Explore tab
    // silently threw the branch away before the user ever got to Save.
    const tree = exploreTreeRef.current;
    if (tree) {
      const mainLine = tree.lines.find(l => l.parentLineId === null);
      const mainClamped = mainLine ? Math.max(-1, Math.min(clamped, mainLine.moves.length - 1)) : -1;
      setExploreNav({ lineId: mainLine?.id ?? null, plyIndex: mainClamped });
    } else {
      setExploreNav({ lineId: null, plyIndex: -1 });
    }

    if (clamped >= 0) {
      const move = g.moves[clamped];
      if (move?.beforeFen) {
        try {
          const chess = new Chess(move.beforeFen);
          const result = chess.move(move.san);
          setLastMoveSquares(result ? { from: result.from, to: result.to } : null);
        } catch {
          setLastMoveSquares(null);
        }
      } else {
        setLastMoveSquares(null);
      }
    } else {
      setLastMoveSquares(null);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (isEngineRunningRef.current) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(currentPlyRef.current - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(currentPlyRef.current + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo(-1);
      } else if (e.key === 'End') {
        e.preventDefault();
        goTo(totalMovesRef.current - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo]);

  useEffect(() => {
    if (!engineSettingsOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (engineSettingsRef.current && !engineSettingsRef.current.contains(e.target as Node)) {
        setEngineSettingsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [engineSettingsOpen]);

  const currentFen = useMemo(() => {
    if (!analyzedGame) return baseFen ?? INITIAL_FEN;
    if (currentPlyIndex < 0) return analyzedGame.initialFen ?? INITIAL_FEN;
    return analyzedGame.moves[currentPlyIndex]?.afterFen ?? INITIAL_FEN;
  }, [analyzedGame, currentPlyIndex, baseFen]);

  // Derived from exploreTree — placed here because they depend on currentFen.
  // isExploring specifically means "sitting on a played move" (a real ply to step
  // back from) — used to gate the Back button. hasExploreLine is broader: true the
  // moment a tree exists and nav points at any line in it, *including* that line's
  // own root (plyIndex -1). The two used to be conflated under one flag, which broke
  // the board/clock the instant navigation returned to a tree's root — at that exact
  // point currentPlyIndex (frozen since the tree was first created; see goTo/tryMove/
  // navGoBack etc., none of which touch it once a tree exists) would silently take
  // back over as the position source, showing a stale, unrelated ply's fen and clock
  // instead of the actual start of the line.
  const isExploring = exploreTree !== null && exploreNav.plyIndex >= 0;
  const hasExploreLine = exploreTree !== null && exploreNav.lineId !== null;
  // True only when actually standing on a *branch* line (a genuine divergence from the
  // tree's own main line) — narrower than hasExploreLine, which is also true while just
  // browsing the main line via the tree (e.g. after playing a move that happened to match
  // history, which still seeds/uses exploreTree). Used to decide when Imported Game mode's
  // arrow/best-move section should fall back to live engine data instead of the
  // precomputed "what was the best move here" history, since only a real branch lacks that
  // precomputed data — plain main-line tree browsing still has it.
  const isOnBranch = exploreTree !== null && exploreNav.lineId !== null && exploreNav.lineId !== exploreTree.lines[0]?.id;

  // The real current ply for indexing analyzedGame.moves, whether or not a tree exists.
  // currentPlyIndex itself freezes the instant a tree is created (goTo/tryMove/navGoForward
  // etc. all move exploreNav instead once one exists, per isExploring's comment above) — so
  // reading currentPlyIndex directly once hasExploreLine is true means permanently reusing
  // whatever move was on screen at that exact moment (e.g. every "best move" lookup silently
  // sticking to the game's first move forever). Line 0 mirrors analyzedGame.moves 1:1 by ply
  // (see buildSeedTree), so exploreNav.plyIndex is the correct substitute while browsing it.
  const activeMainLinePlyIndex = hasExploreLine ? exploreNav.plyIndex : currentPlyIndex;

  function getNavFen(tree: ExploreTree | null, nav: ExploreNav, fallback: string): string {
    if (!tree || !nav.lineId) return fallback;
    const line = tree.lines.find(l => l.id === nav.lineId);
    if (!line) return fallback;
    if (nav.plyIndex < 0) return getLineStartFen(tree, line);
    return line.moves[nav.plyIndex]?.fen ?? fallback;
  }
  const freeExploreFen = hasExploreLine ? getNavFen(exploreTree, exploreNav, currentFen) : null;

  function getLastExploreMove(tree: ExploreTree | null, nav: ExploreNav): { san: string; prevFen: string } | null {
    if (!tree || !nav.lineId || nav.plyIndex < 0) return null;
    const line = tree.lines.find(l => l.id === nav.lineId);
    if (!line) return null;
    const move = line.moves[nav.plyIndex];
    if (!move) return null;
    const startFen = getLineStartFen(tree, line);
    const prevFen = nav.plyIndex === 0 ? startFen : (line.moves[nav.plyIndex - 1]?.fen ?? startFen);
    return { san: move.san, prevFen };
  }
  const lastExploreMove = getLastExploreMove(exploreTree, exploreNav);

  // Every position already covered by the initial deep analysis — whether reached via
  // the flat Review tab, or by browsing the Explore tab's *unmodified* main line —
  // has a pre-computed eval keyed by its resulting fen, so it should show instantly
  // instead of re-running live analysis. Only genuinely new positions (an actual
  // branch/deviation the user created) fall through to the live engine below.
  // Keyed by fen rather than currentPlyIndex because currentPlyIndex only tracks the
  // flat Review-tab position — clicking around the Explore tab's tree only moves
  // exploreNav, so a ply-indexed lookup would freeze on a stale value the moment
  // exploring starts.
  const analyzedFenEvalMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!analyzedGame) return map;
    for (const move of analyzedGame.moves) {
      if (move.hasEngineAnalysis && move.afterFen) map.set(move.afterFen, move.afterPlayedEvalCp);
    }
    return map;
  }, [analyzedGame]);

  const currentEvalCp = useMemo(
    () => analyzedFenEvalMap.get(freeExploreFen ?? currentFen),
    [analyzedFenEvalMap, freeExploreFen, currentFen]
  );

  const gameReviewReport = useMemo(() => {
    if (!analyzedGame) return null;
    return buildGameReviewReport(analyzedGame);
  }, [analyzedGame]);

  const hasEngineAnalysis = useMemo(
    () => Boolean(analyzedGame?.moves.some(move => move.hasEngineAnalysis)),
    [analyzedGame]
  );


  function handleImport(pgn: string, fen: string, meta: ImportMeta = EMPTY_IMPORT_META) {
    try {
      const game = buildAnalyzedGameFromPgn({
        id: `game-${Date.now()}`,
        pgn,
        initialFen: fen.trim() || undefined,
      });
      setAnalyzedGame(game);
      setBaseFen(null);
      setCurrentPlyIndex(-1);

      // Restore branches from a previous Save (see serializeExploreTree/parseMovetextToTree)
      // instead of always starting flat — otherwise every branch made in the Explore tab
      // would silently vanish the moment the game is reimported.
      let importedTree: ExploreTree | null = null;
      if (pgnHasVariations(pgn)) {
        try {
          const rootFen = fen.trim() || INITIAL_FEN;
          const tree = parseMovetextToTree(extractPgnMovetext(pgn), rootFen);
          if (tree.lines[0] && tree.lines[0].moves.length > 0) importedTree = tree;
        } catch { /* fall back to the flat (no-tree) import below */ }
      }
      setExploreTree(importedTree);
      setExploreNav(importedTree ? { lineId: importedTree.lines[0]!.id, plyIndex: -1 } : { lineId: null, plyIndex: -1 });
      setLastMoveSquares(null);
      setParseError(null);
      setEngineError(null);
      setCoachByPly(new Map());
      setShowImportModal(false);
      setActiveTab('review');
      setImportMeta(meta);
      const parsedDetails = parsePgnHeaders(pgn);
      setGameDetails(parsedDetails);
      setRawPgn(pgn);
      setWhiteAvatar(meta.whiteAvatar ?? null);
      setBlackAvatar(meta.blackAvatar ?? null);
      setWhiteCountry(meta.whiteCountry ?? null);
      setBlackCountry(meta.blackCountry ?? null);
      setWhiteTitle(meta.whiteTitle ?? null);
      setBlackTitle(meta.blackTitle ?? null);
      setAnalysisLabel(meta.label ?? '');

      // Orient the board with the imported Lichess/Chess.com user's pieces at the
      // bottom — that's the "my games" perspective people expect when reviewing
      // their own games, regardless of which color they played.
      if (meta.importedUsername) {
        const searched = meta.importedUsername.trim().toLowerCase();
        if (searched && parsedDetails.black.trim().toLowerCase() === searched) {
          setSettings({ flipBoard: true });
        } else if (searched && parsedDetails.white.trim().toLowerCase() === searched) {
          setSettings({ flipBoard: false });
        }
      }

      if (game.moves.length > 0) void runStockfish(game);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not parse that PGN/FEN.');
    }
  }

  // ─── Public, refresh-safe URL (?id=&move=&line=&flip=) ───────────────────────
  // Mirrors Chess.com's analysis URLs: /analysis?id=<uuid>&move=<ply>&line=<index>&flip=1.
  // Every saved game is reachable by its id (no per-game private/shared toggle — see the
  // "Anyone can view any game by id" RLS policy's comment; an id is an unguessable UUID,
  // not a public listing). A privilege/subscription gate on *viewing* someone else's link
  // is planned but doesn't exist yet — not implemented here. `line` is an *index* into
  // exploreTree.lines, not a lineId — lineIds are random per parse (crypto.randomUUID
  // in buildSeedTree/parseMovetextToTree) and wouldn't mean anything to a different
  // session loading the same saved PGN fresh; the index is stable because
  // parseMovetextToTree is a pure function of the PGN text.

  // One-time: kick off loading the game named in the URL, if any (tries the owner-scoped
  // fetch and the public/shared fetch in parallel above; whichever resolves with data wins).
  // The owner-scoped query is disabled entirely (useUserGameById's `enabled: !!user`) for
  // a signed-out visitor, so it never reaches isFetched — only wait on it when there's
  // actually a user for it to run for, or "not found" would never fire for signed-out
  // visitors opening a real shared link.
  const urlLoadStartedRef = useRef(false);
  const urlFetchesSettled = user ? ownedUrlGameFetched && sharedUrlGameFetched : sharedUrlGameFetched;
  useEffect(() => {
    // Waits out requiresSignInForUrl rather than resolving it as "not found" — the shared
    // fetch is disabled while signed out (see useSharedUserGame call above), so
    // urlFetchesSettled would never actually go true here anyway; this guard just makes
    // that intentional instead of an accident of the disabled-query plumbing.
    if (urlLoadStartedRef.current || !urlGameId || requiresSignInForUrl) return;
    const game = ownedUrlGame ?? sharedUrlGame;
    if (game) {
      urlLoadStartedRef.current = true;
      handleImport(game.pgn, game.fen ?? '', userGameToImportMeta(game));
      const moveParam = searchParams.get('move');
      const lineParam = searchParams.get('line');
      const flipParam = searchParams.get('flip');
      setPendingUrlPosition({
        move: moveParam !== null ? Number(moveParam) : -1,
        line: lineParam !== null ? Number(lineParam) : 0,
        flip: flipParam !== null ? (flipParam === '1' || flipParam === 'true') : null,
      });
    } else if (urlFetchesSettled) {
      // Both the owner-scoped and public lookups came back empty — the id doesn't
      // exist, or it does but isn't shared and this viewer isn't the owner. RLS makes
      // those two cases indistinguishable from here, which is intentional (see
      // getSharedUserGameById's comment) — same "not found" message either way.
      urlLoadStartedRef.current = true;
      setUrlLoadNotFound(true);
    }
  }, [urlGameId, ownedUrlGame, sharedUrlGame, urlFetchesSettled, requiresSignInForUrl, searchParams]);

  // Once the freshly-imported game has actually landed in state, apply the position
  // pending from the URL — handleImport always resets to the start of the game first,
  // so this has to happen as a follow-up, not inline with the load above.
  useEffect(() => {
    if (!pendingUrlPosition || !analyzedGame || analyzedGame.moves.length === 0) return;
    const { move, line, flip } = pendingUrlPosition;
    if (flip !== null) setSettings({ flipBoard: flip });
    if (Number.isFinite(move) && move >= -1) {
      if (line > 0 && exploreTree?.lines[line]) {
        navigateTo(exploreTree.lines[line]!.id, move);
      } else {
        goTo(move);
      }
    }
    setPendingUrlPosition(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUrlPosition, analyzedGame, exploreTree]);

  // Keep the URL in sync with the live position — what makes refreshing not lose
  // everything, and what a Share/copy-link action just reads off window.location.
  // Skipped while a URL-driven load is still applying its target position
  // (pendingUrlPosition), so it can't stomp that target with an intermediate state.
  useEffect(() => {
    if (pendingUrlPosition) return;
    if (!importMeta.savedGameId) return;
    const params = new URLSearchParams();
    params.set('id', importMeta.savedGameId);
    const plyIndex = hasExploreLine ? exploreNav.plyIndex : currentPlyIndex;
    if (plyIndex >= 0) params.set('move', String(plyIndex));
    if (hasExploreLine && exploreTree && exploreNav.lineId) {
      const lineIndex = exploreTree.lines.findIndex(l => l.id === exploreNav.lineId);
      if (lineIndex > 0) params.set('line', String(lineIndex));
    }
    if (settings.flipBoard) params.set('flip', '1');
    const nextQuery = params.toString();
    if (nextQuery !== searchParams.toString()) {
      router.replace(`${pathname}?${nextQuery}`, { scroll: false });
    }
  }, [
    pendingUrlPosition, importMeta.savedGameId, currentPlyIndex, hasExploreLine,
    exploreNav, exploreTree, settings.flipBoard, pathname, router, searchParams,
  ]);

  // Save always overwrites the currently-loaded Saved Analysis entry in place, so
  // gate it behind a confirmation — otherwise clicking Save could silently clobber
  // a previous analysis the user didn't mean to touch yet.
  function handleSaveGame(asNew = false) {
    // The isDirty gate only applies to the regular Save (matches its disabled state —
    // nothing new to persist) — Save As should stay usable even with no changes, since
    // deliberately forking an unmodified copy is still a meaningful action.
    if (!asNew && !isDirty) return;
    if (!asNew && importMeta.savedGameId) {
      setShowOverwriteConfirm(true);
      return;
    }
    performSaveGame(asNew);
  }

  function performSaveGame(asNew: boolean) {
    const pgn = currentPgn;
    if (!pgn) return;

    if (!user) {
      setShowSaveAuthPrompt(true);
      return;
    }

    setSaveError(null);

    // "Save As" always forks a brand-new row (see sourceGameId note below) — the fork
    // needs its own label so it's distinguishable from the original in the Saved
    // Analysis list even before the user renames it via Game Details.
    const label = asNew
      ? (analysisLabel.trim()
          ? `${analysisLabel.trim()} (copy)`
          : `${gameDetails.white || 'White'} vs ${gameDetails.black || 'Black'} (copy)`)
      : (analysisLabel.trim() || undefined);

    const initialFen = exploreTree
      ? (exploreTree.rootFen !== INITIAL_FEN ? exploreTree.rootFen : undefined)
      : analyzedGame?.initialFen && analyzedGame.initialFen !== INITIAL_FEN
        ? analyzedGame.initialFen
        : (baseFen && baseFen !== INITIAL_FEN ? baseFen : undefined);

    saveUserGame.mutate({
      id: asNew ? undefined : importMeta.savedGameId,
      dedupeBySource: !asNew,
      pgn,
      fen: initialFen,
      white: gameDetails.white || undefined,
      whiteElo: gameDetails.whiteElo || undefined,
      whiteResult: importMeta.whiteResult,
      whiteAvatarUrl: whiteAvatar ?? undefined,
      whiteCountry: whiteCountry ?? undefined,
      whiteTitle: whiteTitle ?? undefined,
      black: gameDetails.black || undefined,
      blackElo: gameDetails.blackElo || undefined,
      blackResult: importMeta.blackResult,
      blackAvatarUrl: blackAvatar ?? undefined,
      blackCountry: blackCountry ?? undefined,
      blackTitle: blackTitle ?? undefined,
      result: gameDetails.result && gameDetails.result !== '*' ? gameDetails.result : undefined,
      termination: gameDetails.termination || undefined,
      event: gameDetails.event || undefined,
      round: gameDetails.round || undefined,
      site: gameDetails.location || undefined,
      eco: gameDetails.eco || importMeta.eco || undefined,
      openingName: importMeta.openingName,
      timeControl: gameDetails.timeControl || undefined,
      timeClass: importMeta.timeClass,
      clockInitialSeconds: importMeta.clockInitial,
      clockIncrementSeconds: importMeta.clockIncrement,
      rated: importMeta.rated,
      variant: importMeta.variant,
      whiteAccuracy: importMeta.whiteAccuracy,
      blackAccuracy: importMeta.blackAccuracy,
      playedDate: gameDetails.date || undefined,
      source: importMeta.source,
      // "Save As" always plain-inserts (see dedupeBySource above) but user_games still
      // has a `unique (user_id, source, source_game_id)` constraint from the normal
      // upsert-dedupe path — carrying over the same sourceGameId as the row we're
      // forking from would violate it. Omit it for the fork (NULLs don't collide in a
      // unique constraint); the fork becomes its own standalone saved analysis and
      // stops tracking back to the provider game for future re-sync/upsert purposes.
      sourceGameId: asNew ? undefined : importMeta.sourceGameId,
      sourceUrl: importMeta.sourceUrl,
      providerData: importMeta.providerData,
      importedUsername: importMeta.importedUsername,
      label,
    }, {
      onSuccess: (saved) => {
        if (saved) setImportMeta(prev => ({ ...prev, savedGameId: saved.id }));
        setSavedBaselinePgn(pgn);
        if (asNew) setAnalysisLabel(label ?? '');
        setSavedBaselineLabel(label ?? '');
        setSaveConfirmed(true);
        setTimeout(() => setSaveConfirmed(false), 1500);
      },
      onError: (error) => {
        // Supabase/Postgrest errors are plain objects (not Error instances), so
        // `instanceof Error` alone missed them and always showed the generic fallback
        // — exactly the kind of failure (e.g. a constraint violation) worth surfacing.
        const message =
          typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message: unknown }).message === 'string'
            ? (error as { message: string }).message
            : 'Failed to save. Please try again.';
        setSaveError(message);
      },
    });
  }

  function clearAnalysis() {
    setAnalyzedGame(null);
    setCurrentPlyIndex(-1);
    setExploreTree(null);
    setExploreNav({ lineId: null, plyIndex: -1 });
    setBaseFen(null);
    setLastMoveSquares(null);
    setSelectedSquare(null);
    setCoachByPly(new Map());
    setPositionText('');
    setPositionDirty(false);
    setPositionError(null);
    setParseError(null);
    setGameDetails(EMPTY_GAME_DETAILS);
    setRawPgn('');
    setWhiteAvatar(null);
    setBlackAvatar(null);
    setWhiteCountry(null);
    setBlackCountry(null);
    setWhiteTitle(null);
    setBlackTitle(null);
    setImportMeta(EMPTY_IMPORT_META);
    setAnalysisLabel('');
    setActiveTab('explore');
    setShowNewAnalysisModal(false);
    setUrlLoadNotFound(false);
    setPendingUrlPosition(null);
    urlLoadStartedRef.current = false;
    if (searchParams.toString()) router.replace(pathname, { scroll: false });
  }

  function handleNewAnalysis() {
    const hasContent = analyzedGame !== null || exploreTree !== null || baseFen !== null;
    if (!hasContent) { clearAnalysis(); return; }
    setShowNewAnalysisModal(true);
  }

  // Book detection: matches the played move *sequence* against every named opening's own
  // sans[] from opening_positions (the same table useOpeningName queries), not the exact
  // position each ply lands on. lichess-org/chess-openings only assigns a new row where a
  // name actually changes — e.g. after 1.e4 g6 2.d4, black hasn't committed to a specific
  // reply yet, so that exact 3-ply position has no row of its own even though it's still
  // theory (several rows — "Modern Defense: Standard Line", "...Norwegian Defense", etc. —
  // all have sans starting with exactly [e4, g6, d4]). So: book continues for as long as
  // the moves played so far are a *prefix* of at least one named line's sans, and ends at
  // the first ply that breaks every remaining candidate — i.e. the first genuine deviation
  // from theory, not the first position lacking its own distinct name.
  // Static lichess-org/chess-openings data, already in Supabase, no live Lichess calls —
  // and a table the Openings section's own course content (openings_catalog/opening_lines)
  // never touches, so this can't affect that data. Supplements (never shrinks) whatever
  // buildAnalyzedGameFromPgn's ECOUrl-header parsing already set, so a tagged Chess.com
  // import that's already correct is left alone.
  async function computeBookPlyCount(moves: AnalyzedGameMove[]): Promise<number> {
    const allSans = await loadOpeningPositionSans();
    const playedSans = moves.map(m => m.san);
    let candidates = allSans;
    let count = 0;
    for (let i = 0; i < playedSans.length; i++) {
      candidates = candidates.filter(sans => sans.length > i && sans[i] === playedSans[i]);
      if (candidates.length === 0) break;
      count++;
    }
    return count;
  }

  // No cancellation flag here on purpose — Strict Mode's dev-only double-invoke (mount,
  // cleanup, mount again) would poison a per-invocation `cancelled` flag from the first
  // invocation's spurious cleanup while the ref-based dedup below blocks the second
  // invocation from ever starting a fresh request, silently dropping the result every
  // time. Staleness is instead checked once, where it actually matters, inside the
  // updater against the *current* state at resolution time (prev.id !== gameId) — correct
  // regardless of how many times the effect itself was invoked.
  const bookCheckedGameIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!analyzedGame || analyzedGame.moves.length === 0) return;
    if (bookCheckedGameIdRef.current === analyzedGame.id) return;
    bookCheckedGameIdRef.current = analyzedGame.id;
    const gameId = analyzedGame.id;
    computeBookPlyCount(analyzedGame.moves)
      .then(bookPlyCount => {
        if (bookPlyCount <= 0) return;
        setAnalyzedGame(prev => {
          if (!prev || prev.id !== gameId) return prev;
          let changed = false;
          const moves = prev.moves.map((m, i) => {
            if (i < bookPlyCount && !m.isBookMove) { changed = true; return { ...m, isBookMove: true }; }
            return m;
          });
          return changed ? { ...prev, moves } : prev;
        });
      })
      .catch(() => { /* offline/unreachable — keep whatever ECOUrl parsing already set */ });
  }, [analyzedGame]);

  async function runStockfish(gameOverride?: AnalyzedGame) {
    const game = gameOverride ?? analyzedGame;
    if (!game || isEngineRunning) return;
    setIsEngineRunning(true);
    setEngineProgress(0);
    setEngineError(null);

    let pool: AnalysisWorkerPool;
    try {
      pool = await AnalysisWorkerPool.create(workerPoolSize());
      enginePoolRef.current = pool;
    } catch {
      setEngineError('Failed to initialize analysis engines.');
      setIsEngineRunning(false);
      return;
    }

    const moves = [...game.moves];
    const enriched: AnalyzedGameMove[] = new Array(moves.length);
    let completed = 0;

    try {
      await Promise.all(
        moves.map(async (move, i) => {
          if (pool.terminated) return;
          enriched[i] = await enrichGameMove(move, pool, STOCKFISH_DEPTH, moves[i - 1]?.beforeFen);
          if (!pool.terminated) {
            completed++;
            setEngineProgress(completed / moves.length);
          }
        })
      );

      if (!pool.terminated) {
        // Merge onto the *latest* state (via the ref, always synchronously current — unlike
        // reading analyzedGame back out of a just-called setState) rather than blindly
        // overwriting with `enriched`, which was built from `game`'s snapshot at the moment
        // this function started. The book-detection effect below runs concurrently and (being
        // faster, a single Supabase round-trip vs. a full engine pass) usually finishes first;
        // committing `enriched` outright would silently discard whatever isBookMove it had
        // just set, since enrichGameMove only carries forward the isBookMove each move already
        // had *in that stale snapshot*.
        const latest = analyzedGameRef.current;
        const mergedMoves = enriched.map((e, i) => ({
          ...e,
          isBookMove: (latest?.id === game.id ? latest.moves[i]?.isBookMove : undefined) || e.isBookMove,
        }));
        const enrichedGame: AnalyzedGame = { ...game, moves: mergedMoves };
        setAnalyzedGame(enrichedGame);

        const byPly = new Map<number, CoachFeedback | null>();
        for (const move of enrichedGame.moves) {
          try {
            const feedbacks = buildGameAnalysisCoachFeedbackFromAnalyzedGameMove({
              game: enrichedGame,
              move,
              persona: coachSettings.persona,
            });
            byPly.set(move.plyIndex, feedbacks[0] ?? null);
          } catch {
            byPly.set(move.plyIndex, null);
          }
        }
        setCoachByPly(byPly);
        goTo(currentPlyRef.current, enrichedGame);
      }
    } catch (error) {
      if (!pool.terminated) {
        setEngineError(error instanceof Error ? error.message : 'Engine analysis failed.');
      }
    } finally {
      pool.terminate();
      enginePoolRef.current = null;
      setIsEngineRunning(false);
    }
  }

  const totalMoves = analyzedGame?.moves.length ?? 0;
  const canGoBack = analyzedGame !== null && currentPlyIndex >= 0;
  const canGoForward = analyzedGame !== null && currentPlyIndex < totalMoves - 1;

  // Navigation helpers — Explore tab navigates the variation tree; other tabs navigate the analyzed game.
  // Disabled outright while the post-import engine pass is still running (isEngineRunning):
  // moves.length is already final at that point, but per-move data (eval, classification,
  // bestMoveSan) fills in progressively, so jumping ahead mid-analysis would land on
  // positions whose badges/recommendation haven't been computed yet.
  const navCanGoBack = !isEngineRunning && (isExploring || canGoBack);
  const navCanGoForward = !isEngineRunning && (() => {
    if (!exploreTree || !exploreNav.lineId || exploreNav.plyIndex < 0) return canGoForward;
    const line = exploreTree.lines.find(l => l.id === exploreNav.lineId);
    if (!line) return false;
    if (exploreNav.plyIndex < line.moves.length - 1) return true;
    // At a branch's last move, Next now exits it (see navGoForward) — the main line
    // itself has nowhere further to go, same as before.
    return line.parentLineId !== null;
  })();

  function navGoFirst() {
    if (isEngineRunning) return;
    if (exploreTree && exploreNav.lineId) {
      const mainLine = exploreTree.lines[0]!;
      // Landing at plyIndex -1 (the root) is never a move, so always the quiet sound.
      if (mainLine.id !== exploreNav.lineId || exploreNav.plyIndex !== -1) playMoveOrCaptureSound(settings.moveSound, false);
      setExploreNav({ lineId: mainLine.id, plyIndex: -1 });
      setLastMoveSquares(null);
    } else {
      goTo(-1);
    }
  }

  function navGoBack() {
    if (isEngineRunning) return;
    if (!exploreTree || !exploreNav.lineId || exploreNav.plyIndex < 0) {
      goTo(currentPlyIndex - 1);
      return;
    }
    const currentLine = exploreTree.lines.find(l => l.id === exploreNav.lineId)!;
    if (exploreNav.plyIndex > 0) {
      const newPly = exploreNav.plyIndex - 1;
      const entry = currentLine.moves[newPly];
      playMoveOrCaptureSound(settings.moveSound, isCaptureSan(entry?.san));
      setExploreNav({ lineId: currentLine.id, plyIndex: newPly });
      if (entry) setLastMoveSquares({ from: entry.from, to: entry.to });
    } else {
      // plyIndex === 0 — go to parent or root
      if (currentLine.parentLineId === null) {
        playMoveOrCaptureSound(settings.moveSound, false);
        setExploreNav({ lineId: currentLine.id, plyIndex: -1 });
        setLastMoveSquares(null);
      } else {
        const parentPly = currentLine.divergeAtPly - 1;
        const parentLine = exploreTree.lines.find(l => l.id === currentLine.parentLineId);
        const entry = parentPly >= 0 ? parentLine?.moves[parentPly] : null;
        playMoveOrCaptureSound(settings.moveSound, isCaptureSan(entry?.san));
        setExploreNav({ lineId: currentLine.parentLineId, plyIndex: parentPly });
        if (entry) setLastMoveSquares({ from: entry.from, to: entry.to });
        else setLastMoveSquares(null);
      }
    }
  }

  function navGoForward() {
    if (isEngineRunning) return;
    if (!exploreTree || !exploreNav.lineId || exploreNav.plyIndex < 0) {
      goTo(currentPlyIndex + 1);
      return;
    }
    const currentLine = exploreTree.lines.find(l => l.id === exploreNav.lineId)!;
    const nextPly = exploreNav.plyIndex + 1;
    const entry = currentLine.moves[nextPly];
    if (entry) {
      playMoveOrCaptureSound(settings.moveSound, isCaptureSan(entry.san));
      setExploreNav({ lineId: currentLine.id, plyIndex: nextPly });
      setLastMoveSquares({ from: entry.from, to: entry.to });
      return;
    }
    // At the last move of a branch (not the main line, which has nowhere further to go
    // — same as before) — exit back to the position right before this branch started,
    // symmetric to navGoBack's exit at a branch's first move.
    if (currentLine.parentLineId === null) return;
    const parentPly = currentLine.divergeAtPly - 1;
    const parentLine = exploreTree.lines.find(l => l.id === currentLine.parentLineId);
    const parentEntry = parentPly >= 0 ? parentLine?.moves[parentPly] : null;
    playMoveOrCaptureSound(settings.moveSound, isCaptureSan(parentEntry?.san));
    setExploreNav({ lineId: currentLine.parentLineId, plyIndex: parentPly });
    if (parentEntry) setLastMoveSquares({ from: parentEntry.from, to: parentEntry.to });
    else setLastMoveSquares(null);
  }

  function navGoLast() {
    if (isEngineRunning) return;
    if (exploreTree && exploreNav.lineId) {
      const currentLine = exploreTree.lines.find(l => l.id === exploreNav.lineId);
      if (currentLine && currentLine.moves.length > 0) {
        const lastPly = currentLine.moves.length - 1;
        const entry = currentLine.moves[lastPly];
        if (lastPly !== exploreNav.plyIndex) playMoveOrCaptureSound(settings.moveSound, isCaptureSan(entry?.san));
        setExploreNav({ lineId: currentLine.id, plyIndex: lastPly });
        if (entry) setLastMoveSquares({ from: entry.from, to: entry.to });
      }
    } else {
      goTo(totalMoves - 1);
    }
  }

  // Close context menu on any outside click, or Escape
  useEffect(() => {
    if (!moveContextMenu) return;
    const close = () => setMoveContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [moveContextMenu]);

  function handleMakeMainLine(lineId: string, plyIndex: number) {
    if (!exploreTree) return;
    const activePath = getActivePath(exploreTree, { lineId, plyIndex });
    const newTree = promoteToMainLine(exploreTree, lineId);
    const mainLine = newTree.lines.find(l => l.parentLineId === null)!;
    const newPlyIndex = Math.max(0, activePath.length - 1);
    setExploreTree(newTree);
    setExploreNav({ lineId: mainLine.id, plyIndex: newPlyIndex });
    const entry = mainLine.moves[newPlyIndex];
    if (entry) setLastMoveSquares({ from: entry.from, to: entry.to });
    setMoveContextMenu(null);
  }

  function handleDeleteFromHere(lineId: string, fromPly: number) {
    if (!exploreTree) return;
    const originalLine = exploreTree.lines.find(l => l.id === lineId)!;
    const newTree = deleteFromHere(exploreTree, lineId, fromPly);
    const lineStillExists = newTree.lines.some(l => l.id === lineId);
    let newNav: ExploreNav;
    if (!lineStillExists || fromPly === 0) {
      if (originalLine.parentLineId) {
        const parentPly = Math.max(-1, originalLine.divergeAtPly - 1);
        newNav = { lineId: originalLine.parentLineId, plyIndex: parentPly };
      } else {
        newNav = { lineId: newTree.lines[0]?.id ?? null, plyIndex: -1 };
      }
    } else {
      newNav = { lineId: lineId, plyIndex: fromPly - 1 };
    }
    const mainEmpty = newTree.lines.length === 1 && newTree.lines[0]!.moves.length === 0;
    if (newTree.lines.length === 0 || mainEmpty) {
      setExploreTree(null);
      setExploreNav({ lineId: null, plyIndex: -1 });
      setLastMoveSquares(null);
    } else {
      setExploreTree(newTree);
      setExploreNav(newNav);
      const navLine = newTree.lines.find(l => l.id === newNav.lineId);
      const navEntry = newNav.plyIndex >= 0 ? navLine?.moves[newNav.plyIndex] : null;
      if (navEntry) setLastMoveSquares({ from: navEntry.from, to: navEntry.to });
      else setLastMoveSquares(null);
    }
    setMoveContextMenu(null);
  }

  // Keep positionText in sync with the board. Board changes always win over user-typed text —
  // the user's draft is only "committed" via the Load button.
  useEffect(() => {
    if (positionMode === 'fen') {
      setPositionText(freeExploreFen ?? currentFen);
      setPositionError(null);
      return;
    }
    // PGN mode — reconstruct a PGN from the active path in the variation tree
    try {
      if (exploreTree) {
        const rootFen = exploreTree.rootFen;
        // Use the full path from root to current position (respects branches)
        const activeMoves = getActivePath(exploreTree, exploreNav);
        const source = activeMoves.length > 0 ? activeMoves : (exploreTree.lines[0]?.moves ?? []);
        if (source.length > 0) {
          const chess = new Chess(rootFen);
          for (const entry of source) chess.move(entry.san);
          const movesOnly = chess.pgn().replace(/^\[.*?\]\r?\n?/gm, '').replace(/\s*\*\s*$/, '').trim();
          setPositionText(rootFen !== INITIAL_FEN ? `[FEN "${rootFen}"]\n\n${movesOnly}` : movesOnly);
          setPositionError(null);
          setPositionDirty(false);
          return;
        }
      }
      if (analyzedGame && analyzedGame.moves.length > 0) {
        const initFen = analyzedGame.initialFen;
        const chess = initFen ? new Chess(initFen) : new Chess();
        // Only replay up to the currently selected ply so the textbox tracks navigation
        const upTo = currentPlyIndex >= 0 ? currentPlyIndex + 1 : 0;
        for (const move of analyzedGame.moves.slice(0, upTo)) chess.move(move.san);
        const movesOnly = chess.pgn().replace(/^\[.*?\]\r?\n?/gm, '').replace(/\s*\*\s*$/, '').trim();
        setPositionText(
          initFen && initFen !== INITIAL_FEN
            ? `[FEN "${initFen}"]\n\n${movesOnly}`
            : movesOnly
        );
      } else {
        setPositionText('');
      }
    } catch {
      setPositionText(freeExploreFen ?? currentFen);
    }
    setPositionError(null);
    setPositionDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeExploreFen, currentFen, positionMode, exploreTree, exploreNav, analyzedGame, currentPlyIndex]);

  useEffect(() => {
    const el = positionTextareaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [positionText]);

  useEffect(() => {
    activeExploreMoveRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [exploreNav]);

  function handlePositionLoad() {
    const text = positionText.trim();
    if (!text) return;

    if (positionMode === 'fen') {
      try {
        new Chess(text);
        setBaseFen(text);
        setAnalyzedGame(null);
        setCurrentPlyIndex(-1);
        setExploreTree(null);
        setExploreNav({ lineId: null, plyIndex: -1 });
        setLastMoveSquares(null);
        setCoachByPly(new Map());
        setPositionError(null);
        setPositionDirty(false);
        setGameDetails(EMPTY_GAME_DETAILS);
        setRawPgn('');
        setWhiteAvatar(null);
        setBlackAvatar(null);
        setWhiteCountry(null);
        setBlackCountry(null);
        setWhiteTitle(null);
        setBlackTitle(null);
        setImportMeta(EMPTY_IMPORT_META);
        setAnalysisLabel('');
      } catch {
        setPositionError('Invalid FEN');
      }
    } else {
      try {
        const fenMatch = text.match(/\[FEN\s+"([^"]+)"\]/);
        const extractedFen = fenMatch?.[1];
        const game = buildAnalyzedGameFromPgn({
          id: `game-${Date.now()}`,
          pgn: text,
          initialFen: extractedFen,
        });
        setAnalyzedGame(game);
        setBaseFen(null);
        setCurrentPlyIndex(game.moves.length - 1);
        if (game.moves.length > 0) {
          const lastMove = game.moves[game.moves.length - 1]!;
          try {
            const c = new Chess(lastMove.beforeFen);
            const result = c.move(lastMove.san);
            setLastMoveSquares(result ? { from: result.from, to: result.to } : null);
          } catch { setLastMoveSquares(null); }
        } else {
          setLastMoveSquares(null);
        }
        setExploreTree(null);
        setExploreNav({ lineId: null, plyIndex: -1 });
        setCoachByPly(new Map());
        setPositionError(null);
        setPositionDirty(false);
        setGameDetails(parsePgnHeaders(text));
        setRawPgn(text);
        setWhiteAvatar(null);
        setBlackAvatar(null);
        setWhiteCountry(null);
        setBlackCountry(null);
        setWhiteTitle(null);
        setBlackTitle(null);
        setImportMeta(EMPTY_IMPORT_META);
        setAnalysisLabel('');
      } catch {
        setPositionError('Invalid PGN');
      }
    }
  }

  // boardFen is the FEN actually shown and analyzed — follows game navigation unless the
  // user has played a move freely, in which case freeExploreFen takes over.
  const boardFen = freeExploreFen ?? currentFen;
  const openingPosition = useOpeningName(boardFen);

  // Daily/correspondence games (days-per-move, not a real countdown clock) — move
  // timing there reflects real-world elapsed days, not a chess clock, so skip showing
  // per-move times entirely for them. Bullet/Blitz/Rapid are unaffected.
  const hideMoveClocks = importMeta.timeClass === 'daily' || importMeta.timeClass === 'correspondence';

  // Parse clock annotations from the raw PGN once per game load.
  const pgnClocks = useMemo(
    () => (hideMoveClocks ? [] : parsePgnClocks(rawPgn)),
    [rawPgn, hideMoveClocks]
  );
  // Verbatim (unrounded) per-ply clock text, carried into the explore tree (see
  // buildSeedTree) so it round-trips through a Save/reload unchanged.
  const pgnRawClocks = useMemo(
    () => (hideMoveClocks ? [] : parsePgnRawClocks(rawPgn)),
    [rawPgn, hideMoveClocks]
  );

  // Material captured by each side at the current board position.
  const material = useMemo(() => computeMaterial(boardFen), [boardFen]);

  // Per-color clock at the current ply. Before either side has moved, show the full
  // starting time (from the provider's clock config, falling back to the PGN's own
  // TimeControl header) instead of leaving it blank.
  const playerClocks = useMemo(() => {
    if (hideMoveClocks) return { w: null, b: null };
    const startingClocks = () => {
      const startSeconds = importMeta.clockInitial ?? parseTimeControlSeconds(gameDetails.timeControl);
      const startClock = formatClockSeconds(startSeconds);
      return { w: startClock, b: startClock };
    };
    // Navigating inside a branch moves exploreNav, not currentPlyIndex (which stays
    // pinned wherever it was when the tree was first created — nothing that navigates
    // an existing tree, including returning to a line's own root, ever updates it) —
    // reading the top-level pgnClocks array by currentPlyIndex here was why the clock
    // froze the instant a branch was created. getActivePath walks the full path (main
    // line prefix + branch moves) so this stays correct however deep the branch goes,
    // and returns [] at a line's root (ply -1), which is exactly when the starting
    // clock should show — not whatever stale ply currentPlyIndex is still pointing at.
    if (hasExploreLine && exploreTree) {
      const path = getActivePath(exploreTree, exploreNav);
      return path.length === 0 ? startingClocks() : getClocksAtPath(path);
    }
    if (currentPlyIndex < 0) return startingClocks();
    return getClocksAtPly(pgnClocks, currentPlyIndex);
  }, [pgnClocks, currentPlyIndex, importMeta.clockInitial, gameDetails.timeControl, hideMoveClocks, hasExploreLine, exploreTree, exploreNav]);

  // The pgn Save would currently write — derived purely from the actual loaded game
  // state (exploreTree / rawPgn / analyzedGame / baseFen + gameDetails), never from
  // the FEN/PGN position textbox itself. That box is just a staging area for input;
  // typing in it, or even clicking Load, isn't what makes an update — only a resulting
  // change to the game's actual position/moves or details does, and that's judged by
  // comparing this computed pgn against savedBaselinePgn, not by tracking that an
  // action happened. Kept as a memo so both the Save button's dirty-check and the
  // actual save (performSaveGame) reuse one computation rather than drifting apart.
  const currentPgn = useMemo(() => {
    let pgn = '';
    try {
      if (exploreTree) {
        // Serialize the *whole* tree (every branch), not just whichever line is
        // currently navigated — otherwise Save silently drops every branch except
        // the one the user happened to be viewing when they clicked it.
        const movesOnly = serializeExploreTree(exploreTree);
        if (movesOnly) {
          pgn = exploreTree.rootFen !== INITIAL_FEN
            ? `[FEN "${exploreTree.rootFen}"]\n\n${movesOnly}`
            : movesOnly;
        }
      } else if (rawPgn.trim()) {
        pgn = rawPgn.trim();
      } else if (analyzedGame && analyzedGame.moves.length > 0) {
        const chess = new Chess(analyzedGame.initialFen ?? INITIAL_FEN);
        for (const move of analyzedGame.moves) chess.move(move.san);
        pgn = chess.pgn().replace(/^\[.*?\]\r?\n?/gm, '').replace(/\s*\*\s*$/, '').trim();
      } else if (baseFen && baseFen !== INITIAL_FEN) {
        // A custom starting position was loaded (FEN mode + Load) but no moves have
        // been played yet — the standard starting position doesn't count (that's
        // indistinguishable from a blank New Analysis).
        pgn = `[FEN "${baseFen}"]\n\n*`;
      }
    } catch { /* ignore */ }
    if (!pgn) return '';
    try {
      return applyGameDetailsToPgn(pgn, gameDetails);
    } catch {
      return pgn;
    }
  }, [exploreTree, rawPgn, analyzedGame, baseFen, gameDetails]);

  // The pgn/label as of the last successful save (or the freshly-imported game, if
  // never saved) — Save is only meaningful once either drifts from this baseline.
  const [savedBaselinePgn, setSavedBaselinePgn] = useState('');
  const [savedBaselineLabel, setSavedBaselineLabel] = useState('');
  useEffect(() => {
    setSavedBaselinePgn(currentPgn);
    setSavedBaselineLabel(analysisLabel);
    // Only reset the baseline when a *new* game is loaded (analyzedGame.id changes on
    // every import) — not on every keystroke, which would make currentPgn === baseline
    // forever and Save would never enable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzedGame?.id]);

  // Nothing to save if the pgn is empty, or (once tied to a saved entry) nothing has
  // changed since import/last save — a brand-new, never-saved analysis is always
  // considered save-able since that first Save is the meaningful "add to library" action.
  const isDirty = currentPgn !== '' && (
    !importMeta.savedGameId || currentPgn !== savedBaselinePgn || analysisLabel !== savedBaselineLabel
  );

  // Fetch player avatar + country from the source provider's public API when a game
  // is imported. Source is detected from importMeta (set when importing via the modal)
  // and falls back to the PGN's own Site tag so a manually-pasted provider PGN still works.
  const isChesscomGame = importMeta.source === 'chesscom' || gameDetails.location.toLowerCase().includes('chess.com');
  const isLichessGame = importMeta.source === 'lichess' || gameDetails.location.toLowerCase().includes('lichess');

  // Imported Game mode vs Open Analysis mode — determines whether the board arrow (and
  // the best-move section) show "what was the best move here" (a real imported game's
  // own history) or "what's the best move to play next" (free/open exploration). New
  // Analysis always resets to Open Analysis; reloading a Saved Analysis that started as
  // an open (manual/pasted) session stays Open Analysis too, since importMeta.source is
  // persisted with the save — only a game whose source really is Lichess/Chess.com (and,
  // later, in-app matchmaking) counts, regardless of whether it ended in a decisive result.
  const isImportedGameMode = isChesscomGame || isLichessGame;

  useEffect(() => {
    if (!isChesscomGame && !isLichessGame) return;
    const controller = new AbortController();

    const fetchChesscomProfile = async (
      username: string,
      setAvatar: (url: string | null) => void,
      setCountry: (code: string | null) => void,
      setTitle: (title: string | null) => void,
    ) => {
      if (!username) return;
      try {
        const res = await fetch(
          `https://api.chess.com/pub/player/${username.toLowerCase()}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json() as { avatar?: string; country?: string; title?: string };
        setAvatar(data.avatar ?? null);
        setCountry(data.country?.split('/').pop()?.toUpperCase() ?? null);
        setTitle(data.title ?? null);
      } catch { /* ignore — network or CORS failure */ }
    };

    const fetchLichessProfile = async (
      username: string,
      setCountry: (code: string | null) => void,
      setTitle: (title: string | null) => void,
    ) => {
      if (!username) return;
      try {
        const res = await fetch(
          `https://lichess.org/api/user/${encodeURIComponent(username)}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json() as { profile?: { country?: string }; title?: string };
        const rawCode = data.profile?.country;
        // Lichess uses region-qualified codes for sub-national flags (e.g. "GB-ENG") —
        // take the leading 2-letter country part.
        setCountry(rawCode ? rawCode.split('-')[0]!.toUpperCase() : null);
        setTitle(data.title ?? null);
      } catch { /* ignore — network or CORS failure */ }
    };

    // Skip the live re-fetch for a player whose avatar/country/title was already
    // restored from a previous Save (importMeta) — trusts persisted data instead of
    // depending on a fresh network round-trip every time a saved game is reloaded.
    if (isChesscomGame) {
      if (!importMeta.whiteAvatar) fetchChesscomProfile(gameDetails.white, setWhiteAvatar, setWhiteCountry, setWhiteTitle);
      if (!importMeta.blackAvatar) fetchChesscomProfile(gameDetails.black, setBlackAvatar, setBlackCountry, setBlackTitle);
    } else {
      // Lichess has no avatar/profile-picture feature — only country/title are available.
      if (!importMeta.whiteCountry) fetchLichessProfile(gameDetails.white, setWhiteCountry, setWhiteTitle);
      if (!importMeta.blackCountry) fetchLichessProfile(gameDetails.black, setBlackCountry, setBlackTitle);
    }
    return () => controller.abort();
  }, [
    // analyzedGame?.id is included so this effect re-runs on every import even when
    // re-importing the exact same game back-to-back — gameDetails/importMeta would
    // otherwise be value-identical to the previous render (React skips effects whose
    // deps didn't change), which previously left a freshly-reset avatar/country stuck
    // at null forever since the live re-fetch below never got a chance to run.
    analyzedGame?.id,
    gameDetails.white, gameDetails.black, isChesscomGame, isLichessGame,
    importMeta.whiteAvatar, importMeta.blackAvatar, importMeta.whiteCountry, importMeta.blackCountry,
  ]);
  const [extendKey, setExtendKey] = useState(0);

  // Reset extend key whenever the position changes so each new FEN starts fresh at 8s.
  const prevBoardFenRef = useRef(boardFen);
  useEffect(() => {
    if (prevBoardFenRef.current !== boardFen) {
      prevBoardFenRef.current = boardFen;
      setExtendKey(0);
    }
  }, [boardFen]);

  const legalTargets = useMemo(() => {
    if (!selectedSquare) return [];
    try {
      return new Chess(boardFen).moves({
        square: selectedSquare as Parameters<Chess['moves']>[0]['square'],
        verbose: true,
      });
    } catch {
      return [];
    }
  }, [selectedSquare, boardFen]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMoveSquares) {
      styles[lastMoveSquares.from] = { background: 'rgba(255, 210, 0, 0.35)' };
      styles[lastMoveSquares.to] = { background: 'rgba(255, 210, 0, 0.52)' };
    }
    if (selectedSquare) {
      styles[selectedSquare] = { background: '#D8A548' };
      for (const move of legalTargets) {
        const base = styles[move.to] ?? {};
        styles[move.to] = move.captured
          ? { ...base, background: 'radial-gradient(circle, rgba(0,0,0,0) 61%, rgba(32,32,32,0.45) 63%, rgba(32,32,32,0.45) 73%, rgba(0,0,0,0) 75%)', borderRadius: '50%' }
          : { ...base, background: 'radial-gradient(circle, rgba(36,40,50,0.42) 22%, rgba(0,0,0,0) 24%)' };
      }
    }
    return styles;
  }, [lastMoveSquares, selectedSquare, legalTargets]);

  // The on-board badge shows every classification (unlike the move-list, which hides
  // book/excellent/good/best) — gated on isOnBranch (not hasExploreLine), since
  // hasExploreLine is also true while just browsing the tree's own main line, and those
  // are still real analyzed moves that should keep their badge. currentPlyIndex stays
  // pinned at the branch point once exploring (see hasExploreLine usages above), so once
  // a tree exists the actual current ply on the main line comes from exploreNav.plyIndex
  // instead (line 0's moves mirror analyzedGame.moves 1:1 — see buildSeedTree). Genuine
  // branch moves (MoveEntry) don't carry engine classification data to show, hence isOnBranch.
  const currentBoardBadge = useMemo(() => {
    if (isOnBranch || !analyzedGame || !lastMoveSquares || activeMainLinePlyIndex < 0) return null;
    const move = analyzedGame.moves[activeMainLinePlyIndex];
    if (!move) return null;
    const category = getAnalyzedGameMoveReviewCategory(move);
    return category ? { square: lastMoveSquares.to, category } : null;
  }, [isOnBranch, analyzedGame, activeMainLinePlyIndex, lastMoveSquares]);

  const moveBadgeOverlay = useMemo(() => {
    if (!currentBoardBadge) return null;
    return (
      <MoveBoardBadge
        square={currentBoardBadge.square}
        category={currentBoardBadge.category}
        boardSize={boardSize}
        flipped={settings.flipBoard}
      />
    );
  }, [currentBoardBadge, boardSize, settings.flipBoard]);

  const { lines, bestMoveUci, evalCp: liveEvalCp, depth, isAnalyzing, isDone } = usePositionAnalysis(
    boardFen,
    extendKey,
    settings.engineLines,
    settings.engineMoveTime * 1000,
    settings.engineEnabled,
  );

  // Stable token cache — holds the last successfully-rendered PV tokens per line index.
  // When pvUci resets to [] between positions, we show these stale tokens so the
  // container height never collapses (preventing the "trembling" layout shift).
  const stableEngineTokensRef = useRef<PvToken[][]>([]);

  // Priority: analyzed game data → live Stockfish eval → INITIAL_EVAL_CP at start position.
  const displayEvalCp = currentEvalCp ?? liveEvalCp ?? (currentPlyIndex <= -1 ? INITIAL_EVAL_CP : undefined);

  // Explore/deviation coach: once depth ≥ 12, compare played move vs engine best.
  const exploreCoach = useMemo((): CoachFeedback | null => {
    if (!lastExploreMove || !bestMoveUci || !depth || depth < 12) return null;
    try {
      const chess = new Chess(lastExploreMove.prevFen);
      const bestMove = chess.move({
        from: bestMoveUci.slice(0, 2),
        to: bestMoveUci.slice(2, 4),
        promotion: (bestMoveUci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n',
      });
      const bestSan = bestMove?.san ?? bestMoveUci;
      const isMatch = lastExploreMove.san === bestSan;
      return {
        id: 'explore',
        event: { eventType: isMatch ? 'best' : 'inaccuracy', moveIndex: 0 },
        tone: isMatch ? 'positive' : 'warning',
        label: isMatch ? 'Best' : 'Suboptimal',
        title: isMatch
          ? `${lastExploreMove.san} is the best move`
          : `${lastExploreMove.san} · engine prefers ${bestSan}`,
        message: isMatch
          ? "You found the engine's top choice for this position."
          : `${bestSan} leads to a stronger position according to the engine.`,
        variables: {},
      } as unknown as CoachFeedback;
    } catch {
      return null;
    }
  }, [lastExploreMove, bestMoveUci, depth]);

  // Active coach: review tab on main game line → pre-computed text.
  // Explore tab or deviations → depth-triggered explore coach.
  const activeCoach = useMemo((): CoachFeedback | null => {
    if (activeTab === 'review' && !freeExploreFen) {
      return coachByPly.get(currentPlyIndex) ?? null;
    }
    return exploreCoach;
  }, [activeTab, freeExploreFen, coachByPly, currentPlyIndex, exploreCoach]);

  // In Imported Game mode (Lichess/Chess.com), the board arrow shows what WAS the best
  // move at the position that was actually selected — the same recommendation
  // BestMoveSection shows — instead of the live engine's best move to play *next* from
  // wherever the board currently sits. That live behavior is what Open Analysis mode
  // always uses, and what Imported Game mode also falls back to the moment the user is
  // genuinely on a branch (isOnBranch), since a hypothetical branch position has no
  // precomputed "what was played here" history to compare against — plain main-line tree
  // browsing (isOnBranch false) still has it, so the mode itself never "switches" just
  // because exploreTree exists. A book-classified move draws no arrow at all: an engine
  // preferring something else at that point doesn't make the book move wrong, just a
  // different (equally fine) way into the same theory. Same for a move that already WAS
  // the engine's top choice (rec.san === move.san, per getBestMoveRecommendation) — the
  // arrow would just retrace the move already highlighted as the last move played, so it's
  // suppressed rather than drawn on top of itself.
  const displayBestMoveUci = useMemo(() => {
    if (!isImportedGameMode || isOnBranch || !analyzedGame || activeMainLinePlyIndex < 0) {
      return bestMoveUci;
    }
    const move = analyzedGame.moves[activeMainLinePlyIndex];
    const rec = getBestMoveRecommendation(move);
    if (!rec || rec.category === 'book' || !move?.beforeFen || rec.san === move.san) return null;
    try {
      const chess = new Chess(move.beforeFen);
      const result = chess.move(rec.san);
      return result ? `${result.from}${result.to}${result.promotion ?? ''}` : null;
    } catch {
      return null;
    }
  }, [isImportedGameMode, isOnBranch, analyzedGame, activeMainLinePlyIndex, bestMoveUci]);

  // Blue while genuinely on a branch (live "best next move," same as Open Analysis) so
  // it reads visually distinct from the green "what was actually best here" shown for a
  // real Imported Game position or regular Open Analysis browsing.
  const bestMoveArrowColor = isOnBranch ? 'rgb(59, 130, 246)' : 'rgb(22, 163, 74)';

  const bestMoveArrow = useMemo(
    () =>
      !settings.hideArrows && displayBestMoveUci && displayBestMoveUci.length >= 4 && !isKnightMove(displayBestMoveUci)
        ? [[displayBestMoveUci.slice(0, 2), displayBestMoveUci.slice(2, 4), bestMoveArrowColor]]
        : [],
    [displayBestMoveUci, settings.hideArrows, bestMoveArrowColor]
  );

  const knightArrowOverlay = useMemo(() => {
    if (settings.hideArrows || !displayBestMoveUci || !isKnightMove(displayBestMoveUci)) return null;
    return (
      <KnightArrow
        from={displayBestMoveUci.slice(0, 2)}
        to={displayBestMoveUci.slice(2, 4)}
        color={bestMoveArrowColor}
        boardSize={boardSize}
        flipped={settings.flipBoard}
      />
    );
  }, [displayBestMoveUci, boardSize, settings.flipBoard, settings.hideArrows, bestMoveArrowColor]);

  // Feeds BestMoveSection — mirrors displayBestMoveUci's own mode/branch logic exactly so
  // the section and the arrow never disagree: precomputed history for a real Imported Game
  // position, live engine data (same source the arrow/eval bar use) for Open Analysis or a
  // genuine branch. Live mode has no "was this good" history to compare against, so it's
  // always reported as the engine's current top choice rather than classified by loss.
  const activeBestMoveRecommendation = useMemo((): BestMoveRecommendation | null => {
    if (isImportedGameMode && !isOnBranch) {
      if (!analyzedGame || activeMainLinePlyIndex < 0) return null;
      return getBestMoveRecommendation(analyzedGame.moves[activeMainLinePlyIndex]);
    }
    if (!bestMoveUci || bestMoveUci.length < 4) return null;
    try {
      const chess = new Chess(boardFen);
      const result = chess.move({
        from: bestMoveUci.slice(0, 2),
        to: bestMoveUci.slice(2, 4),
        promotion: (bestMoveUci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n',
      });
      return result ? { san: result.san, evalCp: lines[0]?.evalCp ?? liveEvalCp ?? undefined, category: 'best' } : null;
    } catch {
      return null;
    }
  }, [isImportedGameMode, isOnBranch, analyzedGame, activeMainLinePlyIndex, bestMoveUci, boardFen, lines, liveEvalCp]);

  const isBestMoveLive = !isImportedGameMode || isOnBranch;
  const bestMoveStatusMessage = activeBestMoveRecommendation
    ? ''
    : isBestMoveLive
      ? (settings.engineEnabled ? 'Analyzing…' : 'Turn on the engine to see the best move.')
      : (!analyzedGame || activeMainLinePlyIndex < 0)
        ? 'Select a move to see the best continuation.'
        : 'Analyzing…';
  const bestMoveStatusLoading = isBestMoveLive && !activeBestMoveRecommendation && settings.engineEnabled;

  // When a PGN game is loaded and the user makes their first free move, seed the explore
  // tree with the game's history up to the current ply so the full sequence is preserved.
  function buildSeedTree(currentPlyIdx: number): { tree: ExploreTree; nav: ExploreNav } | null {
    if (!analyzedGame || currentPlyIdx < 0 || analyzedGame.moves.length === 0) return null;
    const rootFen = analyzedGame.initialFen ?? INITIAL_FEN;
    const chess = new Chess(rootFen);
    const moves: MoveEntry[] = [];
    // Include ALL game moves so applyMoveToTree can detect divergence and create branches correctly
    for (let i = 0; i < analyzedGame.moves.length; i++) {
      const gm = analyzedGame.moves[i]!;
      const result = chess.move(gm.san);
      if (!result) break;
      moves.push({ id: gm.id ?? crypto.randomUUID(), san: result.san, fen: chess.fen(), from: result.from, to: result.to, clock: pgnRawClocks[i] });
    }
    if (moves.length === 0) return null;
    const mainId = crypto.randomUUID();
    return {
      tree: { rootFen, lines: [{ id: mainId, parentLineId: null, divergeAtPly: 0, depth: 0, moves }] },
      nav: { lineId: mainId, plyIndex: currentPlyIdx },
    };
  }

  const tryMove = (from: string, to: string, prom = 'q'): boolean => {
    try {
      const chess = new Chess(boardFen);
      const move = chess.move({ from, to, promotion: prom as 'q' | 'r' | 'b' | 'n' });
      if (!move) return false;
      const entry: MoveEntry = { id: crypto.randomUUID(), san: move.san, fen: chess.fen(), from: move.from, to: move.to };
      const seed = (!exploreTree && analyzedGame && currentPlyIndex >= 0) ? buildSeedTree(currentPlyIndex) : null;
      const baseTree = seed?.tree ?? exploreTree;
      const baseNav = seed?.nav ?? exploreNav;
      const rootFen = baseTree?.rootFen ?? currentFen;
      const { tree: newTree, nav: newNav } = applyMoveToTree(baseTree, baseNav, entry, rootFen);
      playMoveOrCaptureSound(settings.moveSound, move.captured !== undefined);
      setExploreTree(newTree);
      setExploreNav(newNav);
      setLastMoveSquares({ from: move.from, to: move.to });
      setSelectedSquare(null);
      return true;
    } catch {
      return false;
    }
  };

  const handlePvClick = (pvUci: string[], clickedIdx: number) => {
    try {
      const chess = new Chess(boardFen);
      const seed = (!exploreTree && analyzedGame && currentPlyIndex >= 0) ? buildSeedTree(currentPlyIndex) : null;
      let workTree: ExploreTree | null = seed?.tree ?? exploreTree;
      let workNav: ExploreNav = seed?.nav ?? exploreNav;
      const rootFen = workTree?.rootFen ?? currentFen;
      let lastEntry: MoveEntry | null = null;
      for (let i = 0; i <= clickedIdx; i++) {
        const uci = pvUci[i]!;
        const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] ?? 'q') as 'q' | 'r' | 'b' | 'n' });
        if (!move) break;
        const entry: MoveEntry = { id: crypto.randomUUID(), san: move.san, fen: chess.fen(), from: move.from, to: move.to };
        const result = applyMoveToTree(workTree, workNav, entry, rootFen);
        workTree = result.tree;
        workNav = result.nav;
        lastEntry = entry;
      }
      if (!lastEntry || !workTree) return;
      playMoveOrCaptureSound(settings.moveSound, isCaptureSan(lastEntry.san));
      setExploreTree(workTree);
      setExploreNav(workNav);
      setLastMoveSquares({ from: lastEntry.from, to: lastEntry.to });
      setSelectedSquare(null);
    } catch {}
  };

  const onPieceClick = (_piece: string, square: string) => {
    setSelectedSquare(sq => sq === square ? null : square);
  };

  const onSquareClick = (square: string, piece?: string) => {
    if (!selectedSquare) {
      // onPieceClick handles piece selection — nothing to do here
      return;
    }
    if (selectedSquare === square) { setSelectedSquare(null); return; }
    if (piece) {
      // Clicking a piece while something is selected: try capture; if illegal, re-select
      if (!tryMove(selectedSquare, square)) setSelectedSquare(square);
      return;
    }
    // Empty square — try to move there
    if (!tryMove(selectedSquare, square)) setSelectedSquare(null);
  };

  const onPieceDragBegin = (_piece: string, square: string) => {
    setSelectedSquare(square);
  };

  const onPieceDragEnd = (_piece: string, square: string) => {
    // If the piece snapped back (failed drop), keep it selected so the next click works.
    const chess = new Chess(boardFen);
    if (chess.get(square as Parameters<Chess['get']>[0])) {
      setSelectedSquare(square);
    }
  };

  const onPieceDrop = (from: string, to: string): boolean => tryMove(from, to);

  const onPromotionCheck = (from: string, to: string, piece: string): boolean => {
    try {
      const chess = new Chess(boardFen);
      const p = chess.get(from as Parameters<Chess['get']>[0]);
      if (!p || p.type !== 'p' || piece[0] !== p.color) return false;
      const rank = to[1];
      return (p.color === 'w' && rank === '8') || (p.color === 'b' && rank === '1');
    } catch {
      return false;
    }
  };

  const onPromotionPieceSelect = (piece?: string, from?: string, to?: string): boolean => {
    if (!from || !to) return false;
    const promotion = piece?.slice(1)?.toLowerCase() ?? 'q';
    return tryMove(from, to, promotion);
  };

  function navigateTo(lineId: string, plyIndex: number) {
    if (!exploreTree) return;
    const line = exploreTree.lines.find(l => l.id === lineId);
    const entry = line?.moves[plyIndex];
    if (lineId !== exploreNav.lineId || plyIndex !== exploreNav.plyIndex) {
      playMoveOrCaptureSound(settings.moveSound, isCaptureSan(entry?.san));
    }
    setExploreNav({ lineId, plyIndex });
    if (entry) setLastMoveSquares({ from: entry.from, to: entry.to });
    else setLastMoveSquares(null);
  }

  function renderBranchContent(
    tree: ExploreTree,
    nav: ExploreNav,
    line: VariationLine,
    startFen: string,
  ): React.ReactNode[] {
    const { side: startSide, moveNum: startMoveNum } = getFenMeta(startFen);

    function getSide(plyInLine: number): 'w' | 'b' {
      return startSide === 'w'
        ? (plyInLine % 2 === 0 ? 'w' : 'b')
        : (plyInLine % 2 === 0 ? 'b' : 'w');
    }
    function getMoveNum(plyInLine: number): number {
      return startMoveNum + Math.floor((plyInLine + (startSide === 'b' ? 1 : 0)) / 2);
    }

    const items: React.ReactNode[] = [];
    let pendingTokens: React.ReactNode[] = [];

    function flushTokenRow(key: string) {
      if (pendingTokens.length > 0) {
        items.push(
          <div key={key} className="flex flex-wrap items-center gap-x-0.5 py-0.5">
            {[...pendingTokens]}
          </div>
        );
        pendingTokens = [];
      }
    }

    for (let i = 0; i < line.moves.length; i++) {
      const side = getSide(i);
      const mn = getMoveNum(i);
      if (i === 0 || side === 'w') {
        pendingTokens.push(
          <span key={`mn-${i}`} className="font-mono text-sm text-gray-500">
            {i === 0 && side === 'b' ? `${mn}…` : `${mn}.`}
          </span>
        );
      }
      const branchPly = i;
      const isBranchActive = nav.lineId === line.id && nav.plyIndex === branchPly;
      pendingTokens.push(
        <button
          key={`mv-${i}`}
          ref={isBranchActive ? activeExploreMoveRef : undefined}
          type="button"
          onClick={() => navigateTo(line.id, branchPly)}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMoveContextMenu({ x: e.clientX, y: e.clientY, lineId: line.id, plyIndex: branchPly }); }}
          className={`rounded px-1.5 py-0.5 font-mono text-sm transition-colors ${
            isBranchActive
              ? 'bg-amber-400/15 text-amber-300'
              : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
          }`}
        >
          {line.moves[branchPly]!.san}
        </button>
      );
      // Sub-branches after this move
      const childBranches = tree.lines.filter(l => l.parentLineId === line.id && l.divergeAtPly === i + 1);
      if (childBranches.length > 0) {
        flushTokenRow(`tok-${i}`);
        for (const child of childBranches) {
          const childStartFen = line.moves[i]?.fen ?? startFen;
          items.push(
            <div key={`child-${child.id}`} className="ml-4 border-l-2 border-white/10 pl-2">
              {renderBranchContent(tree, nav, child, childStartFen)}
            </div>
          );
        }
      }
    }
    flushTokenRow('tok-end');
    return items;
  }

  function renderMainLine(tree: ExploreTree, nav: ExploreNav): React.ReactNode[] {
    const line = tree.lines[0];
    if (!line) return [];
    const startFen = tree.rootFen;
    const { side: startSide, moveNum: startMoveNum } = getFenMeta(startFen);

    function getSide(plyInLine: number): 'w' | 'b' {
      return startSide === 'w'
        ? (plyInLine % 2 === 0 ? 'w' : 'b')
        : (plyInLine % 2 === 0 ? 'b' : 'w');
    }
    function getMoveNum(plyInLine: number): number {
      return startMoveNum + Math.floor((plyInLine + (startSide === 'b' ? 1 : 0)) / 2);
    }

    type Pair = { moveNum: number; white: { san: string; ply: number } | null; black: { san: string; ply: number } | null };
    const pairs: Pair[] = [];
    for (let i = 0; i < line.moves.length; i++) {
      const side = getSide(i);
      const mn = getMoveNum(i);
      const cell = { san: line.moves[i]!.san, ply: i };
      if (side === 'w') {
        pairs.push({ moveNum: mn, white: cell, black: null });
      } else {
        const last = pairs[pairs.length - 1];
        if (last && last.black === null && last.moveNum === mn) {
          last.black = cell;
        } else {
          pairs.push({ moveNum: mn, white: null, black: cell });
        }
      }
    }

    // Line 0 (this function only ever renders tree.lines[0]) mirrors analyzedGame.moves
    // 1:1 by ply index (see buildSeedTree) — so even though MoveEntry itself carries no
    // classification, the original analyzed move at the same ply does, and main-line
    // moves should keep their badge exactly like the flat (non-tree) AnalysisMoveList
    // does. Real branch moves (rendered separately via renderBranchContent) have no
    // analyzed counterpart and correctly stay unbadged.
    function cellCategory(ply: number): GameReviewCategory | null {
      const move = analyzedGame?.moves[ply];
      return move ? getAnalyzedGameMoveReviewCategory(move) : null;
    }

    const rows: React.ReactNode[] = [];
    for (const pair of pairs) {
      const whiteCategory = pair.white ? cellCategory(pair.white.ply) : null;
      const whiteShowBadge = whiteCategory !== null && !UNBADGED_REVIEW_CATEGORIES.includes(whiteCategory);
      const blackCategory = pair.black ? cellCategory(pair.black.ply) : null;
      const blackShowBadge = blackCategory !== null && !UNBADGED_REVIEW_CATEGORIES.includes(blackCategory);
      rows.push(
        <div key={`ml-${pair.moveNum}-${pair.white?.ply ?? 'bx'}`} className="flex items-center">
          <span className="w-8 shrink-0 text-right font-mono text-[13px] text-gray-600 pr-1">{pair.moveNum}.</span>
          <div className="flex flex-1">
            {pair.white ? (
              <button type="button"
                ref={nav.lineId === line.id && nav.plyIndex === pair.white.ply ? activeExploreMoveRef : undefined}
                onClick={() => navigateTo(line.id, pair.white!.ply)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMoveContextMenu({ x: e.clientX, y: e.clientY, lineId: line.id, plyIndex: pair.white!.ply }); }}
                className={`flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-[5px] font-mono text-[13px] transition-colors ${
                  nav.lineId === line.id && nav.plyIndex === pair.white.ply
                    ? 'bg-amber-400/15 text-amber-300' : 'text-gray-200 hover:bg-white/5 hover:text-white'
                }`}>
                {whiteShowBadge && <MoveClassificationIcon category={whiteCategory} size={16} className="mr-0.5" />}
                {pair.white.san}
              </button>
            ) : <span className="flex-1" />}
            {pair.black ? (
              <button type="button"
                ref={nav.lineId === line.id && nav.plyIndex === pair.black.ply ? activeExploreMoveRef : undefined}
                onClick={() => navigateTo(line.id, pair.black!.ply)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMoveContextMenu({ x: e.clientX, y: e.clientY, lineId: line.id, plyIndex: pair.black!.ply }); }}
                className={`flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-[5px] font-mono text-[13px] transition-colors ${
                  nav.lineId === line.id && nav.plyIndex === pair.black.ply
                    ? 'bg-amber-400/15 text-amber-300' : 'text-gray-200 hover:bg-white/5 hover:text-white'
                }`}>
                {blackShowBadge && <MoveClassificationIcon category={blackCategory} size={16} className="mr-0.5" />}
                {pair.black.san}
              </button>
            ) : <span className="flex-1" />}
          </div>
        </div>
      );
      // Branches diverging at white.ply (= alternative to white's move, shown after white)
      if (pair.white) {
        for (const branch of tree.lines.filter(l => l.parentLineId === line.id && l.divergeAtPly === pair.white!.ply)) {
          const bStartFen = pair.white.ply === 0 ? startFen : (line.moves[pair.white.ply - 1]?.fen ?? startFen);
          rows.push(
            <div key={`br-${branch.id}`} className="mb-0.5 ml-7 border-l-2 border-white/10 pl-2">
              {renderBranchContent(tree, nav, branch, bStartFen)}
            </div>
          );
        }
      }
      // Branches diverging at black.ply (= alternative to black's move, shown after black)
      if (pair.black) {
        for (const branch of tree.lines.filter(l => l.parentLineId === line.id && l.divergeAtPly === pair.black!.ply)) {
          const bStartFen = pair.black.ply === 0 ? startFen : (line.moves[pair.black.ply - 1]?.fen ?? startFen);
          rows.push(
            <div key={`br-${branch.id}`} className="mb-0.5 ml-7 border-l-2 border-white/10 pl-2">
              {renderBranchContent(tree, nav, branch, bStartFen)}
            </div>
          );
        }
      }
    }
    return rows;
  }

  // Blocks the whole screen instead of a dismissible banner (unlike urlLoadNotFound
  // below) — this fires before any board/panel renders, and before the shared-game fetch
  // even runs (useSharedUserGame is passed undefined while signed out, see above), so a
  // signed-out visitor never receives the game's data over the network at all, not just a
  // UI that hides it.
  if (requiresSignInForUrl) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <h2 className="mb-1 text-lg font-semibold text-white">Sign in to view this analysis</h2>
          <p className="mb-4 text-sm text-gray-500">This analysis link requires an account to open.</p>
          <InlineSignIn />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {urlLoadNotFound && (
        <div className="shrink-0 flex items-center justify-between gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2">
          <span className="text-xs text-red-300">
            This analysis isn&apos;t available — it may be private, or the link may be wrong.
          </span>
          <button
            type="button"
            onClick={() => setUrlLoadNotFound(false)}
            className="shrink-0 text-red-300/70 transition-colors hover:text-red-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <div ref={boardContainerRef} className="flex-1 min-h-0 overflow-hidden p-3 flex justify-center">
        <div className="flex h-full gap-3">

          <BoardPanel
            evalCp={displayEvalCp}
            displayPerspective={settings.flipBoard ? 'black' : 'white'}
            reserveEvalSpace={true}
            boardSize={boardSize}
            onBoardSizeChange={setBoardSize}
            maxWidth={maxBoardWidth}
            overlay={<>{knightArrowOverlay}{moveBadgeOverlay}</>}
            topBar={
              <div className="flex items-center h-full gap-2">
                <div className="flex-1 min-w-0 h-full">
                  <PlayerRow
                    name={settings.flipBoard ? (gameDetails.white || 'White') : (gameDetails.black || 'Black')}
                    title={settings.flipBoard ? whiteTitle : blackTitle}
                    elo={settings.flipBoard ? gameDetails.whiteElo : gameDetails.blackElo}
                    country={settings.flipBoard ? whiteCountry : blackCountry}
                    avatar={settings.flipBoard ? whiteAvatar : blackAvatar}
                    captured={settings.flipBoard ? material.whiteCaptured : material.blackCaptured}
                    advantage={settings.flipBoard ? material.advantage : -material.advantage}
                    clock={analyzedGame ? (settings.flipBoard ? playerClocks.w : playerClocks.b) : null}
                    isActive={settings.flipBoard ? boardFen.split(' ')[1] === 'w' : boardFen.split(' ')[1] === 'b'}
                    playerColor={settings.flipBoard ? 'white' : 'black'}
                  />
                </div>
                {/* Invisible spacer matching the BoardSettingsPopover button in the bottom row, so the clock lands at the same x-position in both rows */}
                <div className="h-8 w-8 shrink-0" />
              </div>
            }
            bottomBar={
              <div className="flex items-center py-1.5 gap-2">
                <div className="flex-1 min-w-0">
                  <PlayerRow
                    name={settings.flipBoard ? (gameDetails.black || 'Black') : (gameDetails.white || 'White')}
                    title={settings.flipBoard ? blackTitle : whiteTitle}
                    elo={settings.flipBoard ? gameDetails.blackElo : gameDetails.whiteElo}
                    country={settings.flipBoard ? blackCountry : whiteCountry}
                    avatar={settings.flipBoard ? blackAvatar : whiteAvatar}
                    captured={settings.flipBoard ? material.blackCaptured : material.whiteCaptured}
                    advantage={settings.flipBoard ? -material.advantage : material.advantage}
                    clock={analyzedGame ? (settings.flipBoard ? playerClocks.b : playerClocks.w) : null}
                    isActive={settings.flipBoard ? boardFen.split(' ')[1] === 'b' : boardFen.split(' ')[1] === 'w'}
                    playerColor={settings.flipBoard ? 'black' : 'white'}
                  />
                </div>
                <BoardSettingsPopover />
              </div>
            }
          >
            <Chessboard
              position={boardFen}
              boardWidth={boardSize}
              boardOrientation={settings.flipBoard ? 'black' : 'white'}
              arePiecesDraggable={true}
              isDraggablePiece={() => true}
              onPieceDrop={onPieceDrop}
              onPieceClick={onPieceClick}
              onPieceDragBegin={onPieceDragBegin}
              onPieceDragEnd={onPieceDragEnd}
              onSquareClick={onSquareClick}
              onPromotionCheck={onPromotionCheck}
              onPromotionPieceSelect={onPromotionPieceSelect}
              customSquareStyles={squareStyles}
              customArrows={bestMoveArrow as any}
              showBoardNotation={settings.showCoordinates}
              customDarkSquareStyle={{ backgroundColor: theme.dark }}
              customLightSquareStyle={{ backgroundColor: theme.light }}
              animationDuration={animationDuration}
              customPieces={customPieces}
            />
          </BoardPanel>

          <SidePanel
            bottomBar={
              <div className="flex items-stretch gap-2 px-3 py-1.5 select-none">
                <NavBtn onClick={navGoFirst} disabled={!navCanGoBack} title="First position"
                  className="flex h-14 flex-1 items-center justify-center rounded-xl border border-white/8 bg-white/4 text-gray-500 transition-all hover:border-amber-400/40 hover:bg-amber-400/8 hover:text-amber-300 disabled:pointer-events-none disabled:opacity-30">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5"><path d="M3.5 3a.5.5 0 0 1 .5.5v3.793l6.146-4.439A.5.5 0 0 1 11 3.5v9a.5.5 0 0 1-.854.354L4 8.707V12.5a.5.5 0 0 1-1 0v-9a.5.5 0 0 1 .5-.5z" /></svg>
                </NavBtn>
                <NavBtn onClick={navGoBack} disabled={!navCanGoBack} title="Previous (←)"
                  className="flex h-14 flex-[1.5] items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-gray-300 transition-all hover:border-amber-400/50 hover:bg-amber-400/10 hover:text-amber-300 disabled:pointer-events-none disabled:opacity-30">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5"><path d="M11.354 3.646a.5.5 0 0 1 0 .708L6.707 9l4.647 4.646a.5.5 0 0 1-.708.708l-5-5a.5.5 0 0 1 0-.708l5-5a.5.5 0 0 1 .708 0z" /></svg>
                </NavBtn>
                <NavBtn onClick={navGoForward} disabled={!navCanGoForward} title="Next (→)"
                  className="flex h-14 flex-[1.5] items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-gray-300 transition-all hover:border-amber-400/50 hover:bg-amber-400/10 hover:text-amber-300 disabled:pointer-events-none disabled:opacity-30">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5"><path d="M4.646 3.646a.5.5 0 0 1 .708 0l5 5a.5.5 0 0 1 0 .708l-5 5a.5.5 0 0 1-.708-.708L9.293 9 4.646 4.354a.5.5 0 0 1 0-.708z" /></svg>
                </NavBtn>
                <NavBtn onClick={navGoLast} disabled={!navCanGoForward} title="Last position"
                  className="flex h-14 flex-1 items-center justify-center rounded-xl border border-white/8 bg-white/4 text-gray-500 transition-all hover:border-amber-400/40 hover:bg-amber-400/8 hover:text-amber-300 disabled:pointer-events-none disabled:opacity-30">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5"><path d="M12.5 3a.5.5 0 0 0-.5.5v3.793L5.854 2.854A.5.5 0 0 0 5 3.5v9a.5.5 0 0 0 .854.354L12 8.207V12.5a.5.5 0 0 0 1 0v-9a.5.5 0 0 0-.5-.5z" /></svg>
                </NavBtn>
              </div>
            }
            topBar={
              <div className="flex h-full w-full">
                {(['review', 'explore'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 h-full text-xs font-semibold transition-colors ${
                      activeTab === tab
                        ? 'bg-amber-400/15 text-amber-300'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {tab === 'explore' ? 'Analysis' : 'Game Review'}
                  </button>
                ))}
              </div>
            }
            coach={
              <>
                <CoachBubble
                  feedback={activeCoach}
                  fallbackText={
                    activeTab === 'explore'
                      ? lastExploreMove
                        ? 'Analyzing your move...'
                        : 'Move pieces freely. The engine arrow shows the best continuation.'
                      : !analyzedGame
                        ? 'Import a game to get coach feedback on every move.'
                        : !hasEngineAnalysis
                          ? 'Click Analyze to enable move-by-move coach feedback.'
                          : currentPlyIndex < 0
                            ? 'Navigate to a move to see coach feedback.'
                            : 'No specific feedback for this position.'
                  }
                  dark
                  heightPx={82}
                />
                {analyzedGame && analyzedGame.moves.length > 0 && (
                  <BestMoveSection
                    recommendation={activeBestMoveRecommendation}
                    loading={bestMoveStatusLoading}
                    message={bestMoveStatusMessage}
                    isImportedGameMode={isImportedGameMode && !isOnBranch}
                  />
                )}
              </>
            }
          >
            {/* ── EXPLORE TAB ─────────────────────────────────────────────── */}
            {activeTab === 'explore' && (
              <div className="relative flex flex-1 min-h-0 flex-col">
                {/* Engine header */}
                <div className="shrink-0 px-3 pt-2.5 pb-2">
                  <div className="flex items-center gap-2">
                    {/* Enable / disable toggle */}
                    <button
                      type="button"
                      onClick={() => setSettings({ engineEnabled: !settings.engineEnabled })}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
                        settings.engineEnabled ? 'bg-amber-500' : 'bg-white/15'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
                          settings.engineEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    {/* Engine label + version inline */}
                    <span className="shrink-0 text-sm font-medium text-white">Engine</span>
                    <span className="shrink-0 text-xs text-gray-500">{ENGINE_DISPLAY_NAME}</span>

                    {/* Push depth section to right */}
                    <div className="flex-1 min-w-0" />

                    {/* Extend button + Depth label */}
                    {settings.engineEnabled && depth !== null && (
                      <div className="flex shrink-0 items-center gap-1 mr-2">
                        {isAnalyzing ? (
                          <div className="flex h-5 w-5 items-center justify-center">
                            <svg className="h-4 w-4 animate-spin text-emerald-400" viewBox="0 0 20 20" fill="none">
                              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.15" />
                              <path d="M10 3 A7 7 0 0 1 17 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setExtendKey(k => k + 1)}
                            disabled={!isDone}
                            title="Extend analysis deeper"
                            className="flex h-5 w-5 items-center justify-center rounded text-sm font-bold text-gray-500 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                          >
                            +
                          </button>
                        )}
                        <span className="text-[11px] text-gray-400">
                          Depth{' '}
                          <span className={isAnalyzing ? 'text-emerald-400' : 'text-gray-200'}>{depth}</span>
                        </span>
                      </div>
                    )}

                    {/* Gear icon */}
                    <button
                      type="button"
                      onClick={() => setEngineSettingsOpen(o => !o)}
                      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                        engineSettingsOpen
                          ? 'bg-white/10 text-white'
                          : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Engine lines */}
                {settings.engineEnabled && !settings.hideEngineInfo && (
                  <div className="shrink-0 px-3 pb-2">
                    <div className="rounded overflow-hidden divide-y divide-white/[0.06] bg-white/[0.05]">
                    {lines.slice(0, settings.engineLines).map((engineLine, li) => {
                      const freshTokens = pvToTokens(boardFen, engineLine.pvUci);
                      // Update cache only when the engine has real moves for the current position
                      if (freshTokens.length > 0) {
                        stableEngineTokensRef.current[li] = freshTokens;
                      }
                      // Fall back to cached tokens to avoid height collapse while loading
                      const tokens = freshTokens.length > 0
                        ? freshTokens
                        : (stableEngineTokensRef.current[li] ?? []);
                      const evalStr = formatEval(engineLine.evalCp);
                      const positive = (engineLine.evalCp ?? 0) >= 0;
                      return (
                        <div key={li} className="flex items-center gap-2 px-2.5 py-1 min-w-0">
                          <div className="flex-1 flex flex-wrap items-baseline gap-x-0.5 gap-y-0 font-mono text-xs min-w-0">
                            {tokens.length === 0 ? (
                              <span className="text-gray-600">...</span>
                            ) : tokens.map((token, ti) =>
                              token.type === 'num' ? (
                                <span key={ti} className="text-gray-600">{token.text}</span>
                              ) : (
                                <button
                                  key={ti}
                                  type="button"
                                  onClick={() => handlePvClick(engineLine.pvUci, token.uciIdx)}
                                  className={`rounded px-1 py-px transition-colors hover:bg-white/20 hover:text-white ${
                                    li === 0 && token.uciIdx === 0
                                      ? 'bg-white/15 text-gray-100'
                                      : 'text-gray-400'
                                  }`}
                                >
                                  {token.san}
                                </button>
                              )
                            )}
                          </div>
                          <span className={`shrink-0 rounded border px-1.5 py-px font-mono text-xs font-bold tabular-nums ${
                            positive
                              ? 'border-zinc-500/60 text-white'
                              : 'border-red-400/40 text-red-400'
                          }`}>
                            {evalStr}
                          </span>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                )}

                {/* Explore moves — fills all remaining space */}
                <div className="flex-1 min-h-0 overflow-y-auto border-t border-white/5">
                  {/* Opening name strip — always visible */}
                  <div className="flex items-center gap-2 border-b border-white/5 px-3 py-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="shrink-0 h-3.5 w-3.5 text-gray-600">
                      <path d="M10.75 16.82A7.462 7.462 0 0 1 15 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0 0 18 15.06v-11a.75.75 0 0 0-.546-.721A9.006 9.006 0 0 0 15 3a8.963 8.963 0 0 0-4.25 1.065V16.82ZM9.25 4.065A8.963 8.963 0 0 0 5 3c-.85 0-1.673.118-2.454.339A.75.75 0 0 0 2 4.06v11a.75.75 0 0 0 .954.721A7.506 7.506 0 0 1 5 15.5c1.579 0 3.042.487 4.25 1.32V4.065Z" />
                    </svg>
                    <span className="flex-1 min-w-0 truncate text-[12px] text-gray-400">
                      {openingPosition?.name ?? 'Starting Position'}
                    </span>
                  </div>
                  {/* Players header row — always visible */}
                  <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
                    <span className="flex flex-1 min-w-0 items-center gap-1 text-sm font-medium text-gray-300">
                      <span className="truncate">
                        {gameDetails.white || 'White'}
                        {gameDetails.whiteElo ? ` (${gameDetails.whiteElo})` : ''}
                      </span>
                      {whiteCountry && (
                        <span
                          className={`fi fi-${whiteCountry.trim().toLowerCase()} shrink-0 rounded-[1px]`}
                          style={{ width: '1rem', height: '0.75rem' }}
                          title={whiteCountry}
                        />
                      )}
                      <span className="shrink-0">–</span>
                      <span className="truncate">
                        {gameDetails.black || 'Black'}
                        {gameDetails.blackElo ? ` (${gameDetails.blackElo})` : ''}
                      </span>
                      {blackCountry && (
                        <span
                          className={`fi fi-${blackCountry.trim().toLowerCase()} shrink-0 rounded-[1px]`}
                          style={{ width: '1rem', height: '0.75rem' }}
                          title={blackCountry}
                        />
                      )}
                    </span>
                    <button
                      type="button"
                      title="Edit game details"
                      onClick={() => { setGameDetailsDraft(gameDetails); setLabelDraft(analysisLabel); setShowGameDetailsModal(true); }}
                      className="shrink-0 text-gray-600 transition-colors hover:text-gray-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                        <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                      </svg>
                    </button>
                  </div>
                  {exploreTree ? (
                    <div className="px-2 py-2">
                      {renderMainLine(exploreTree, exploreNav)}
                    </div>
                  ) : analyzedGame && analyzedGame.moves.length > 0 ? (
                    <AnalysisMoveList
                      game={analyzedGame}
                      currentPlyIndex={currentPlyIndex}
                      onNavigate={goTo}
                    />
                  ) : (
                    <p className="px-3 pt-4 text-center text-xs text-gray-600">
                      Move pieces on the board to explore.
                    </p>
                  )}
                </div>

                {/* Position — FEN / PGN input strip */}
                <div className="shrink-0 border-t border-white/5">
                  <div className="flex items-end justify-end gap-2 px-3 pt-2 pb-0">
                    {positionError && (
                      <span className="flex-1 text-[10px] text-red-400 leading-none">{positionError}</span>
                    )}
                    {/* Mode toggle — tab style, flush against textarea top */}
                    <div className="flex text-[10px] font-medium">
                      {(['pgn', 'fen'] as const).map((m, i) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPositionMode(m)}
                          className={`px-2.5 py-0.5 uppercase tracking-wide border-t border-b-0 transition-colors ${
                            i === 0 ? 'rounded-tl-lg border-l' : 'border-l border-r'
                          } ${
                            positionMode === m
                              ? 'bg-white/8 text-white border-white/15'
                              : 'bg-transparent text-gray-500 border-white/8 hover:text-gray-300'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="px-3 pb-0">
                    <div className="relative">
                      <textarea
                        ref={positionTextareaRef}
                        value={positionText}
                        onChange={e => { setPositionText(e.target.value); setPositionDirty(true); setPositionError(null); }}
                        rows={3}
                        spellCheck={false}
                        className={`w-full resize-none rounded-tl-lg rounded-tr-none rounded-b-lg border bg-white/3 px-2.5 py-1.5 pr-8 font-mono text-[10px] leading-relaxed text-gray-300 placeholder-gray-600 focus:outline-none transition-colors ${
                          positionError
                            ? 'border-red-500/40 focus:border-red-500/60'
                            : 'border-white/8 focus:border-white/20'
                        }`}
                        placeholder={positionMode === 'fen' ? 'Paste a FEN string…' : 'Paste PGN here…'}
                      />
                      <button
                        type="button"
                        onClick={handlePositionLoad}
                        title="Load position"
                        disabled={!positionDirty}
                        className={`absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded border bg-[#14161f] transition-colors ${positionDirty ? 'border-white/20 text-gray-300 hover:border-white/35 hover:text-white cursor-pointer' : 'border-white/6 text-gray-700 cursor-default'}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                          <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.042-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    {/* Action buttons below textarea */}
                    <div className="relative flex gap-1.5 mt-0.5">
                      <button
                        type="button"
                        onClick={handleNewAnalysis}
                        className="flex flex-1 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-gray-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0">
                          <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
                        </svg>
                        New
                      </button>
                      <button
                        type="button"
                        onClick={() => { setParseError(null); setShowImportModal(true); }}
                        className="flex flex-1 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-gray-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0">
                          <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v.64c.57.265.94.876.856 1.546l-.64 5.124A2.5 2.5 0 0 1 12.733 15H3.266a2.5 2.5 0 0 1-2.481-2.19l-.64-5.124A1.5 1.5 0 0 1 1 6.14V3.5ZM2 6h12v-.5a.5.5 0 0 0-.5-.5H9c-.964 0-1.71-.629-2.174-1.154C6.374 3.334 5.82 3 5.264 3H2.5a.5.5 0 0 0-.5.5V6Zm-.367 1a.5.5 0 0 0-.496.562l.64 5.124A1.5 1.5 0 0 0 3.266 14h9.468a1.5 1.5 0 0 0 1.489-1.314l.64-5.124A.5.5 0 0 0 14.367 7H1.633Z"/>
                        </svg>
                        Import Game
                      </button>
                      <div className="relative flex flex-1">
                        <button
                          type="button"
                          onClick={() => handleSaveGame()}
                          disabled={saveUserGame.isPending || !isDirty}
                          title={!isDirty && importMeta.savedGameId ? 'No changes to save' : undefined}
                          className={`flex flex-1 items-center justify-center gap-1 border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-gray-200 disabled:opacity-50 ${importMeta.savedGameId ? 'rounded-l' : 'rounded'}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0">
                            <path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5V5.457c0-.398-.158-.78-.44-1.06L11.063 1.44A1.5 1.5 0 0 0 10.043 1H2.5Zm0 1h7.5v3a1 1 0 0 0 1 1h3v7.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5ZM5 11.5a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5Zm0-2a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5ZM5 7.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1H5Z"/>
                          </svg>
                          {saveConfirmed ? 'Saved ✓' : saveUserGame.isPending ? 'Saving…' : 'Save'}
                        </button>
                        {importMeta.savedGameId && (
                          <button
                            type="button"
                            onClick={() => setShowSaveAsMenu(v => !v)}
                            disabled={saveUserGame.isPending}
                            title="Save as a new copy"
                            className="flex shrink-0 items-center justify-center rounded-r border border-l-0 border-white/10 bg-white/[0.04] px-1 text-gray-400 transition-colors hover:border-white/20 hover:text-gray-200 disabled:opacity-50"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                        {showSaveAsMenu && (
                          <div
                            ref={saveAsMenuRef}
                            className="absolute bottom-full right-0 mb-1 w-40 rounded-lg border border-white/10 bg-[#14161f] p-1 shadow-2xl shadow-black/60 z-10"
                          >
                            <button
                              type="button"
                              onClick={() => { setShowSaveAsMenu(false); handleSaveGame(true); }}
                              className="w-full rounded px-2 py-1.5 text-left text-[11px] font-medium text-gray-300 transition-colors hover:bg-white/8 hover:text-white"
                            >
                              Save as new copy
                            </button>
                          </div>
                        )}
                      </div>


                      {showSaveAuthPrompt && (
                        <div
                          className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border border-white/10 bg-[#14161f] p-3 shadow-2xl shadow-black/60 z-10"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-gray-300">Sign in to save games</p>
                            <button
                              type="button"
                              onClick={() => setShowSaveAuthPrompt(false)}
                              className="text-gray-600 hover:text-white transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <InlineSignIn onSuccess={() => setShowSaveAuthPrompt(false)} />
                        </div>
                      )}

                      {saveError && (
                        <div
                          className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border border-red-500/30 bg-[#14161f] p-3 shadow-2xl shadow-black/60 z-10"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-red-400">Save failed: {saveError}</p>
                            <button
                              type="button"
                              onClick={() => setSaveError(null)}
                              className="shrink-0 text-gray-600 hover:text-white transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Engine settings overlay */}
                {engineSettingsOpen && (
                  <div
                    ref={engineSettingsRef}
                    className="absolute inset-x-0 top-0 z-20 m-2 rounded-xl border border-white/10 bg-[#14161f] p-4 shadow-2xl"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Engine settings</span>
                      <button
                        type="button"
                        onClick={() => setEngineSettingsOpen(false)}
                        className="flex h-6 w-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Engine selector (static — only one version available) */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/4 px-3 py-2">
                        <span className="text-sm font-medium text-white">{ENGINE_DISPLAY_NAME}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-gray-600">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4">
                      {/* Lines */}
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-xs text-gray-400">Lines</span>
                          <span className="text-xs font-semibold tabular-nums text-gray-300">{settings.engineLines}</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={3}
                          step={1}
                          value={settings.engineLines}
                          onChange={e => {
                            setEngineLinesTouched(true);
                            setSettings({ engineLines: Number(e.target.value) as 1 | 2 | 3 });
                          }}
                          className="w-full cursor-pointer accent-violet-500"
                        />
                      </div>

                      {/* Time */}
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-xs text-gray-400">Time</span>
                          <span className="text-xs font-semibold tabular-nums text-gray-300">{settings.engineMoveTime}s</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={30}
                          step={1}
                          value={settings.engineMoveTime}
                          onChange={e => setSettings({ engineMoveTime: Number(e.target.value) })}
                          className="w-full cursor-pointer accent-violet-500"
                        />
                      </div>

                      {/* Hide lines info */}
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            settings.hideEngineInfo ? 'border-amber-500 bg-amber-500' : 'border-white/20 bg-transparent'
                          }`}
                        >
                          {settings.hideEngineInfo && (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5 text-white">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          )}
                        </span>
                        <input
                          type="checkbox"
                          checked={settings.hideEngineInfo}
                          onChange={e => setSettings({ hideEngineInfo: e.target.checked })}
                          className="sr-only"
                        />
                        <span className="text-xs text-gray-300">Hide lines info</span>
                      </label>

                      {/* Hide arrows */}
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            settings.hideArrows ? 'border-amber-500 bg-amber-500' : 'border-white/20 bg-transparent'
                          }`}
                        >
                          {settings.hideArrows && (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5 text-white">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          )}
                        </span>
                        <input
                          type="checkbox"
                          checked={settings.hideArrows}
                          onChange={e => setSettings({ hideArrows: e.target.checked })}
                          className="sr-only"
                        />
                        <span className="text-xs text-gray-300">Hide arrows</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── GAME REVIEW TAB ──────────────────────────────────────────── */}
            {activeTab === 'review' && (
              <div className="flex flex-1 min-h-0 flex-col">

                {/* ── No game loaded ── */}
                {!analyzedGame && (
                  <div className="flex-1 min-h-0 flex items-start justify-center pt-6">
                    <p className="text-xs text-gray-600 text-center px-6 leading-5">
                      Paste a PGN below and click Load, or use Import to open the full import dialog.
                    </p>
                  </div>
                )}

                {/* ── Game loaded ── */}
                {analyzedGame && (
                  <>
                    {/* Engine progress overlay */}
                    {isEngineRunning && (
                      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-5 px-6 py-8">
                        <div className="w-full max-w-40">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-medium text-gray-300">Analyzing</p>
                            <span className="text-xs tabular-nums text-gray-500">
                              {Math.round(engineProgress * 100)}%
                            </span>
                          </div>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-amber-400 transition-all duration-300"
                              style={{ width: `${Math.round(engineProgress * 100)}%` }}
                            />
                          </div>
                          <p className="mt-2 text-[10px] text-gray-600">
                            {analyzedGame.moves.length} moves · {workerPoolSize()} engines
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Main review UI (hidden while loading) */}
                    {!isEngineRunning && (
                      <div className="flex flex-1 min-h-0 flex-col">

                        {/* Engine error (analysis now runs automatically on import) */}
                        {engineError && (
                          <div className="shrink-0 flex items-center gap-2 border-b border-white/5 px-3 py-2.5">
                            <span className="text-[10px] text-red-400">{engineError}</span>
                          </div>
                        )}

                        {/* Each section below is a fixed percentage of this flex-1 area's own
                            height (not the whole right panel — topBar/coach sit above it and
                            aren't part of this budget), so proportions hold across screen
                            sizes the same way the reference screenshots did on one screen.
                            Deliberately not flex-1: whatever's left below these two sections
                            stays blank, ahead of the static PGN/FEN strip + buttons below. */}
                        <div className="flex flex-1 min-h-0 flex-col">
                          <DominanceGraphPanel
                            game={analyzedGame}
                            currentPlyIndex={currentPlyIndex}
                            onSelectPly={goTo}
                            className="h-[11%] shrink-0 border-b border-white/5"
                          />
                          <GameReviewReportPanel
                            report={gameReviewReport}
                            hasEngineAnalysis={hasEngineAnalysis}
                            className="h-[45%] shrink-0"
                          />
                        </div>

                      </div>
                    )}
                  </>
                )}

                {/* Position — FEN / PGN input strip */}
                <div className="shrink-0 border-t border-white/5">
                  <div className="flex items-end justify-end gap-2 px-3 pt-2 pb-0">
                    {positionError && (
                      <span className="flex-1 text-[10px] text-red-400 leading-none">{positionError}</span>
                    )}
                    {/* Mode toggle — tab style, flush against textarea top */}
                    <div className="flex text-[10px] font-medium">
                      {(['pgn', 'fen'] as const).map((m, i) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPositionMode(m)}
                          className={`px-2.5 py-0.5 uppercase tracking-wide border-t border-b-0 transition-colors ${
                            i === 0 ? 'rounded-tl-lg border-l' : 'border-l border-r'
                          } ${
                            positionMode === m
                              ? 'bg-white/8 text-white border-white/15'
                              : 'bg-transparent text-gray-500 border-white/8 hover:text-gray-300'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="px-3 pb-0">
                    <div className="relative">
                      <textarea
                        ref={positionTextareaRef}
                        value={positionText}
                        onChange={e => { setPositionText(e.target.value); setPositionDirty(true); setPositionError(null); }}
                        rows={3}
                        spellCheck={false}
                        className={`w-full resize-none rounded-tl-lg rounded-tr-none rounded-b-lg border bg-white/3 px-2.5 py-1.5 pr-8 font-mono text-[10px] leading-relaxed text-gray-300 placeholder-gray-600 focus:outline-none transition-colors ${
                          positionError
                            ? 'border-red-500/40 focus:border-red-500/60'
                            : 'border-white/8 focus:border-white/20'
                        }`}
                        placeholder={positionMode === 'fen' ? 'Paste a FEN string…' : 'Paste PGN here…'}
                      />
                      <button
                        type="button"
                        onClick={handlePositionLoad}
                        title="Load position"
                        disabled={!positionDirty}
                        className={`absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded border bg-[#14161f] transition-colors ${positionDirty ? 'border-white/20 text-gray-300 hover:border-white/35 hover:text-white cursor-pointer' : 'border-white/6 text-gray-700 cursor-default'}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                          <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.042-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    {/* Action buttons below textarea */}
                    <div className="relative flex gap-1.5 mt-0.5">
                      <button
                        type="button"
                        onClick={handleNewAnalysis}
                        className="flex flex-1 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-gray-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0">
                          <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
                        </svg>
                        New
                      </button>
                      <button
                        type="button"
                        onClick={() => { setParseError(null); setShowImportModal(true); }}
                        className="flex flex-1 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-gray-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0">
                          <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v.64c.57.265.94.876.856 1.546l-.64 5.124A2.5 2.5 0 0 1 12.733 15H3.266a2.5 2.5 0 0 1-2.481-2.19l-.64-5.124A1.5 1.5 0 0 1 1 6.14V3.5ZM2 6h12v-.5a.5.5 0 0 0-.5-.5H9c-.964 0-1.71-.629-2.174-1.154C6.374 3.334 5.82 3 5.264 3H2.5a.5.5 0 0 0-.5.5V6Zm-.367 1a.5.5 0 0 0-.496.562l.64 5.124A1.5 1.5 0 0 0 3.266 14h9.468a1.5 1.5 0 0 0 1.489-1.314l.64-5.124A.5.5 0 0 0 14.367 7H1.633Z"/>
                        </svg>
                        Import Game
                      </button>
                      <div className="relative flex flex-1">
                        <button
                          type="button"
                          onClick={() => handleSaveGame()}
                          disabled={saveUserGame.isPending || !isDirty}
                          title={!isDirty && importMeta.savedGameId ? 'No changes to save' : undefined}
                          className={`flex flex-1 items-center justify-center gap-1 border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-gray-200 disabled:opacity-50 ${importMeta.savedGameId ? 'rounded-l' : 'rounded'}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0">
                            <path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5V5.457c0-.398-.158-.78-.44-1.06L11.063 1.44A1.5 1.5 0 0 0 10.043 1H2.5Zm0 1h7.5v3a1 1 0 0 0 1 1h3v7.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5ZM5 11.5a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5Zm0-2a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5ZM5 7.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1H5Z"/>
                          </svg>
                          {saveConfirmed ? 'Saved ✓' : saveUserGame.isPending ? 'Saving…' : 'Save'}
                        </button>
                        {importMeta.savedGameId && (
                          <button
                            type="button"
                            onClick={() => setShowSaveAsMenu(v => !v)}
                            disabled={saveUserGame.isPending}
                            title="Save as a new copy"
                            className="flex shrink-0 items-center justify-center rounded-r border border-l-0 border-white/10 bg-white/[0.04] px-1 text-gray-400 transition-colors hover:border-white/20 hover:text-gray-200 disabled:opacity-50"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                        {showSaveAsMenu && (
                          <div
                            ref={saveAsMenuRef}
                            className="absolute bottom-full right-0 mb-1 w-40 rounded-lg border border-white/10 bg-[#14161f] p-1 shadow-2xl shadow-black/60 z-10"
                          >
                            <button
                              type="button"
                              onClick={() => { setShowSaveAsMenu(false); handleSaveGame(true); }}
                              className="w-full rounded px-2 py-1.5 text-left text-[11px] font-medium text-gray-300 transition-colors hover:bg-white/8 hover:text-white"
                            >
                              Save as new copy
                            </button>
                          </div>
                        )}
                      </div>


                      {showSaveAuthPrompt && (
                        <div
                          className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border border-white/10 bg-[#14161f] p-3 shadow-2xl shadow-black/60 z-10"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-gray-300">Sign in to save games</p>
                            <button
                              type="button"
                              onClick={() => setShowSaveAuthPrompt(false)}
                              className="text-gray-600 hover:text-white transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <InlineSignIn onSuccess={() => setShowSaveAuthPrompt(false)} />
                        </div>
                      )}

                      {saveError && (
                        <div
                          className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border border-red-500/30 bg-[#14161f] p-3 shadow-2xl shadow-black/60 z-10"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-red-400">Save failed: {saveError}</p>
                            <button
                              type="button"
                              onClick={() => setSaveError(null)}
                              className="shrink-0 text-gray-600 hover:text-white transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </SidePanel>

        </div>
      </div>

      {/* Import modal */}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
          error={parseError}
        />
      )}

      {/* Game Details modal */}
      {showGameDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#14161f] shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-3">
              <h2 className="text-base font-semibold text-white">Game Details</h2>
              <button
                type="button"
                onClick={() => setShowGameDetailsModal(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto space-y-2.5 px-5 py-4">
              {/* Analysis label — DB-only organizing metadata, distinguishes saved copies
                  of the same game; never embedded in the pgn text like the fields below. */}
              <input
                type="text"
                placeholder={'Analysis label (optional) — e.g. "Sicilian sideline"'}
                value={labelDraft}
                onChange={e => setLabelDraft(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-amber-400/40"
              />
              {/* White / Black rows */}
              {(['white', 'black'] as const).map(color => (
                <div key={color} className="flex gap-2">
                  <input
                    type="text"
                    placeholder={color === 'white' ? 'White Player' : 'Black Player'}
                    value={gameDetailsDraft[color]}
                    onChange={e => setGameDetailsDraft(d => ({ ...d, [color]: e.target.value }))}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-amber-400/40"
                  />
                  <input
                    type="text"
                    placeholder="Rating"
                    value={gameDetailsDraft[color === 'white' ? 'whiteElo' : 'blackElo']}
                    onChange={e => setGameDetailsDraft(d => ({ ...d, [color === 'white' ? 'whiteElo' : 'blackElo']: e.target.value }))}
                    className="min-w-0 w-20 shrink-0 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-amber-400/40"
                  />
                </div>
              ))}
              {/* Result */}
              <select
                value={gameDetailsDraft.result}
                onChange={e => setGameDetailsDraft(d => ({ ...d, result: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-amber-400/40"
              >
                {[['*', 'No Result (*)'], ['1-0', 'White wins (1-0)'], ['0-1', 'Black wins (0-1)'], ['1/2-1/2', 'Draw (½-½)']].map(([v, l]) => (
                  <option key={v} value={v} className="bg-[#14161f]">{l}</option>
                ))}
              </select>
              {/* Single-line fields */}
              {(['event', 'timeControl', 'termination', 'location'] as const).map(field => (
                <input
                  key={field}
                  type="text"
                  placeholder={{ event: 'Event', timeControl: 'Time Control', termination: 'Termination', location: 'Location' }[field]}
                  value={gameDetailsDraft[field]}
                  onChange={e => setGameDetailsDraft(d => ({ ...d, [field]: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-amber-400/40"
                />
              ))}
              {/* Round / ECO / Date row */}
              <div className="flex gap-2">
                {(['round', 'eco', 'date'] as const).map(field => (
                  <input
                    key={field}
                    type="text"
                    placeholder={{ round: 'Round', eco: 'ECO', date: 'Date' }[field]}
                    value={gameDetailsDraft[field]}
                    onChange={e => setGameDetailsDraft(d => ({ ...d, [field]: e.target.value }))}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-amber-400/40"
                  />
                ))}
              </div>

              {/* Read-only metadata captured from the source provider (not part of the editable PGN headers) */}
              {importMeta.source !== 'manual' && (
                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">
                    Imported from {importMeta.source === 'chesscom' ? 'Chess.com' : importMeta.source === 'lichess' ? 'Lichess' : 'in-app play'}
                  </p>
                  <div className="text-xs text-gray-400 space-y-1">
                    {importMeta.openingName && (
                      <p>Opening: <span className="text-gray-300">{importMeta.openingName}</span></p>
                    )}
                    {importMeta.timeClass && (
                      <p>Time class: <span className="text-gray-300 capitalize">{importMeta.timeClass}</span></p>
                    )}
                    {formatTimeControl(importMeta.clockInitial, importMeta.clockIncrement) && (
                      <p>Time control: <span className="text-gray-300">{formatTimeControl(importMeta.clockInitial, importMeta.clockIncrement)}</span></p>
                    )}
                    {importMeta.rated != null && (
                      <p>Rated: <span className="text-gray-300">{importMeta.rated ? 'Yes' : 'No'}</span></p>
                    )}
                    {importMeta.variant && importMeta.variant !== 'chess' && (
                      <p>Variant: <span className="text-gray-300 capitalize">{importMeta.variant}</span></p>
                    )}
                    {(importMeta.whiteAccuracy != null || importMeta.blackAccuracy != null) && (
                      <p>Accuracy: <span className="text-gray-300">{importMeta.whiteAccuracy?.toFixed(1) ?? '—'} / {importMeta.blackAccuracy?.toFixed(1) ?? '—'}</span></p>
                    )}
                    {importMeta.whiteResult && (
                      <p>White result: <span className="text-gray-300 capitalize">{importMeta.whiteResult}</span></p>
                    )}
                    {importMeta.blackResult && (
                      <p>Black result: <span className="text-gray-300 capitalize">{importMeta.blackResult}</span></p>
                    )}
                    {importMeta.sourceUrl && (
                      <p>
                        <a href={importMeta.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 transition-colors">
                          View original game ↗
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="shrink-0 flex gap-2 border-t border-white/8 px-5 py-4">
              <button type="button" onClick={() => setShowGameDetailsModal(false)}
                className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-white/20 hover:text-white">
                Cancel
              </button>
              <button type="button" onClick={() => { setGameDetails(gameDetailsDraft); setAnalysisLabel(labelDraft); setShowGameDetailsModal(false); }}
                className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-400">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overwrite Saved Analysis confirmation modal */}
      {showOverwriteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={overwriteConfirmBackdrop.onMouseDown}
          onClick={overwriteConfirmBackdrop.onClick}
        >
          <div className="w-80 rounded-xl border border-white/10 bg-[#14161f] p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-white">Overwrite Saved Analysis?</h2>
            <p className="mt-1.5 text-sm text-gray-400">This will replace the saved version with your current changes. This can&apos;t be undone.</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowOverwriteConfirm(false)}
                className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setShowOverwriteConfirm(false); performSaveGame(false); }}
                className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Analysis confirmation modal */}
      {showNewAnalysisModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={newAnalysisModalBackdrop.onMouseDown}
          onClick={newAnalysisModalBackdrop.onClick}
        >
          <div className="w-80 rounded-xl border border-white/10 bg-[#14161f] p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-white">Start New Analysis?</h2>
            <p className="mt-1.5 text-sm text-gray-400">Any unsaved progress will be lost.</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowNewAnalysisModal(false)}
                className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={clearAnalysis}
                className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
              >
                New Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move context menu */}
      {moveContextMenu && (
        <div
          className="fixed z-[200] min-w-[168px] overflow-hidden rounded-lg border border-white/10 bg-zinc-900 py-1 shadow-xl"
          style={{ left: moveContextMenu.x, top: moveContextMenu.y }}
          onClick={e => e.stopPropagation()}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}
        >
          {exploreTree?.lines.find(l => l.id === moveContextMenu.lineId)?.parentLineId !== null && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-200 hover:bg-white/8 hover:text-white"
              onClick={() => handleMakeMainLine(moveContextMenu.lineId, moveContextMenu.plyIndex)}
            >
              Make main line
            </button>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-400 hover:bg-white/8 hover:text-rose-300"
            onClick={() => handleDeleteFromHere(moveContextMenu.lineId, moveContextMenu.plyIndex)}
          >
            Delete from here
          </button>
        </div>
      )}
    </div>
  );
}
