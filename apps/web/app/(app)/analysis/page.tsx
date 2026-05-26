'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from '@firstmove/core';
import { CoachBubble } from '@/components/practice/CoachBubble';
import { useBoardSettings } from '@/hooks/useBoardSettings';
import { useCoachSettings } from '@/hooks/useCoachSettings';
import { getCustomPieces } from '@/lib/piecesets';
import { BoardSettingsPopover } from '@/components/board/BoardSettingsPopover';
import {
  buildAnalyzedGameFromPgn,
  buildGameAnalysisCoachFeedbackFromAnalyzedGameMove,
  buildGameAnalysisSummaryFeedback,
  classifyAnalyzedMoveByCentipawnLoss,
  type CoachFeedback,
} from '@/lib/coachFeedback';
import type { AnalyzedGame, AnalyzedGameMove } from '@firstmove/core';
import type { CoachClassification } from '@firstmove/core';
import { computeMaterial, type PieceType } from '@/lib/capturedPieces';

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EVAL_BAR_CP_LIMIT = 600;
const INITIAL_EVAL_CP = 20;
const STOCKFISH_DEPTH = 10;
const STOCKFISH_MOVE_LIMIT = 40;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionGame {
  id: string;
  label: string;
  game: AnalyzedGame;
  hasEngine: boolean;
}

type StockfishResponse = {
  game: AnalyzedGame;
  analyzedMoves: number;
  requestedMoves: number;
  maxMoves: number;
  depth: number;
};

type BottomPanelTab = 'engine' | 'recap' | 'games';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEval(cp: number | undefined): string {
  if (typeof cp !== 'number' || !Number.isFinite(cp)) return '—';
  if (Math.abs(cp) >= 9000) return cp > 0 ? '#' : '-#';
  if (Math.abs(cp) < 10) return '0.0';
  return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
}

function getMoveClassification(move: AnalyzedGameMove): CoachClassification | null {
  if (!move.hasEngineAnalysis) return null;
  const afterPlayedEvalCp = move.afterPlayedEvalCp;
  if (typeof afterPlayedEvalCp !== 'number') return null;

  const playedPlayerEval = move.playedBy === 'white' ? afterPlayedEvalCp : -afterPlayedEvalCp;
  const bestPlayerEval =
    typeof move.afterBestEvalCp === 'number'
      ? move.playedBy === 'white'
        ? move.afterBestEvalCp
        : -move.afterBestEvalCp
      : undefined;
  const centipawnLoss =
    typeof bestPlayerEval === 'number' ? Math.max(0, bestPlayerEval - playedPlayerEval) : 0;

  return classifyAnalyzedMoveByCentipawnLoss({
    centipawnLoss,
    isBestMove: move.bestMoveSan === move.san || centipawnLoss <= 10,
    isSacrifice: move.isSacrifice,
    isOnlyGoodMove: move.isOnlyGoodMove,
    isCriticalMove: move.isCriticalMove,
  });
}

const CLASSIFICATION_DOT: Partial<Record<CoachClassification, string>> = {
  brilliant: 'bg-cyan-400',
  great: 'bg-blue-400',
  miss: 'bg-rose-400',
  inaccuracy: 'bg-yellow-400',
  mistake: 'bg-orange-400',
  blunder: 'bg-red-500',
};

function extractGameTitle(pgn: string): string | null {
  const white = pgn.match(/\[White "([^"]+)"\]/)?.[1];
  const black = pgn.match(/\[Black "([^"]+)"\]/)?.[1];
  if (white && black) return `${white} vs ${black}`;
  if (white) return white;
  return null;
}

function extractPlayerInfo(pgn: string): {
  white: { name: string; rating?: number };
  black: { name: string; rating?: number };
} {
  const parseName = (tag: string) => pgn.match(new RegExp(`\\[${tag} "([^"]+)"\\]`))?.[1];
  const parseElo = (tag: string) => {
    const raw = parseName(tag);
    if (!raw || raw === '?' || raw === '-') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  return {
    white: { name: parseName('White') ?? 'White', rating: parseElo('WhiteElo') },
    black: { name: parseName('Black') ?? 'Black', rating: parseElo('BlackElo') },
  };
}

// ─── Player Panel ─────────────────────────────────────────────────────────────

const BLACK_SYMBOLS: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
const WHITE_SYMBOLS: Record<string, string> = { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' };

function PlayerPanel({
  name,
  rating,
  color,
  captured,
  advantage,
}: {
  name: string;
  rating?: number;
  color: 'white' | 'black';
  captured: PieceType[];
  advantage: number;
}) {
  // Show the opponent's piece symbols next to each player (what they've taken)
  const symbols = color === 'white' ? BLACK_SYMBOLS : WHITE_SYMBOLS;
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 px-1">
      <div
        className={`h-3.5 w-3.5 shrink-0 rounded-sm border ${
          color === 'white' ? 'bg-zinc-100 border-white/20' : 'bg-zinc-700 border-white/10'
        }`}
      />
      <span className="max-w-40 truncate text-xs font-medium text-gray-300">{name}</span>
      {rating != null && <span className="shrink-0 text-[10px] text-gray-600">{rating}</span>}
      {captured.length > 0 && (
        <div className="flex min-w-0 items-center gap-px">
          {captured.map((piece, i) => (
            <span key={i} className="select-none text-sm leading-none text-gray-400">
              {symbols[piece]}
            </span>
          ))}
          {advantage > 0 && (
            <span className="ml-1.5 text-[10px] font-medium text-gray-500">+{advantage}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Eval Bar ─────────────────────────────────────────────────────────────────

function EvalBar({
  evalCp,
  reserveSpace = false,
  size,
}: {
  evalCp?: number;
  reserveSpace?: boolean;
  size: number;
}) {
  const barStyle = { height: size };

  if (typeof evalCp !== 'number' || !Number.isFinite(evalCp)) {
    return reserveSpace ? (
      <div
        className="relative mr-2 hidden w-7 shrink-0 overflow-hidden rounded-md border border-white/15 bg-[#181818] shadow-inner shadow-black/40 sm:block"
        style={barStyle}
        title="Engine evaluation loading"
        aria-label="Engine evaluation loading"
      >
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-zinc-100 opacity-70" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-amber-400/45" />
      </div>
    ) : null;
  }

  const clamped = Math.max(-EVAL_BAR_CP_LIMIT, Math.min(EVAL_BAR_CP_LIMIT, evalCp));
  const whiteHeight = 50 + (clamped / EVAL_BAR_CP_LIMIT) * 45;
  const label = formatEval(evalCp);
  const labelOnWhite = evalCp < 0;

  return (
    <div
      className="relative mr-2 hidden w-7 shrink-0 overflow-hidden rounded-md border border-white/15 bg-[#181818] shadow-inner shadow-black/40 sm:block"
      style={barStyle}
      title={`Engine evaluation: ${label}`}
      aria-label={`Engine evaluation ${label}`}
    >
      <div
        className="absolute inset-x-0 bottom-0 bg-zinc-100 transition-[height] duration-300"
        style={{ height: `${whiteHeight}%` }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-amber-400/45" />
      <div
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 text-[10px] font-semibold tabular-nums ${
          labelOnWhite ? 'bottom-1 text-zinc-950' : 'top-1 text-zinc-100'
        }`}
      >
        {label}
      </div>
    </div>
  );
}

// ─── Nav Button ───────────────────────────────────────────────────────────────

function NavBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center px-5 py-2.5 text-gray-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
    >
      {children}
    </button>
  );
}

// ─── Move List ────────────────────────────────────────────────────────────────

function formatClockMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface MoveItem {
  san: string;
  plyIndex: number;
  classification: CoachClassification | null;
  evalCp?: number;
  clockRemainingMs?: number;
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
      classification: getMoveClassification(move),
      evalCp: move.hasEngineAnalysis ? move.afterPlayedEvalCp : undefined,
      clockRemainingMs: move.clockRemainingMs,
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
      className={`flex min-w-0 flex-1 flex-col rounded px-2 py-1 font-mono text-sm transition-colors ${
        isActive
          ? 'bg-amber-400/15 text-amber-300'
          : 'text-gray-300 hover:bg-white/5 hover:text-white'
      }`}
    >
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate">{item.san}</span>
        {dotColor && <span className={`ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />}
      </div>
      {item.clockRemainingMs != null && (
        <span className={`text-[9px] tabular-nums leading-tight ${isActive ? 'text-amber-300/50' : 'text-gray-600'}`}>
          {formatClockMs(item.clockRemainingMs)}
        </span>
      )}
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
  const hasEngine = game.moves.some(m => m.hasEngineAnalysis);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPlyIndex]);

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/5 bg-(--bg-panel)">
      <div className="shrink-0 flex items-center justify-between border-b border-white/5 px-4 pb-2 pt-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">Moves</h3>
        <div className="flex items-center gap-2">
          {hasEngine && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Engine
            </span>
          )}
          <span className="text-[11px] text-gray-600">{game.moves.length} moves</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {pairs.map(pair => {
          const isActiveRow =
            pair.white?.plyIndex === currentPlyIndex || pair.black?.plyIndex === currentPlyIndex;
          return (
            <div
              key={pair.moveNumber}
              ref={isActiveRow ? activeRowRef : undefined}
              className="flex items-center gap-1 py-0.5"
            >
              <span className="w-7 shrink-0 select-none pr-1 text-right font-mono text-[11px] text-gray-600">
                {pair.moveNumber}.
              </span>
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
          );
        })}
      </div>
    </div>
  );
}

// ─── Engine Lines ─────────────────────────────────────────────────────────────

function EngineLines({ move }: { move: AnalyzedGameMove | null }) {
  if (!move || !move.hasEngineAnalysis) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-3 text-center">
        <p className="text-xs leading-5 text-gray-600">
          Run Stockfish to see the best lines and evaluation for each position.
        </p>
      </div>
    );
  }

  const bestLine = move.bestLine;
  const alternatives = move.bestMoveAlternatives
    ?.filter(alt => alt.san !== move.bestMoveSan)
    .slice(0, 2);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2">
      {move.bestMoveSan && (
        <div className="rounded-lg border border-amber-400/15 bg-amber-400/5 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-amber-400/70">
              Best line
            </span>
            {typeof move.afterBestEvalCp === 'number' && (
              <span className="tabular-nums text-[10px] text-amber-300/70">
                {formatEval(move.afterBestEvalCp)}
              </span>
            )}
          </div>
          {bestLine && bestLine.length > 0 ? (
            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
              {bestLine.map((lineMove, i) => (
                <span
                  key={i}
                  className={`font-mono text-xs ${
                    lineMove.isKeyMove ? 'font-semibold text-amber-300' : 'text-gray-300'
                  }`}
                >
                  {lineMove.san}
                </span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-xs font-semibold text-amber-300">
              {move.bestMoveSan}
            </span>
          )}
        </div>
      )}

      {alternatives && alternatives.length > 0 && (
        <>
          {alternatives.map((alt, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/5 px-3 py-2"
            >
              <span className="font-mono text-xs text-gray-400">{alt.san}</span>
              {typeof alt.evalCp === 'number' && (
                <span className="tabular-nums text-[10px] text-gray-500">
                  {formatEval(alt.evalCp)}
                </span>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Session Games List ────────────────────────────────────────────────────────

type CoachEvidence = NonNullable<CoachFeedback['evidence']>;

function CoachEvidenceMoves({
  moves,
}: {
  moves: Array<{ san: string; isKeyMove?: boolean; evalCp?: number }>;
}) {
  return (
    <div className="flex flex-wrap gap-x-1.5 gap-y-1">
      {moves.map((move, index) => (
        <span
          key={`${move.san}-${index}`}
          className={`rounded px-1.5 py-0.5 font-mono text-xs ${
            move.isKeyMove
              ? 'bg-amber-400/15 font-semibold text-amber-300'
              : 'bg-white/[0.03] text-gray-300'
          }`}
          title={typeof move.evalCp === 'number' ? `Eval ${formatEval(move.evalCp)}` : undefined}
        >
          {move.san}
        </span>
      ))}
    </div>
  );
}

function CoachEvidenceDetails({ evidence }: { evidence: CoachEvidence }) {
  if (evidence.kind === 'line') {
    return (
      <div className="space-y-2">
        <CoachEvidenceMoves moves={evidence.moves} />
        {evidence.summary && <p className="text-xs leading-5 text-gray-500">{evidence.summary}</p>}
      </div>
    );
  }

  if (evidence.kind === 'single_move') {
    return (
      <div className="space-y-2">
        <CoachEvidenceMoves moves={[evidence.move]} />
        {evidence.summary && <p className="text-xs leading-5 text-gray-500">{evidence.summary}</p>}
      </div>
    );
  }

  if (evidence.kind === 'square') {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {evidence.squares.map(square => (
            <span
              key={square}
              className="rounded border border-amber-400/20 bg-amber-400/10 px-2 py-1 font-mono text-xs font-semibold text-amber-300"
            >
              {square}
            </span>
          ))}
        </div>
        {evidence.summary && <p className="text-xs leading-5 text-gray-500">{evidence.summary}</p>}
      </div>
    );
  }

  if (evidence.kind === 'piece') {
    return (
      <div className="space-y-2">
        <div className="grid gap-1.5">
          {evidence.pieces.map(piece => (
            <div
              key={`${piece.role}-${piece.square}`}
              className="flex items-center justify-between gap-2 rounded border border-white/5 bg-white/[0.03] px-2.5 py-1.5"
            >
              <span className="truncate text-xs capitalize text-gray-300">
                {piece.role.replace(/_/g, ' ')}
              </span>
              <span className="font-mono text-xs font-semibold text-amber-300">{piece.square}</span>
            </div>
          ))}
        </div>
        {evidence.summary && <p className="text-xs leading-5 text-gray-500">{evidence.summary}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {evidence.keyMove && (
        <CoachEvidenceMoves moves={[{ san: evidence.keyMove, isKeyMove: true }]} />
      )}
      {evidence.targetSquares && evidence.targetSquares.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {evidence.targetSquares.map(square => (
            <span
              key={square}
              className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-xs text-gray-300"
            >
              {square}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs leading-5 text-gray-500">{evidence.summary}</p>
    </div>
  );
}

function CoachAnalysisPanel({
  feedback,
  move,
}: {
  feedback: CoachFeedback | null;
  move: AnalyzedGameMove | null;
}) {
  const evidence = feedback?.evidence;
  const moveLabel =
    move && move.plyIndex >= 0
      ? `${Math.floor(move.plyIndex / 2) + 1}${move.playedBy === 'black' ? '...' : '.'} ${move.san}`
      : null;

  return (
    <div className="shrink-0 rounded-xl border border-white/5 bg-(--bg-panel)">
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Coach analysis
          </h3>
          {moveLabel && (
            <p className="mt-0.5 truncate font-mono text-xs text-gray-400">{moveLabel}</p>
          )}
        </div>
        {feedback && (
          <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 text-gray-400">
            {feedback.label}
          </span>
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        {evidence ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-white">{evidence.title}</p>
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-amber-400/70">
                {evidence.actionLabel}
              </span>
            </div>
            <CoachEvidenceDetails evidence={evidence} />
          </div>
        ) : (
          <p className="text-xs leading-5 text-gray-600">
            {feedback
              ? 'This move has a coach note, but no concrete line or target is attached yet.'
              : 'Select a move after importing a game to see the concrete coach evidence.'}
          </p>
        )}

        {feedback?.secondary && (
          <div className="border-t border-white/5 pt-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 text-gray-400">
                {feedback.secondary.label}
              </span>
              <span className="truncate text-xs font-semibold text-gray-300">
                {feedback.secondary.title}
              </span>
            </div>
            <p className="text-xs leading-5 text-gray-500">{feedback.secondary.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

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
              <div className="rounded border border-white/5 bg-white/[0.03] px-2 py-1.5">
                <span className="block text-[10px] uppercase tracking-wider text-gray-600">
                  Best move
                </span>
                <span className="font-mono text-xs font-semibold text-emerald-300">
                  {gameSummary.variables.bestMoveSan}
                </span>
              </div>
            )}
            {typeof gameSummary.variables.worstMoveSan === 'string' && (
              <div className="rounded border border-white/5 bg-white/[0.03] px-2 py-1.5">
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

function SessionGamesList({
  games,
  currentGameId,
  onSelect,
}: {
  games: SessionGame[];
  currentGameId?: string;
  onSelect: (game: AnalyzedGame) => void;
}) {
  if (games.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-3 text-center">
        <p className="text-xs leading-5 text-gray-600">
          Imported games appear here. You can switch between them any time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2">
      {games.map(sg => (
        <button
          key={sg.id}
          type="button"
          onClick={() => onSelect(sg.game)}
          className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
            sg.id === currentGameId
              ? 'border-amber-400/30 bg-amber-400/10'
              : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
          }`}
        >
          <span
            className={`block truncate text-xs font-medium ${
              sg.id === currentGameId ? 'text-amber-300' : 'text-gray-300'
            }`}
          >
            {sg.label}
          </span>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] text-gray-600">{sg.game.moves.length} moves</span>
            {sg.hasEngine && <span className="text-[10px] text-emerald-500/80">● Engine</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

function ImportModal({
  onClose,
  onImport,
  error,
}: {
  onClose: () => void;
  onImport: (pgn: string, fen: string) => void;
  error: string | null;
}) {
  const [pgn, setPgn] = useState('');
  const [fen, setFen] = useState('');

  async function handleFileUpload(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setPgn(text);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f1117] p-6 shadow-2xl shadow-black/60">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Import a game</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Paste PGN notation or upload a file. Add an optional starting FEN for non-standard
              positions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-3">
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
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const [analyzedGame, setAnalyzedGame] = useState<AnalyzedGame | null>(null);
  const [currentPlyIndex, setCurrentPlyIndex] = useState(-1);
  const [lastMoveSquares, setLastMoveSquares] = useState<{ from: string; to: string } | null>(null);
  const [sessionGames, setSessionGames] = useState<SessionGame[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [engineStatus, setEngineStatus] = useState<string | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [activeBottomPanel, setActiveBottomPanel] = useState<BottomPanelTab>('engine');
  const [boardSize, setBoardSize] = useState(480);
  const [playerInfo, setPlayerInfo] = useState<{
    white: { name: string; rating?: number };
    black: { name: string; rating?: number };
  } | null>(null);

  const { theme, animationDuration, settings, setSettings } = useBoardSettings();
  const { settings: coachSettings } = useCoachSettings();
  const customPieces = useMemo(() => getCustomPieces(settings.pieceSetId), [settings.pieceSetId]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Stable refs so callbacks don't go stale
  const analyzedGameRef = useRef<AnalyzedGame | null>(null);
  analyzedGameRef.current = analyzedGame;
  const currentPlyRef = useRef(-1);
  currentPlyRef.current = currentPlyIndex;
  const totalMovesRef = useRef(0);
  totalMovesRef.current = analyzedGame?.moves.length ?? 0;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const size = Math.min(el.clientWidth, el.clientHeight);
      if (size > 0) setBoardSize(size);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);

  const goTo = useCallback((plyIndex: number, game?: AnalyzedGame) => {
    const g = game ?? analyzedGameRef.current;
    if (!g) return;
    const clamped = Math.max(-1, Math.min(plyIndex, g.moves.length - 1));
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

  const currentMove = analyzedGame?.moves[currentPlyIndex] ?? null;

  const currentFen = useMemo(() => {
    if (!analyzedGame) return INITIAL_FEN;
    if (currentPlyIndex < 0) return analyzedGame.initialFen ?? INITIAL_FEN;
    return analyzedGame.moves[currentPlyIndex]?.afterFen ?? INITIAL_FEN;
  }, [analyzedGame, currentPlyIndex]);

  const currentEvalCp = useMemo(
    () => (currentMove?.hasEngineAnalysis ? currentMove.afterPlayedEvalCp : undefined),
    [currentMove]
  );

  // Show "0.0" at the initial position (no game loaded, or before any move) — mirrors
  // PracticeBoard's INITIAL_POSITION_EVAL_CP fallback so the eval bar always has a label.
  const displayEvalCp = currentEvalCp ?? (currentPlyIndex <= -1 ? INITIAL_EVAL_CP : undefined);

  const material = useMemo(() => computeMaterial(currentFen), [currentFen]);

  const coachFeedback: CoachFeedback | null = useMemo(() => {
    if (!analyzedGame || !currentMove) return null;
    try {
      const feedbacks = buildGameAnalysisCoachFeedbackFromAnalyzedGameMove({
        game: analyzedGame,
        move: currentMove,
        persona: coachSettings.persona,
      });
      return feedbacks[0] ?? null;
    } catch {
      return null;
    }
  }, [analyzedGame, currentMove, coachSettings.persona]);

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

  const hasEngineAnalysis = useMemo(
    () => Boolean(analyzedGame?.moves.some(move => move.hasEngineAnalysis)),
    [analyzedGame]
  );

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMoveSquares) {
      styles[lastMoveSquares.from] = { background: 'rgba(255, 210, 0, 0.35)' };
      styles[lastMoveSquares.to] = { background: 'rgba(255, 210, 0, 0.52)' };
    }
    return styles;
  }, [lastMoveSquares]);

  function handleImport(pgn: string, fen: string) {
    try {
      const game = buildAnalyzedGameFromPgn({
        id: `game-${Date.now()}`,
        pgn,
        initialFen: fen.trim() || undefined,
      });
      setAnalyzedGame(game);
      setCurrentPlyIndex(-1);
      setLastMoveSquares(null);
      setParseError(null);
      setEngineError(null);
      setEngineStatus(null);
      setShowImportModal(false);

      const label = extractGameTitle(pgn) ?? `Game ${sessionGames.length + 1}`;
      setPlayerInfo(extractPlayerInfo(pgn));
      setSessionGames(prev => [{ id: game.id, label, game, hasEngine: false }, ...prev]);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not parse that PGN/FEN.');
    }
  }

  async function runStockfish() {
    if (!analyzedGame || isEngineRunning) return;
    setIsEngineRunning(true);
    setEngineError(null);
    setEngineStatus('Running Stockfish...');
    const gameId = analyzedGame.id;

    try {
      const response = await fetch('/api/analysis/stockfish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game: analyzedGame,
          depth: STOCKFISH_DEPTH,
          maxMoves: STOCKFISH_MOVE_LIMIT,
        }),
      });
      const payload = (await response.json()) as Partial<StockfishResponse> & { error?: string };
      if (!response.ok || !payload.game) throw new Error(payload.error ?? 'Stockfish failed.');

      setAnalyzedGame(payload.game);
      setEngineStatus(
        `${payload.analyzedMoves ?? 0} moves at depth ${payload.depth ?? STOCKFISH_DEPTH}.`
      );
      setSessionGames(prev =>
        prev.map(sg => (sg.id === gameId ? { ...sg, game: payload.game!, hasEngine: true } : sg))
      );
      goTo(currentPlyRef.current, payload.game);
    } catch (error) {
      setEngineError(error instanceof Error ? error.message : 'Engine analysis failed.');
      setEngineStatus(null);
    } finally {
      setIsEngineRunning(false);
    }
  }

  function switchToGame(game: AnalyzedGame) {
    setAnalyzedGame(game);
    setCurrentPlyIndex(-1);
    setLastMoveSquares(null);
    setEngineError(null);
    setEngineStatus(null);
  }

  const totalMoves = analyzedGame?.moves.length ?? 0;
  const canGoBack = analyzedGame !== null && currentPlyIndex >= 0;
  const canGoForward = analyzedGame !== null && currentPlyIndex < totalMoves - 1;
  const boardAlignedClassName = 'mx-auto w-full sm:translate-x-[18px]';

  const isFlipped = settings.flipBoard;
  const topColor = isFlipped ? 'white' : 'black';
  const bottomColor = isFlipped ? 'black' : 'white';
  const topPlayer = playerInfo?.[topColor] ?? { name: topColor === 'white' ? 'White' : 'Black' };
  const bottomPlayer = playerInfo?.[bottomColor] ?? {
    name: bottomColor === 'white' ? 'White' : 'Black',
  };
  const topCaptured = topColor === 'white' ? material.whiteCaptured : material.blackCaptured;
  const bottomCaptured = bottomColor === 'white' ? material.whiteCaptured : material.blackCaptured;
  const topAdvantage =
    topColor === 'white' ? Math.max(0, material.advantage) : Math.max(0, -material.advantage);
  const bottomAdvantage =
    bottomColor === 'white' ? Math.max(0, material.advantage) : Math.max(0, -material.advantage);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="z-10 h-14 shrink-0 bg-(--bg-base)/80 backdrop-blur">
        <div className="flex h-full items-center justify-between gap-4 px-4 lg:px-6">
          <span className="text-sm font-medium text-white">Analysis</span>

          <div className="flex items-center gap-2">
            {analyzedGame && (
              <>
                {engineError ? (
                  <span className="hidden text-[10px] text-red-400 sm:block">{engineError}</span>
                ) : engineStatus ? (
                  <span className="hidden text-[10px] text-gray-500 sm:block">{engineStatus}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void runStockfish()}
                  disabled={isEngineRunning}
                  className="rounded-lg border border-white/10 bg-white/3 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isEngineRunning ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 animate-spin rounded-full border border-amber-400/40 border-t-amber-400" />
                      Analyzing...
                    </span>
                  ) : (
                    'Run Stockfish'
                  )}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setParseError(null);
                setShowImportModal(true);
              }}
              className="rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-semibold text-[#0f1117] transition-colors hover:bg-amber-300"
            >
              Import game
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <div className="flex-1 min-h-0 overflow-hidden px-4 pb-3 pt-2 lg:px-6 lg:pb-4 lg:pt-3">
        <div className="mx-auto flex h-full w-full max-w-410 gap-3 lg:gap-3">
          {/* Left: Board column */}
          <div className="flex h-full min-w-0 flex-1 justify-end">
            <div className="h-full max-w-full shrink" style={{ aspectRatio: '1 / 1' }}>
              <div className="relative flex h-full w-full select-none flex-col">
                {/* Top player (opponent) */}
                <PlayerPanel
                  name={topPlayer.name}
                  rating={topPlayer.rating}
                  color={topColor}
                  captured={topCaptured}
                  advantage={topAdvantage}
                />

                {/* Board + eval bar */}
                <div ref={wrapperRef} className="flex min-h-0 flex-1 items-center justify-center">
                  <EvalBar evalCp={displayEvalCp} reserveSpace={true} size={boardSize} />
                  <div className="relative">
                    <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
                      <Chessboard
                        position={currentFen}
                        boardWidth={boardSize}
                        boardOrientation={settings.flipBoard ? 'black' : 'white'}
                        arePiecesDraggable={false}
                        customSquareStyles={customSquareStyles}
                        showBoardNotation={settings.showCoordinates}
                        customDarkSquareStyle={{ backgroundColor: theme.dark }}
                        customLightSquareStyle={{ backgroundColor: theme.light }}
                        animationDuration={animationDuration}
                        customPieces={customPieces}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom player (self) */}
                <PlayerPanel
                  name={bottomPlayer.name}
                  rating={bottomPlayer.rating}
                  color={bottomColor}
                  captured={bottomCaptured}
                  advantage={bottomAdvantage}
                />

                {/* Controls */}
                <div
                  className={`${boardAlignedClassName} grid shrink-0 grid-cols-3 items-center`}
                  style={{ maxWidth: boardSize }}
                >
                  {/* Left: flip button */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setSettings({ flipBoard: !settings.flipBoard })}
                      title="Flip board"
                      className="flex h-9 w-9 items-center justify-center text-gray-500 transition-colors hover:text-gray-300"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                        <path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                        <path d="M8 21H3v-5" />
                      </svg>
                    </button>
                  </div>

                  {/* Center: nav buttons */}
                  <div className="flex justify-center">
                    <div className="flex items-center divide-x divide-white/10 overflow-hidden rounded-lg border border-white/10">
                      <NavBtn onClick={() => goTo(-1)} disabled={!canGoBack} title="First position">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                          <path d="M3.5 3a.5.5 0 0 1 .5.5v3.793l6.146-4.439A.5.5 0 0 1 11 3.5v9a.5.5 0 0 1-.854.354L4 8.707V12.5a.5.5 0 0 1-1 0v-9a.5.5 0 0 1 .5-.5z" />
                        </svg>
                      </NavBtn>
                      <NavBtn
                        onClick={() => goTo(currentPlyIndex - 1)}
                        disabled={!canGoBack}
                        title="Previous (←)"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                          <path d="M11.354 3.646a.5.5 0 0 1 0 .708L6.707 9l4.647 4.646a.5.5 0 0 1-.708.708l-5-5a.5.5 0 0 1 0-.708l5-5a.5.5 0 0 1 .708 0z" />
                        </svg>
                      </NavBtn>
                      <NavBtn
                        onClick={() => goTo(currentPlyIndex + 1)}
                        disabled={!canGoForward}
                        title="Next (→)"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                          <path d="M4.646 3.646a.5.5 0 0 1 .708 0l5 5a.5.5 0 0 1 0 .708l-5 5a.5.5 0 0 1-.708-.708L9.293 9 4.646 4.354a.5.5 0 0 1 0-.708z" />
                        </svg>
                      </NavBtn>
                      <NavBtn
                        onClick={() => goTo(totalMoves - 1)}
                        disabled={!canGoForward}
                        title="Last position"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                          <path d="M12.5 3a.5.5 0 0 0-.5.5v3.793L5.854 2.854A.5.5 0 0 0 5 3.5v9a.5.5 0 0 0 .854.354L12 8.207V12.5a.5.5 0 0 0 1 0v-9a.5.5 0 0 0-.5-.5z" />
                        </svg>
                      </NavBtn>
                    </div>
                  </div>

                  {/* Right: settings gear */}
                  <div className="flex justify-end">
                    <BoardSettingsPopover />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Sidebar */}
          <div className="w-[24rem] lg:w-108 shrink-0 h-full flex flex-col gap-3">
            {/* Coach */}
            <CoachBubble
              feedback={coachFeedback}
              fallbackText={
                analyzedGame
                  ? 'Navigate to any move to see the coach analysis.'
                  : 'Import a game to start your analysis session.'
              }
            />

            <CoachAnalysisPanel feedback={coachFeedback} move={currentMove} />

            {/* Move list + bottom panel */}
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {/* Move list */}
              <div className="min-h-0" style={{ flex: 60 }}>
                {analyzedGame ? (
                  <AnalysisMoveList
                    game={analyzedGame}
                    currentPlyIndex={currentPlyIndex}
                    onNavigate={goTo}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-white/5 bg-(--bg-panel) px-6 py-8">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5 text-gray-600"
                      >
                        <path d="M9 12h6m-3-3v6m-7 4h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-400">No game loaded</p>
                      <p className="mt-1 text-xs leading-5 text-gray-600">
                        Import a PGN to review moves and get coach feedback on each position.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setParseError(null);
                        setShowImportModal(true);
                      }}
                      className="mt-1 rounded-lg border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-400/15"
                    >
                      Import a game
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom panel: Engine / Games */}
              <div
                className="flex min-h-0 flex-col rounded-xl border border-white/5 bg-(--bg-panel)"
                style={{ flex: 40 }}
              >
                {/* Tabs */}
                <div className="flex shrink-0 border-b border-white/5">
                  {(['engine', 'recap', 'games'] as const).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveBottomPanel(tab)}
                      className={`relative flex-1 py-2.5 text-xs font-medium capitalize transition-colors ${
                        activeBottomPanel === tab
                          ? 'text-white'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {tab === 'engine'
                        ? 'Engine'
                        : tab === 'recap'
                          ? 'Recap'
                          : `Games${sessionGames.length > 0 ? ` (${sessionGames.length})` : ''}`}
                      {activeBottomPanel === tab && (
                        <span className="absolute inset-x-0 bottom-0 h-px bg-amber-400" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                {activeBottomPanel === 'engine' ? (
                  <EngineLines move={currentMove} />
                ) : activeBottomPanel === 'recap' ? (
                  <GameRecapPanel
                    summaries={summaryFeedbacks}
                    hasEngineAnalysis={hasEngineAnalysis}
                  />
                ) : (
                  <SessionGamesList
                    games={sessionGames}
                    currentGameId={analyzedGame?.id}
                    onSelect={switchToGame}
                  />
                )}
              </div>
            </div>
          </div>
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
    </div>
  );
}
