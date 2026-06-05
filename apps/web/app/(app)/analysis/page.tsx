'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from '@firstmove/core';
import { CoachBubble } from '@/components/practice/CoachBubble';
import { BoardPanel } from '@/components/board/BoardPanel';
import { SidePanel } from '@/components/board/SidePanel';
import { useBoardSettings } from '@/hooks/useBoardSettings';
import { usePositionAnalysis } from '@/hooks/usePositionAnalysis';
import { useCoachSettings } from '@/hooks/useCoachSettings';
import { getCustomPieces } from '@/lib/piecesets';
import { BoardSettingsPopover } from '@/components/board/BoardSettingsPopover';
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

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const INITIAL_EVAL_CP = 20;
const STOCKFISH_DEPTH = 10;

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

type PanelTab = 'explore' | 'review';
type ReviewSubTab = 'summary' | 'moves';

// ─── Helpers ──────────────────────────────────────────────────────────────────


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

function extractGameTitle(pgn: string): string | null {
  const white = pgn.match(/\[White "([^"]+)"\]/)?.[1];
  const black = pgn.match(/\[Black "([^"]+)"\]/)?.[1];
  if (white && black) return `${white} vs ${black}`;
  if (white) return white;
  return null;
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
      className={`flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-1 font-mono text-sm transition-colors ${
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
  const hasEngine = game.moves.some(m => m.hasEngineAnalysis);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPlyIndex]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
  const [engineError, setEngineError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>('explore');
  const [reviewSubTab, setReviewSubTab] = useState<ReviewSubTab>('summary');
  const [coachByPly, setCoachByPly] = useState<Map<number, CoachFeedback | null>>(new Map());
  const [lastExploreMove, setLastExploreMove] = useState<{ san: string; prevFen: string } | null>(null);
  const [boardSize, setBoardSize] = useState(480);
  const [freeExploreFen, setFreeExploreFen] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const { theme, animationDuration, settings, setSettings } = useBoardSettings();
  const { settings: coachSettings } = useCoachSettings();
  const customPieces = useMemo(() => getCustomPieces(settings.pieceSetId), [settings.pieceSetId]);

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
    setFreeExploreFen(null);
    setLastExploreMove(null);
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
      setCurrentPlyIndex(-1);
      setLastMoveSquares(null);
      setParseError(null);
      setEngineError(null);
      setCoachByPly(new Map());
      setShowImportModal(false);
      setActiveTab('review');
      setReviewSubTab('summary');
      const label = extractGameTitle(pgn) ?? `Game ${sessionGames.length + 1}`;
      setSessionGames(prev => [{ id: game.id, label, game, hasEngine: false }, ...prev]);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not parse that PGN/FEN.');
    }
  }

  async function runStockfish() {
    if (!analyzedGame || isEngineRunning) return;
    setIsEngineRunning(true);
    setEngineError(null);
    const gameId = analyzedGame.id;

    try {
      const response = await fetch('/api/analysis/stockfish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game: analyzedGame,
          depth: STOCKFISH_DEPTH,
          maxMoves: analyzedGame.moves.length,
        }),
      });
      const payload = (await response.json()) as Partial<StockfishResponse> & { error?: string };
      if (!response.ok || !payload.game) throw new Error(payload.error ?? 'Stockfish failed.');

      setAnalyzedGame(payload.game);
      setSessionGames(prev =>
        prev.map(sg => (sg.id === gameId ? { ...sg, game: payload.game!, hasEngine: true } : sg))
      );
      // Pre-compute coach texts for every ply — pure JS, instant.
      const byPly = new Map<number, CoachFeedback | null>();
      for (const move of payload.game.moves) {
        try {
          const feedbacks = buildGameAnalysisCoachFeedbackFromAnalyzedGameMove({
            game: payload.game,
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
      goTo(currentPlyRef.current, payload.game);
    } catch (error) {
      setEngineError(error instanceof Error ? error.message : 'Engine analysis failed.');
    } finally {
      setIsEngineRunning(false);
    }
  }

  function switchToGame(game: AnalyzedGame) {
    setAnalyzedGame(game);
    setCurrentPlyIndex(-1);
    setLastMoveSquares(null);
    setEngineError(null);
    setCoachByPly(new Map());
  }

  const totalMoves = analyzedGame?.moves.length ?? 0;
  const canGoBack = analyzedGame !== null && currentPlyIndex >= 0;
  const canGoForward = analyzedGame !== null && currentPlyIndex < totalMoves - 1;
  // boardFen is the FEN actually shown and analyzed — follows game navigation unless the
  // user has played a move freely, in which case freeExploreFen takes over.
  const boardFen = freeExploreFen ?? currentFen;
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

  const { bestMoveUci, depth, isAnalyzing, isDone } = usePositionAnalysis(boardFen, extendKey);

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
      bestMoveUci && bestMoveUci.length >= 4
        ? [[bestMoveUci.slice(0, 2), bestMoveUci.slice(2, 4), 'rgba(15, 120, 15, 0.5)']]
        : [],
    [bestMoveUci]
  );

  const tryMove = (from: string, to: string): boolean => {
    try {
      const prevFen = boardFen;
      const chess = new Chess(prevFen);
      const move = chess.move({ from, to, promotion: 'q' });
      if (!move) return false;
      setFreeExploreFen(chess.fen());
      setLastMoveSquares({ from: move.from, to: move.to });
      setLastExploreMove({ san: move.san, prevFen });
      setSelectedSquare(null);
      return true;
    } catch {
      return false;
    }
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
    const promotion = (piece?.slice(1)?.toLowerCase() ?? 'q') as 'q' | 'r' | 'b' | 'n';
    try {
      const chess = new Chess(boardFen);
      const move = chess.move({ from, to, promotion });
      if (!move) return false;
      setFreeExploreFen(chess.fen());
      setLastMoveSquares({ from: move.from, to: move.to });
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden p-3 flex justify-center">
        <div className="flex h-full gap-3">

          <BoardPanel
            evalCp={displayEvalCp}
            displayPerspective={settings.flipBoard ? 'black' : 'white'}
            reserveEvalSpace={true}
            boardSize={boardSize}
            onBoardSizeChange={setBoardSize}
            topBar={
              <div className="flex h-full items-center justify-end gap-2 pr-3">
                {depth !== null && (
                  <>
                    <button
                      type="button"
                      onClick={() => setExtendKey(k => k + 1)}
                      disabled={!isDone}
                      title="Think 20 seconds deeper"
                      className="flex h-6 w-6 items-center justify-center rounded text-sm font-bold text-gray-500 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      +
                    </button>
                    <span className="text-[11px] text-gray-400">
                      Depth <span className={isAnalyzing ? 'text-emerald-400' : 'text-gray-200'}>{depth}</span>
                    </span>
                    {isAnalyzing && (
                      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
                    )}
                  </>
                )}
              </div>
            }
            bottomBar={
              <div className="flex items-center justify-between px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setSettings({ flipBoard: !settings.flipBoard })}
                  title="Flip board"
                  className="flex h-9 w-9 items-center justify-center rounded text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                    <path d="M8 21H3v-5" />
                  </svg>
                </button>
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
              <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-gray-600">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-400">Free exploration</p>
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    Move pieces on the board. The engine analyzes every position and the coach gives feedback once the analysis is deep enough.
                  </p>
                </div>
              </div>
            )}

            {/* ── GAME REVIEW TAB ──────────────────────────────────────────── */}
            {activeTab === 'review' && (
              <div className="flex flex-1 min-h-0 flex-col">

                {/* ── No game loaded ── */}
                {!analyzedGame && (
                  <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 px-6 py-8 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-gray-600">
                        <path d="M9 12h6m-3-3v6m-7 4h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-400">No game loaded</p>
                      <p className="mt-1 text-xs leading-5 text-gray-600">
                        Import a PGN to review moves, run the engine, and get coach feedback on every position.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setParseError(null); setShowImportModal(true); }}
                      className="rounded-lg bg-amber-400 px-5 py-2 text-xs font-semibold text-[#0f1117] transition-colors hover:bg-amber-300"
                    >
                      Import game
                    </button>
                  </div>
                )}

                {/* ── Game loaded ── */}
                {analyzedGame && (
                  <>
                    {/* Stockfish loading overlay */}
                    {isEngineRunning && (
                      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 px-6 py-8">
                        <div className="flex h-10 w-10 items-center justify-center">
                          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-gray-300">Analyzing with Stockfish</p>
                          <p className="mt-1 text-xs text-gray-600">Running through all moves…</p>
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
                            <AnalysisMoveList
                              game={analyzedGame}
                              currentPlyIndex={currentPlyIndex}
                              onNavigate={goTo}
                            />
                          )}
                        </div>

                        {/* Navigation bar */}
                        <div className="shrink-0 border-t border-white/5 flex items-center justify-center py-1.5">
                          <div className="flex items-center divide-x divide-white/10 overflow-hidden rounded-lg border border-white/10">
                            <NavBtn onClick={() => goTo(-1)} disabled={!canGoBack} title="First position">
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M3.5 3a.5.5 0 0 1 .5.5v3.793l6.146-4.439A.5.5 0 0 1 11 3.5v9a.5.5 0 0 1-.854.354L4 8.707V12.5a.5.5 0 0 1-1 0v-9a.5.5 0 0 1 .5-.5z" /></svg>
                            </NavBtn>
                            <NavBtn onClick={() => goTo(currentPlyIndex - 1)} disabled={!canGoBack} title="Previous (←)">
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M11.354 3.646a.5.5 0 0 1 0 .708L6.707 9l4.647 4.646a.5.5 0 0 1-.708.708l-5-5a.5.5 0 0 1 0-.708l5-5a.5.5 0 0 1 .708 0z" /></svg>
                            </NavBtn>
                            <NavBtn onClick={() => goTo(currentPlyIndex + 1)} disabled={!canGoForward} title="Next (→)">
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M4.646 3.646a.5.5 0 0 1 .708 0l5 5a.5.5 0 0 1 0 .708l-5 5a.5.5 0 0 1-.708-.708L9.293 9 4.646 4.354a.5.5 0 0 1 0-.708z" /></svg>
                            </NavBtn>
                            <NavBtn onClick={() => goTo(totalMoves - 1)} disabled={!canGoForward} title="Last position">
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M12.5 3a.5.5 0 0 0-.5.5v3.793L5.854 2.854A.5.5 0 0 0 5 3.5v9a.5.5 0 0 0 .854.354L12 8.207V12.5a.5.5 0 0 0 1 0v-9a.5.5 0 0 0-.5-.5z" /></svg>
                            </NavBtn>
                          </div>
                        </div>

                      </div>
                    )}
                  </>
                )}

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
    </div>
  );
}
