'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from '@firstmove/core';
import { CoachBubble } from '@/components/practice/CoachBubble';
import { BoardPanel } from '@/components/board/BoardPanel';
import { SidePanel } from '@/components/board/SidePanel';
import { NavBtn } from '@/components/board/NavBtn';
import { useBoardSettings } from '@/hooks/useBoardSettings';
import { usePositionAnalysis, ENGINE_DISPLAY_NAME } from '@/hooks/usePositionAnalysis';
import { useCoachSettings } from '@/hooks/useCoachSettings';
import { useOpeningName } from '@/hooks/useOpeningName';
import { getCustomPieces } from '@/lib/piecesets';
import { BoardSettingsPopover } from '@/components/board/BoardSettingsPopover';
import { AnalysisWorkerPool, workerPoolSize } from '@/lib/client/analysisPool';
import { enrichGameMove } from '@/lib/client/enrichGameMove';
import {
  buildAnalyzedGameFromPgn,
  buildGameAnalysisCoachFeedbackFromAnalyzedGameMove,
  buildGameReviewReport,
  buildGameAnalysisSummaryFeedback,
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

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const INITIAL_EVAL_CP = 20;
const STOCKFISH_DEPTH = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelTab = 'explore' | 'review';
type ReviewSubTab = 'summary' | 'moves';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Parse [%clk h:mm:ss] annotations from a PGN string, returning formatted times
// in the order they appear (ply 0 = white's first move, ply 1 = black's, etc.).
function parsePgnClocks(pgn: string): string[] {
  const clocks: string[] = [];
  const re = /\[%clk\s+(\d+):(\d+):(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn)) !== null) {
    const h = parseInt(m[1]!, 10);
    const min = parseInt(m[2]!, 10);
    const s = parseInt(m[3]!, 10);
    clocks.push(h > 0
      ? `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${min}:${String(s).padStart(2, '0')}`
    );
  }
  return clocks;
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

function PlayerRow({
  name, elo, avatar, captured, advantage, clock, isActive, playerColor,
}: {
  name: string;
  elo?: string;
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
          <span className="text-sm font-semibold text-gray-200 truncate leading-none">{name || '—'}</span>
          {elo && <span className="text-xs text-gray-500 shrink-0 leading-none">{elo}</span>}
        </div>
        <div className="flex items-center gap-1.5 min-w-0 min-h-[16px]">
          {hasMaterial && (
            <>
              {pieceGroups.map((group, gi) => (
                <div key={gi} className="flex items-center">
                  {Array(group.count).fill(null).map((_, i) => (
                    <span
                      key={i}
                      className="text-base leading-none select-none"
                      style={{ ...capturedPieceStyle, marginLeft: i > 0 ? '-0.3em' : undefined }}
                    >
                      {group.sym}
                    </span>
                  ))}
                </div>
              ))}
              {advantage > 0 && <span className="text-base font-semibold text-gray-300 leading-none">+{advantage}</span>}
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

const CLASSIFICATION_DOT: Record<GameReviewCategory, string> = {
  brilliant: 'bg-cyan-400',
  great: 'bg-blue-400',
  book: 'bg-orange-300',
  best: 'bg-lime-400',
  excellent: 'bg-green-400',
  good: 'bg-emerald-300',
  miss: 'bg-rose-400',
  inaccuracy: 'bg-yellow-400',
  mistake: 'bg-orange-400',
  blunder: 'bg-red-500',
};

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

type MoveEntry = { id: string; san: string; fen: string; from: string; to: string };

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
  const dotColor = item.classification ? CLASSIFICATION_DOT[item.classification] : undefined;

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.plyIndex)}
      className={`flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-[5px] font-mono text-[13px] transition-colors ${
        isActive
          ? 'bg-amber-400/15 text-amber-300'
          : 'text-gray-300 hover:bg-white/5 hover:text-white'
      }`}
    >
      <span className="truncate">{item.san}</span>
      {dotColor && <span className={`ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />}
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

function GameRecapPanel({
  summaries,
  hasEngineAnalysis,
}: {
  summaries: CoachFeedback[];
  hasEngineAnalysis: boolean;
}) {
  if (summaries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-3 text-center">
        <p className="text-xs leading-5 text-gray-600">
          Import and analyze a game to generate phase and game recap notes.
        </p>
      </div>
    );
  }

  const gameSummary = summaries.find(summary => summary.event.eventType === 'game_summary');
  const phaseSummaries = summaries.filter(summary => summary.event.eventType === 'phase_summary');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
      {gameSummary && (
        <div className="rounded-lg border border-amber-400/15 bg-amber-400/5 px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-amber-400/70">
              Game recap
            </span>
            {!hasEngineAnalysis && (
              <span className="text-[10px] font-medium text-gray-500">structure only</span>
            )}
          </div>
          <p className="text-sm font-semibold leading-5 text-white">{gameSummary.title}</p>
          <p className="mt-1 text-xs leading-5 text-gray-400">{gameSummary.message}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {typeof gameSummary.variables.bestMoveSan === 'string' && (
              <div className="rounded border border-white/5 bg-white/3 px-2 py-1.5">
                <span className="block text-[10px] uppercase tracking-wider text-gray-600">
                  Best move
                </span>
                <span className="font-mono text-xs font-semibold text-emerald-300">
                  {gameSummary.variables.bestMoveSan}
                </span>
              </div>
            )}
            {typeof gameSummary.variables.worstMoveSan === 'string' && (
              <div className="rounded border border-white/5 bg-white/3 px-2 py-1.5">
                <span className="block text-[10px] uppercase tracking-wider text-gray-600">
                  Key mistake
                </span>
                <span className="font-mono text-xs font-semibold text-rose-300">
                  {gameSummary.variables.worstMoveSan}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {phaseSummaries.map(summary => (
        <div
          key={summary.id}
          className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              {summary.event.phase ?? 'phase'}
            </span>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 text-gray-500">
              {summary.label}
            </span>
          </div>
          <p className="text-xs leading-5 text-gray-400">{summary.message}</p>
        </div>
      ))}
    </div>
  );
}

function GameReviewReportPanel({
  report,
  hasEngineAnalysis,
}: {
  report: GameReviewReport | null;
  hasEngineAnalysis: boolean;
}) {
  if (!report) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-3 text-center">
        <p className="text-xs leading-5 text-gray-600">
          Import and analyze a game to see review categories.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/5 pb-2">
        <div>
          <p className="text-xs font-semibold text-white">Game Review</p>
          <p className="mt-0.5 text-[10px] text-gray-600">
            FirstMove categories, not Chess.com exact scoring
          </p>
        </div>
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

// ─── Import Modal ─────────────────────────────────────────────────────────────

type ImportTab = 'pgn' | 'lichess' | 'chesscom';

interface FetchedGame {
  id: string;
  whiteName: string;
  whiteRating: string | number;
  blackName: string;
  blackRating: string | number;
  result: string;
  date: string;
  timeClass?: string;
  opening?: string;
  pgn: string;
}

function SpinnerIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function GameCard({ game, onSelect }: { game: FetchedGame; onSelect: () => void }) {
  const resultColor =
    game.result === '1-0' ? 'text-white' :
    game.result === '0-1' ? 'text-gray-500' : 'text-gray-400';
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 transition-all hover:border-amber-400/25 hover:bg-amber-400/[0.04]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 w-10 text-right text-[11px] text-gray-600 font-mono tabular-nums">{game.whiteRating}</span>
          <span className="text-[13px] text-gray-200 font-medium truncate">{game.whiteName}</span>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0">
            <path fillRule="evenodd" d="M4 1.75a.75.75 0 0 1 1.5 0V3h5V1.75a.75.75 0 0 1 1.5 0V3A2.25 2.25 0 0 1 14.25 5.25v7.5A2.25 2.25 0 0 1 12 15H4A2.25 2.25 0 0 1 1.75 12.75v-7.5A2.25 2.25 0 0 1 4 3V1.75ZM3.25 7.5A.75.75 0 0 1 4 6.75h8a.75.75 0 0 1 0 1.5H4A.75.75 0 0 1 3.25 7.5Z" clipRule="evenodd" />
          </svg>
          <span className="text-[11px] tabular-nums">{game.date}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 mt-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 w-10 text-right text-[11px] text-gray-600 font-mono tabular-nums">{game.blackRating}</span>
          <span className="text-[13px] text-gray-300 font-medium truncate">{game.blackName}</span>
        </div>
        <span className={`shrink-0 text-[12px] font-semibold tabular-nums ${resultColor}`}>{game.result}</span>
      </div>
      {(game.timeClass ?? game.opening) && (
        <div className="mt-1.5 ml-[52px] flex items-center gap-1.5 min-w-0">
          {game.timeClass && <span className="shrink-0 text-[10px] text-gray-700 capitalize">{game.timeClass}</span>}
          {game.timeClass && game.opening && <span className="text-[10px] text-gray-700">·</span>}
          {game.opening && <span className="text-[10px] text-gray-600 truncate">{game.opening}</span>}
        </div>
      )}
    </button>
  );
}

function ImportModal({
  onClose,
  onImport,
  error,
}: {
  onClose: () => void;
  onImport: (pgn: string, fen: string) => void;
  error: string | null;
}) {
  const [tab, setTab] = useState<ImportTab>('pgn');
  const [pgn, setPgn] = useState('');
  const [fen, setFen] = useState('');

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
        `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=20&skip=${skip}&pgnInJson=true&tags=true&opening=true&clocks=false&evals=false`,
        { headers: { Accept: 'application/x-ndjson' } }
      );
      if (!res.ok) {
        throw new Error(res.status === 404 ? `"${username}" not found on Lichess` : `Error ${res.status}`);
      }
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
        return {
          id: (g.id as string) ?? `lich-${skip}-${i}`,
          whiteName: (wUser?.name as string) ?? 'White',
          whiteRating: (w.rating as number) ?? '',
          blackName: (bUser?.name as string) ?? 'Black',
          blackRating: (b.rating as number) ?? '',
          result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
          date: g.createdAt ? new Date(g.createdAt as number).toLocaleDateString() : '',
          timeClass: g.speed as string | undefined,
          opening,
          pgn: (g.pgn as string) ?? '',
        };
      });
      lichessSkipRef.current = skip + games.length;
      if (reset) setLichessGames(games);
      else setLichessGames(prev => [...prev, ...games]);
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
        return {
          id: `cc-${yyyy}${mm}-${i}`,
          whiteName: (w.username as string) ?? 'White',
          whiteRating: (w.rating as number) ?? '',
          blackName: (b.username as string) ?? 'Black',
          blackRating: (b.rating as number) ?? '',
          result,
          date: g.end_time ? new Date((g.end_time as number) * 1000).toLocaleDateString() : '',
          timeClass: g.time_class as string | undefined,
          opening,
          pgn: gamePgn,
        };
      });
      ccMonthBackRef.current = monthBack + 1;
      if (reset) setCcGames(games);
      else setCcGames(prev => [...prev, ...games]);
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="mx-4 w-full max-w-lg flex flex-col rounded-2xl border border-white/10 bg-[#0f1117] shadow-2xl shadow-black/60 max-h-[85vh]">

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
          {(['pgn', 'lichess', 'chesscom'] as const).map(t => (
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
              {t === 'pgn' ? 'PGN / FEN' : t === 'lichess' ? 'Lichess' : 'Chess.com'}
            </button>
          ))}
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 min-h-0 overflow-y-auto">

          {/* ── PGN / FEN tab ── */}
          {tab === 'pgn' && (
            <div className="p-4 flex flex-col gap-3">
              <textarea
                value={pgn}
                onChange={e => setPgn(e.target.value)}
                placeholder={'Paste PGN here...\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...'}
                rows={8}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs leading-5 text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-amber-400/40"
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
                  onClick={() => onImport(pgn, fen)}
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
            <div className="p-4 flex flex-col gap-3">

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
                <div className="py-12 flex flex-col items-center gap-2 text-center">
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
                  <div className="flex flex-col gap-1.5">
                    {siteGames.map(game => (
                      <GameCard key={game.id} game={game} onSelect={() => onImport(game.pgn, '')} />
                    ))}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
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
  const [reviewSubTab, setReviewSubTab] = useState<ReviewSubTab>('summary');
  const [coachByPly, setCoachByPly] = useState<Map<number, CoachFeedback | null>>(new Map());
  const [boardSize, setBoardSize] = useState(480);
  const [maxBoardWidth, setMaxBoardWidth] = useState<number | undefined>(undefined);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const activeExploreMoveRef = useRef<HTMLButtonElement | null>(null);
  const [engineSettingsOpen, setEngineSettingsOpen] = useState(false);
  const engineSettingsRef = useRef<HTMLDivElement>(null);
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
  const [showGameDetailsModal, setShowGameDetailsModal] = useState(false);
  const [gameDetailsDraft, setGameDetailsDraft] = useState<GameDetails>(EMPTY_GAME_DETAILS);
  const [showNewAnalysisModal, setShowNewAnalysisModal] = useState(false);
  const { theme, animationDuration, settings, setSettings } = useBoardSettings();
  const { settings: coachSettings } = useCoachSettings();
  const customPieces = useMemo(() => getCustomPieces(settings.pieceSetId), [settings.pieceSetId]);

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

  const goTo = useCallback((plyIndex: number, game?: AnalyzedGame) => {
    const g = game ?? analyzedGameRef.current;
    if (!g) return;
    const clamped = Math.max(-1, Math.min(plyIndex, g.moves.length - 1));
    setExploreTree(null);
    setExploreNav({ lineId: null, plyIndex: -1 });
    setCurrentPlyIndex(clamped);

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

  const currentMove = analyzedGame?.moves[currentPlyIndex] ?? null;

  const currentFen = useMemo(() => {
    if (!analyzedGame) return baseFen ?? INITIAL_FEN;
    if (currentPlyIndex < 0) return analyzedGame.initialFen ?? INITIAL_FEN;
    return analyzedGame.moves[currentPlyIndex]?.afterFen ?? INITIAL_FEN;
  }, [analyzedGame, currentPlyIndex, baseFen]);

  // Derived from exploreTree — placed here because they depend on currentFen.
  const isExploring = exploreTree !== null && exploreNav.plyIndex >= 0;

  function getNavFen(tree: ExploreTree | null, nav: ExploreNav, fallback: string): string {
    if (!tree || !nav.lineId || nav.plyIndex < 0) return fallback;
    const line = tree.lines.find(l => l.id === nav.lineId);
    return line?.moves[nav.plyIndex]?.fen ?? fallback;
  }
  const freeExploreFen = isExploring ? getNavFen(exploreTree, exploreNav, currentFen) : null;

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

  const currentEvalCp = useMemo(
    () => (currentMove?.hasEngineAnalysis ? currentMove.afterPlayedEvalCp : undefined),
    [currentMove]
  );

  const summaryFeedbacks = useMemo(() => {
    if (!analyzedGame) return [];
    try {
      return buildGameAnalysisSummaryFeedback({
        game: analyzedGame,
        persona: coachSettings.persona,
      });
    } catch {
      return [];
    }
  }, [analyzedGame, coachSettings.persona]);

  const gameReviewReport = useMemo(() => {
    if (!analyzedGame) return null;
    return buildGameReviewReport(analyzedGame);
  }, [analyzedGame]);

  const hasEngineAnalysis = useMemo(
    () => Boolean(analyzedGame?.moves.some(move => move.hasEngineAnalysis)),
    [analyzedGame]
  );


  function handleImport(pgn: string, fen: string) {
    try {
      const game = buildAnalyzedGameFromPgn({
        id: `game-${Date.now()}`,
        pgn,
        initialFen: fen.trim() || undefined,
      });
      setAnalyzedGame(game);
      setBaseFen(null);
      setCurrentPlyIndex(-1);
      setExploreTree(null);
      setExploreNav({ lineId: null, plyIndex: -1 });
      setLastMoveSquares(null);
      setParseError(null);
      setEngineError(null);
      setCoachByPly(new Map());
      setShowImportModal(false);
      setActiveTab('review');
      setReviewSubTab('summary');
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not parse that PGN/FEN.');
    }
  }

  function handleSaveAnalysis() {
    let pgn = '';
    try {
      if (exploreTree) {
        const activeMoves = getActivePath(exploreTree, exploreNav);
        const source = activeMoves.length > 0 ? activeMoves : (exploreTree.lines[0]?.moves ?? []);
        if (source.length > 0) {
          const chess = new Chess(exploreTree.rootFen);
          for (const entry of source) chess.move(entry.san);
          const movesOnly = chess.pgn().replace(/^\[.*?\]\r?\n?/gm, '').replace(/\s*\*\s*$/, '').trim();
          pgn = exploreTree.rootFen !== INITIAL_FEN
            ? `[FEN "${exploreTree.rootFen}"]\n\n${movesOnly}`
            : movesOnly;
        }
      } else if (analyzedGame && analyzedGame.moves.length > 0) {
        const chess = new Chess(analyzedGame.initialFen ?? INITIAL_FEN);
        for (const move of analyzedGame.moves) chess.move(move.san);
        pgn = chess.pgn().replace(/^\[.*?\]\r?\n?/gm, '').replace(/\s*\*\s*$/, '').trim();
      }
    } catch { /* ignore */ }
    if (!pgn) pgn = positionText.trim();
    if (!pgn) return;
    const filename = (gameDetails.white && gameDetails.black)
      ? `${gameDetails.white.replace(/\s+/g, '_')}-vs-${gameDetails.black.replace(/\s+/g, '_')}.pgn`
      : 'analysis.pgn';
    const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    setActiveTab('explore');
    setShowNewAnalysisModal(false);
  }

  function handleNewAnalysis() {
    const hasContent = analyzedGame !== null || exploreTree !== null || baseFen !== null;
    if (!hasContent) { clearAnalysis(); return; }
    setShowNewAnalysisModal(true);
  }

  async function runStockfish() {
    if (!analyzedGame || isEngineRunning) return;
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

    const moves = [...analyzedGame.moves];
    const enriched: AnalyzedGameMove[] = new Array(moves.length);
    let completed = 0;

    try {
      await Promise.all(
        moves.map(async (move, i) => {
          if (pool.terminated) return;
          enriched[i] = await enrichGameMove(move, pool, STOCKFISH_DEPTH);
          if (!pool.terminated) {
            completed++;
            setEngineProgress(completed / moves.length);
          }
        })
      );

      if (!pool.terminated) {
        const enrichedGame: AnalyzedGame = { ...analyzedGame, moves: enriched };
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
        setReviewSubTab('summary');
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
  const navCanGoBack = isExploring || canGoBack;
  const navCanGoForward = (() => {
    if (!exploreTree || !exploreNav.lineId || exploreNav.plyIndex < 0) return canGoForward;
    const line = exploreTree.lines.find(l => l.id === exploreNav.lineId);
    return line ? exploreNav.plyIndex < line.moves.length - 1 : false;
  })();

  function navGoFirst() {
    if (exploreTree && exploreNav.lineId) {
      const mainLine = exploreTree.lines[0]!;
      setExploreNav({ lineId: mainLine.id, plyIndex: -1 });
      setLastMoveSquares(null);
    } else {
      goTo(-1);
    }
  }

  function navGoBack() {
    if (!exploreTree || !exploreNav.lineId || exploreNav.plyIndex < 0) {
      goTo(currentPlyIndex - 1);
      return;
    }
    const currentLine = exploreTree.lines.find(l => l.id === exploreNav.lineId)!;
    if (exploreNav.plyIndex > 0) {
      const newPly = exploreNav.plyIndex - 1;
      setExploreNav({ lineId: currentLine.id, plyIndex: newPly });
      const entry = currentLine.moves[newPly];
      if (entry) setLastMoveSquares({ from: entry.from, to: entry.to });
    } else {
      // plyIndex === 0 — go to parent or root
      if (currentLine.parentLineId === null) {
        setExploreNav({ lineId: currentLine.id, plyIndex: -1 });
        setLastMoveSquares(null);
      } else {
        const parentPly = currentLine.divergeAtPly - 1;
        setExploreNav({ lineId: currentLine.parentLineId, plyIndex: parentPly });
        const parentLine = exploreTree.lines.find(l => l.id === currentLine.parentLineId);
        const entry = parentPly >= 0 ? parentLine?.moves[parentPly] : null;
        if (entry) setLastMoveSquares({ from: entry.from, to: entry.to });
        else setLastMoveSquares(null);
      }
    }
  }

  function navGoForward() {
    if (!exploreTree || !exploreNav.lineId || exploreNav.plyIndex < 0) {
      goTo(currentPlyIndex + 1);
      return;
    }
    const currentLine = exploreTree.lines.find(l => l.id === exploreNav.lineId)!;
    const nextPly = exploreNav.plyIndex + 1;
    const entry = currentLine.moves[nextPly];
    if (!entry) return;
    setExploreNav({ lineId: currentLine.id, plyIndex: nextPly });
    setLastMoveSquares({ from: entry.from, to: entry.to });
  }

  function navGoLast() {
    if (exploreTree && exploreNav.lineId) {
      const currentLine = exploreTree.lines.find(l => l.id === exploreNav.lineId);
      if (currentLine && currentLine.moves.length > 0) {
        const lastPly = currentLine.moves.length - 1;
        setExploreNav({ lineId: currentLine.id, plyIndex: lastPly });
        const entry = currentLine.moves[lastPly];
        if (entry) setLastMoveSquares({ from: entry.from, to: entry.to });
      }
    } else {
      goTo(totalMoves - 1);
    }
  }

  // Close context menu on any outside click
  useEffect(() => {
    if (!moveContextMenu) return;
    const close = () => setMoveContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close); };
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
      } catch {
        setPositionError('Invalid PGN');
      }
    }
  }

  // boardFen is the FEN actually shown and analyzed — follows game navigation unless the
  // user has played a move freely, in which case freeExploreFen takes over.
  const boardFen = freeExploreFen ?? currentFen;
  const openingPosition = useOpeningName(boardFen);

  // Parse clock annotations from the raw PGN once per game load.
  const pgnClocks = useMemo(() => parsePgnClocks(rawPgn), [rawPgn]);

  // Material captured by each side at the current board position.
  const material = useMemo(() => computeMaterial(boardFen), [boardFen]);

  // Per-color clock at the current ply (null if no clock data in PGN).
  const playerClocks = useMemo(
    () => getClocksAtPly(pgnClocks, currentPlyIndex),
    [pgnClocks, currentPlyIndex]
  );

  // Fetch player avatars from chess.com's public API when a game is imported.
  useEffect(() => {
    if (!gameDetails.location.includes('chess.com')) return;
    const controller = new AbortController();
    const fetchAvatar = async (username: string, set: (url: string | null) => void) => {
      if (!username) return;
      try {
        const res = await fetch(
          `https://api.chess.com/pub/player/${username.toLowerCase()}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json() as { avatar?: string };
        set(data.avatar ?? null);
      } catch { /* ignore — network or CORS failure */ }
    };
    fetchAvatar(gameDetails.white, setWhiteAvatar);
    fetchAvatar(gameDetails.black, setBlackAvatar);
    return () => controller.abort();
  }, [gameDetails.white, gameDetails.black, gameDetails.location]);
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

  const bestMoveArrow = useMemo(
    () =>
      !settings.hideArrows && bestMoveUci && bestMoveUci.length >= 4 && !isKnightMove(bestMoveUci)
        ? [[bestMoveUci.slice(0, 2), bestMoveUci.slice(2, 4), 'rgb(22, 163, 74)']]
        : [],
    [bestMoveUci, settings.hideArrows]
  );

  const knightArrowOverlay = useMemo(() => {
    if (settings.hideArrows || !bestMoveUci || !isKnightMove(bestMoveUci)) return null;
    return (
      <KnightArrow
        from={bestMoveUci.slice(0, 2)}
        to={bestMoveUci.slice(2, 4)}
        color="rgb(22, 163, 74)"
        boardSize={boardSize}
        flipped={settings.flipBoard}
      />
    );
  }, [bestMoveUci, boardSize, settings.flipBoard, settings.hideArrows]);

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
      moves.push({ id: gm.id ?? crypto.randomUUID(), san: result.san, fen: chess.fen(), from: result.from, to: result.to });
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
    setExploreNav({ lineId, plyIndex });
    const line = exploreTree.lines.find(l => l.id === lineId);
    const entry = line?.moves[plyIndex];
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

    const rows: React.ReactNode[] = [];
    for (const pair of pairs) {
      rows.push(
        <div key={`ml-${pair.moveNum}-${pair.white?.ply ?? 'bx'}`} className="flex items-center">
          <span className="w-8 shrink-0 text-right font-mono text-[13px] text-gray-600 pr-1">{pair.moveNum}.</span>
          <div className="flex flex-1">
            {pair.white ? (
              <button type="button"
                ref={nav.lineId === line.id && nav.plyIndex === pair.white.ply ? activeExploreMoveRef : undefined}
                onClick={() => navigateTo(line.id, pair.white!.ply)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMoveContextMenu({ x: e.clientX, y: e.clientY, lineId: line.id, plyIndex: pair.white!.ply }); }}
                className={`flex min-w-0 flex-1 items-center rounded px-2 py-[5px] font-mono text-[13px] transition-colors ${
                  nav.lineId === line.id && nav.plyIndex === pair.white.ply
                    ? 'bg-amber-400/15 text-amber-300' : 'text-gray-200 hover:bg-white/5 hover:text-white'
                }`}>{pair.white.san}</button>
            ) : <span className="flex-1" />}
            {pair.black ? (
              <button type="button"
                ref={nav.lineId === line.id && nav.plyIndex === pair.black.ply ? activeExploreMoveRef : undefined}
                onClick={() => navigateTo(line.id, pair.black!.ply)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMoveContextMenu({ x: e.clientX, y: e.clientY, lineId: line.id, plyIndex: pair.black!.ply }); }}
                className={`flex min-w-0 flex-1 items-center rounded px-2 py-[5px] font-mono text-[13px] transition-colors ${
                  nav.lineId === line.id && nav.plyIndex === pair.black.ply
                    ? 'bg-amber-400/15 text-amber-300' : 'text-gray-200 hover:bg-white/5 hover:text-white'
                }`}>{pair.black.san}</button>
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div ref={boardContainerRef} className="flex-1 min-h-0 overflow-hidden p-3 flex justify-center">
        <div className="flex h-full gap-3">

          <BoardPanel
            evalCp={displayEvalCp}
            displayPerspective={settings.flipBoard ? 'black' : 'white'}
            reserveEvalSpace={true}
            boardSize={boardSize}
            onBoardSizeChange={setBoardSize}
            maxWidth={maxBoardWidth}
            overlay={knightArrowOverlay}
            topBar={
              <PlayerRow
                name={settings.flipBoard ? (gameDetails.white || 'White') : (gameDetails.black || 'Black')}
                elo={settings.flipBoard ? gameDetails.whiteElo : gameDetails.blackElo}
                avatar={settings.flipBoard ? whiteAvatar : blackAvatar}
                captured={settings.flipBoard ? material.whiteCaptured : material.blackCaptured}
                advantage={settings.flipBoard ? material.advantage : -material.advantage}
                clock={analyzedGame ? (settings.flipBoard ? playerClocks.w : playerClocks.b) : null}
                isActive={settings.flipBoard ? boardFen.split(' ')[1] === 'w' : boardFen.split(' ')[1] === 'b'}
                playerColor={settings.flipBoard ? 'white' : 'black'}
              />
            }
            bottomBar={
              <div className="flex items-center py-1.5 gap-2">
                <div className="flex-1 min-w-0">
                  <PlayerRow
                    name={settings.flipBoard ? (gameDetails.black || 'Black') : (gameDetails.white || 'White')}
                    elo={settings.flipBoard ? gameDetails.blackElo : gameDetails.whiteElo}
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
                {(['explore', 'review'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`relative flex-1 h-full text-xs font-medium transition-colors ${
                      activeTab === tab ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {tab === 'explore' ? 'Explore' : 'Game Review'}
                    {activeTab === tab && (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-amber-400" />
                    )}
                  </button>
                ))}
              </div>
            }
            coach={
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
              />
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
                    <span className="flex-1 truncate text-sm font-medium text-gray-300">
                      {gameDetails.white || 'White'}
                      {gameDetails.whiteElo ? ` (${gameDetails.whiteElo})` : ''}
                      {' – '}
                      {gameDetails.black || 'Black'}
                      {gameDetails.blackElo ? ` (${gameDetails.blackElo})` : ''}
                    </span>
                    <button
                      type="button"
                      title="Edit game details"
                      onClick={() => { setGameDetailsDraft(gameDetails); setShowGameDetailsModal(true); }}
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
                    <div className="flex gap-1.5 mt-0.5">
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
                      <button
                        type="button"
                        onClick={handleSaveAnalysis}
                        className="flex flex-1 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-gray-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0">
                          <path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5V5.457c0-.398-.158-.78-.44-1.06L11.063 1.44A1.5 1.5 0 0 0 10.043 1H2.5Zm0 1h7.5v3a1 1 0 0 0 1 1h3v7.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5ZM5 11.5a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5Zm0-2a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5ZM5 7.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1H5Z"/>
                        </svg>
                        Save
                      </button>
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
                          onChange={e => setSettings({ engineLines: Number(e.target.value) as 1 | 2 | 3 })}
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

                        {/* Actions bar */}
                        <div className="shrink-0 flex items-center gap-2 border-b border-white/5 px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => void runStockfish()}
                            disabled={isEngineRunning || hasEngineAnalysis}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                              hasEngineAnalysis
                                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 cursor-default'
                                : 'bg-amber-400 text-[#0f1117] hover:bg-amber-300'
                            }`}
                          >
                            {hasEngineAnalysis ? '✓ Analyzed' : 'Analyze'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setParseError(null); setShowImportModal(true); }}
                            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-white/20 hover:text-white"
                          >
                            Import
                          </button>
                          {engineError && (
                            <span className="text-[10px] text-red-400">{engineError}</span>
                          )}
                        </div>

                        {/* Sub-tabs: Summary | Moves */}
                        <div className="flex shrink-0 border-b border-white/5">
                          {(['summary', 'moves'] as const).map(sub => (
                            <button
                              key={sub}
                              type="button"
                              onClick={() => setReviewSubTab(sub)}
                              className={`relative flex-1 py-2.5 text-xs font-medium capitalize transition-colors ${
                                reviewSubTab === sub ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                              }`}
                            >
                              {sub === 'summary' ? 'Summary' : 'Moves'}
                              {reviewSubTab === sub && (
                                <span className="absolute inset-x-0 bottom-0 h-px bg-amber-400" />
                              )}
                            </button>
                          ))}
                        </div>

                        {/* Tab content */}
                        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                          {reviewSubTab === 'summary' ? (
                            <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
                              <GameReviewReportPanel
                                report={gameReviewReport}
                                hasEngineAnalysis={hasEngineAnalysis}
                              />
                              {summaryFeedbacks.length > 0 && (
                                <GameRecapPanel
                                  summaries={summaryFeedbacks}
                                  hasEngineAnalysis={hasEngineAnalysis}
                                />
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-1 min-h-0 flex-col">
                              <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2 shrink-0">
                                <span className="flex-1 truncate text-sm font-medium text-gray-300">
                                  {gameDetails.white || 'White'}
                                  {gameDetails.whiteElo ? ` (${gameDetails.whiteElo})` : ''}
                                  {' – '}
                                  {gameDetails.black || 'Black'}
                                  {gameDetails.blackElo ? ` (${gameDetails.blackElo})` : ''}
                                </span>
                                <button
                                  type="button"
                                  title="Edit game details"
                                  onClick={() => { setGameDetailsDraft(gameDetails); setShowGameDetailsModal(true); }}
                                  className="shrink-0 text-gray-600 transition-colors hover:text-gray-300"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                    <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                                    <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                                  </svg>
                                </button>
                              </div>
                              <AnalysisMoveList
                                game={analyzedGame}
                                currentPlyIndex={currentPlyIndex}
                                onNavigate={goTo}
                              />
                            </div>
                          )}
                        </div>

                      </div>
                    )}
                  </>
                )}

                {/* Position — FEN / PGN input strip */}
                <div className="shrink-0 border-t border-white/5">
                  <div className="flex items-center gap-2 px-3 pt-2 pb-0.5">
                    <div className="flex overflow-hidden rounded border border-white/8 text-[10px] font-medium">
                      {(['pgn', 'fen'] as const).map((m, i) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPositionMode(m)}
                          className={`px-2 py-0.5 uppercase tracking-wide transition-colors ${
                            i > 0 ? 'border-l border-white/8' : ''
                          } ${
                            positionMode === m
                              ? 'bg-white/10 text-white'
                              : 'text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    {positionError && (
                      <span className="text-[10px] text-red-400 leading-none">{positionError}</span>
                    )}
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => { setParseError(null); setShowImportModal(true); }}
                      className="flex items-center gap-1 rounded border border-amber-400/35 bg-amber-400/8 px-2.5 py-0.5 text-[10px] font-medium text-amber-300 transition-colors hover:border-amber-400/55 hover:bg-amber-400/15 hover:text-amber-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                        <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v.64c.57.265.94.876.856 1.546l-.64 5.124A2.5 2.5 0 0 1 12.733 15H3.266a2.5 2.5 0 0 1-2.481-2.19l-.64-5.124A1.5 1.5 0 0 1 1 6.14V3.5ZM2 6h12v-.5a.5.5 0 0 0-.5-.5H9c-.964 0-1.71-.629-2.174-1.154C6.374 3.334 5.82 3 5.264 3H2.5a.5.5 0 0 0-.5.5V6Zm-.367 1a.5.5 0 0 0-.496.562l.64 5.124A1.5 1.5 0 0 0 3.266 14h9.468a1.5 1.5 0 0 0 1.489-1.314l.64-5.124A.5.5 0 0 0 14.367 7H1.633Z"/>
                      </svg>
                      Import Game
                    </button>
                  </div>
                  <div className="px-3 pb-2.5">
                    <div className="relative">
                      <textarea
                        ref={positionTextareaRef}
                        value={positionText}
                        onChange={e => { setPositionText(e.target.value); setPositionDirty(true); setPositionError(null); }}
                        rows={3}
                        spellCheck={false}
                        className={`w-full resize-none rounded-lg border bg-white/3 px-2.5 py-1.5 pr-8 font-mono text-[10px] leading-relaxed text-gray-300 placeholder-gray-600 focus:outline-none transition-colors ${
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a2e] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="shrink-0 flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 className="text-base font-semibold text-white">Game Details</h2>
              <button type="button" onClick={() => setShowGameDetailsModal(false)} className="text-gray-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto space-y-2.5 px-5 py-4">
              {/* White / Black rows */}
              {(['white', 'black'] as const).map(color => (
                <div key={color} className="flex gap-2">
                  <input
                    type="text"
                    placeholder={color === 'white' ? 'White Player' : 'Black Player'}
                    value={gameDetailsDraft[color]}
                    onChange={e => setGameDetailsDraft(d => ({ ...d, [color]: e.target.value }))}
                    className="flex-1 rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-white/20 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Rating"
                    value={gameDetailsDraft[color === 'white' ? 'whiteElo' : 'blackElo']}
                    onChange={e => setGameDetailsDraft(d => ({ ...d, [color === 'white' ? 'whiteElo' : 'blackElo']: e.target.value }))}
                    className="w-20 rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-white/20 focus:outline-none"
                  />
                </div>
              ))}
              {/* Result */}
              <select
                value={gameDetailsDraft.result}
                onChange={e => setGameDetailsDraft(d => ({ ...d, result: e.target.value }))}
                className="w-full rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-sm text-gray-200 focus:border-white/20 focus:outline-none"
              >
                {[['*', 'No Result (*)'], ['1-0', 'White wins (1-0)'], ['0-1', 'Black wins (0-1)'], ['1/2-1/2', 'Draw (½-½)']].map(([v, l]) => (
                  <option key={v} value={v} className="bg-[#1a1a2e]">{l}</option>
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
                  className="w-full rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-white/20 focus:outline-none"
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
                    className="flex-1 rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-white/20 focus:outline-none"
                  />
                ))}
              </div>
            </div>
            <div className="shrink-0 flex gap-2 border-t border-white/8 px-5 py-4">
              <button type="button" onClick={() => setShowGameDetailsModal(false)}
                className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-white/20 hover:text-white">
                Cancel
              </button>
              <button type="button" onClick={() => { setGameDetails(gameDetailsDraft); setShowGameDetailsModal(false); }}
                className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-400">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Analysis confirmation modal */}
      {showNewAnalysisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowNewAnalysisModal(false)}>
          <div className="w-80 rounded-xl border border-white/10 bg-[#14161f] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
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
