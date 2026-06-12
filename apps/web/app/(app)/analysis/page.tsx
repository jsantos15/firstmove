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

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const INITIAL_EVAL_CP = 20;
const STOCKFISH_DEPTH = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

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
  const [engineSettingsOpen, setEngineSettingsOpen] = useState(false);
  const engineSettingsRef = useRef<HTMLDivElement>(null);
  const [exploreHistory, setExploreHistory] = useState<ExploreEntry[]>([]);
  const [exploreHistoryIndex, setExploreHistoryIndex] = useState(-1);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [baseFen, setBaseFen] = useState<string | null>(null);
  const [positionMode, setPositionMode] = useState<'fen' | 'pgn'>('fen');
  const [positionText, setPositionText] = useState(INITIAL_FEN);
  const [positionError, setPositionError] = useState<string | null>(null);
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
    setExploreHistory([]);
    setExploreHistoryIndex(-1);
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

  // Derived from exploreHistory — placed here because they depend on currentFen.
  const freeExploreFen = exploreHistoryIndex >= 0 ? (exploreHistory[exploreHistoryIndex]?.fen ?? null) : null;
  const lastExploreMove = exploreHistoryIndex >= 0 ? {
    san: exploreHistory[exploreHistoryIndex]!.san,
    prevFen: exploreHistoryIndex > 0 ? exploreHistory[exploreHistoryIndex - 1]!.fen : currentFen,
  } : null;

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

  // Navigation helpers — Explore tab navigates free-play history; other tabs navigate the analyzed game.
  const navCanGoBack = activeTab === 'explore' && exploreHistory.length > 0
    ? exploreHistoryIndex >= 0
    : canGoBack;
  const navCanGoForward = activeTab === 'explore' && exploreHistory.length > 0
    ? exploreHistoryIndex < exploreHistory.length - 1
    : canGoForward;

  function navGoFirst() {
    if (activeTab === 'explore' && exploreHistory.length > 0) {
      // Reset to the base position without erasing the history so forward nav still works.
      setExploreHistoryIndex(-1);
      setLastMoveSquares(null);
    } else if (analyzedGame !== null) {
      goTo(-1);
    }
  }

  function navGoBack() {
    if (activeTab === 'explore' && exploreHistory.length > 0) {
      const newIdx = exploreHistoryIndex - 1;
      setExploreHistoryIndex(newIdx);
      if (newIdx >= 0) {
        const entry = exploreHistory[newIdx];
        if (entry) setLastMoveSquares({ from: entry.from, to: entry.to });
      } else {
        setLastMoveSquares(null);
      }
    } else {
      goTo(currentPlyIndex - 1);
    }
  }

  function navGoForward() {
    if (activeTab === 'explore' && exploreHistory.length > 0) {
      const newIdx = exploreHistoryIndex + 1;
      if (newIdx < exploreHistory.length) {
        setExploreHistoryIndex(newIdx);
        const entry = exploreHistory[newIdx];
        if (entry) setLastMoveSquares({ from: entry.from, to: entry.to });
      }
    } else {
      goTo(currentPlyIndex + 1);
    }
  }

  function navGoLast() {
    if (activeTab === 'explore' && exploreHistory.length > 0) {
      const lastIdx = exploreHistory.length - 1;
      setExploreHistoryIndex(lastIdx);
      const entry = exploreHistory[lastIdx];
      if (entry) setLastMoveSquares({ from: entry.from, to: entry.to });
    } else {
      goTo(totalMoves - 1);
    }
  }

  // Keep positionText in sync with the board. Board changes always win over user-typed text —
  // the user's draft is only "committed" via the Load button.
  useEffect(() => {
    if (positionMode === 'fen') {
      setPositionText(freeExploreFen ?? currentFen);
      setPositionError(null);
      return;
    }
    // PGN mode — reconstruct a PGN from current state (moves only, no auto-generated headers)
    try {
      if (exploreHistory.length > 0) {
        const chess = new Chess(currentFen);
        for (const entry of exploreHistory) chess.move(entry.san);
        const movesOnly = chess.pgn().replace(/^\[.*?\]\r?\n?/gm, '').trim();
        setPositionText(
          currentFen !== INITIAL_FEN
            ? `[FEN "${currentFen}"]\n\n${movesOnly}`
            : movesOnly
        );
      } else if (analyzedGame && analyzedGame.moves.length > 0) {
        const initFen = analyzedGame.initialFen;
        const chess = initFen ? new Chess(initFen) : new Chess();
        for (const move of analyzedGame.moves) chess.move(move.san);
        const movesOnly = chess.pgn().replace(/^\[.*?\]\r?\n?/gm, '').trim();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeExploreFen, currentFen, positionMode, exploreHistory, analyzedGame]);

  function handlePositionLoad() {
    const text = positionText.trim();
    if (!text) return;

    if (positionMode === 'fen') {
      try {
        new Chess(text);
        setBaseFen(text);
        setAnalyzedGame(null);
        setCurrentPlyIndex(-1);
        setExploreHistory([]);
        setExploreHistoryIndex(-1);
        setLastMoveSquares(null);
        setCoachByPly(new Map());
        setPositionError(null);
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
        setExploreHistory([]);
        setExploreHistoryIndex(-1);
        setCoachByPly(new Map());
        setPositionError(null);
      } catch {
        setPositionError('Invalid PGN');
      }
    }
  }

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

  const { lines, bestMoveUci, evalCp: liveEvalCp, depth, isAnalyzing, isDone } = usePositionAnalysis(
    boardFen,
    extendKey,
    settings.engineLines,
    settings.engineMoveTime * 1000,
    settings.engineEnabled,
  );

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

  const tryMove = (from: string, to: string): boolean => {
    try {
      const prevFen = boardFen;
      const chess = new Chess(prevFen);
      const move = chess.move({ from, to, promotion: 'q' });
      if (!move) return false;
      const newFen = chess.fen();
      setExploreHistory(prev => [...prev.slice(0, exploreHistoryIndex + 1), { san: move.san, fen: newFen, from: move.from, to: move.to }]);
      setExploreHistoryIndex(prev => prev + 1);
      setLastMoveSquares({ from: move.from, to: move.to });
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
      const newFen = chess.fen();
      setExploreHistory(prev => [...prev.slice(0, exploreHistoryIndex + 1), { san: move.san, fen: newFen, from: move.from, to: move.to }]);
      setExploreHistoryIndex(prev => prev + 1);
      setLastMoveSquares({ from: move.from, to: move.to });
      return true;
    } catch {
      return false;
    }
  };

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
            topBar={<div className="h-full" />}
            bottomBar={
              <div className="flex items-center justify-end py-2.5">
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
              <div className="flex items-stretch gap-2 px-3 py-2.5">
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
                        settings.engineEnabled ? 'bg-violet-600' : 'bg-white/15'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
                          settings.engineEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    {/* Engine label + version inline */}
                    <span className="shrink-0 text-xs font-medium text-white">Engine</span>
                    <span className="shrink-0 text-[10px] text-gray-500">{ENGINE_DISPLAY_NAME}</span>

                    {/* Push depth section to right */}
                    <div className="flex-1 min-w-0" />

                    {/* Extend button + Depth label + analyzing dot */}
                    {settings.engineEnabled && depth !== null && (
                      <div className="flex shrink-0 items-center gap-1 mr-2">
                        <button
                          type="button"
                          onClick={() => setExtendKey(k => k + 1)}
                          disabled={!isDone}
                          title="Think 20 seconds deeper"
                          className="flex h-5 w-5 items-center justify-center rounded text-sm font-bold text-gray-500 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                        >
                          +
                        </button>
                        <span className="text-[11px] text-gray-400">
                          Depth{' '}
                          <span className={isAnalyzing ? 'text-emerald-400' : 'text-gray-200'}>{depth}</span>
                        </span>
                        {isAnalyzing && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        )}
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
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Engine lines */}
                {settings.engineEnabled && !settings.hideEngineInfo && (
                  <div className="shrink-0 px-3 pb-2 flex flex-col gap-1">
                    {lines.slice(0, settings.engineLines).map((engineLine, li) => {
                      const pvFormatted = formatPvLine(boardFen, engineLine.pvUci);
                      const evalStr = formatEval(engineLine.evalCp);
                      const positive = (engineLine.evalCp ?? 0) >= 0;
                      return (
                        <div key={li} className="flex items-center gap-2 rounded-lg bg-white/4 px-2.5 py-1.5 min-w-0">
                          <span className={`shrink-0 text-xs font-bold tabular-nums w-10 ${positive ? 'text-gray-100' : 'text-red-400'}`}>
                            {evalStr}
                          </span>
                          <span className="flex-1 truncate font-mono text-xs text-gray-300">
                            {pvFormatted}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Explore moves — fills all remaining space */}
                <div className="flex-1 min-h-0 overflow-y-auto border-t border-white/5">
                  {exploreHistory.length === 0 ? (
                    <p className="px-3 pt-4 text-center text-xs text-gray-600">
                      Move pieces on the board to explore.
                    </p>
                  ) : (
                    <div className="px-2 py-2">
                      {buildExplorePairs(exploreHistory, currentFen).map(pair => {
                        const goToExplore = (idx: number) => {
                          setExploreHistoryIndex(idx);
                          const entry = exploreHistory[idx];
                          if (entry) setLastMoveSquares({ from: entry.from, to: entry.to });
                        };
                        return (
                          <div key={pair.moveNumber} className="flex items-center gap-1">
                            <span className="w-7 shrink-0 text-right font-mono text-xs text-gray-600">{pair.moveNumber}.</span>
                            <div className="flex flex-1 gap-1">
                              {pair.white ? (
                                <button
                                  type="button"
                                  onClick={() => goToExplore(pair.white!.idx)}
                                  className={`flex min-w-0 flex-1 items-center rounded px-2 py-0.5 font-mono text-sm transition-colors ${
                                    exploreHistoryIndex === pair.white.idx
                                      ? 'bg-amber-400/15 text-amber-300'
                                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                  }`}
                                >
                                  {pair.white.san}
                                </button>
                              ) : (
                                <span className="flex-1" />
                              )}
                              {pair.black ? (
                                <button
                                  type="button"
                                  onClick={() => goToExplore(pair.black!.idx)}
                                  className={`flex min-w-0 flex-1 items-center rounded px-2 py-0.5 font-mono text-sm transition-colors ${
                                    exploreHistoryIndex === pair.black.idx
                                      ? 'bg-amber-400/15 text-amber-300'
                                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                  }`}
                                >
                                  {pair.black.san}
                                </button>
                              ) : (
                                <span className="flex-1" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Position — FEN / PGN input strip */}
                <div className="shrink-0 border-t border-white/5">
                  <div className="flex items-end gap-2 px-3 pt-2 pb-0">
                    <button
                      type="button"
                      onClick={() => { setParseError(null); setShowImportModal(true); }}
                      className="flex items-center gap-2 rounded border border-amber-400/45 bg-amber-400/8 px-5 py-2 mb-1.5 text-sm font-medium text-amber-300 transition-colors hover:border-amber-400/65 hover:bg-amber-400/15 hover:text-amber-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                        <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v.64c.57.265.94.876.856 1.546l-.64 5.124A2.5 2.5 0 0 1 12.733 15H3.266a2.5 2.5 0 0 1-2.481-2.19l-.64-5.124A1.5 1.5 0 0 1 1 6.14V3.5ZM2 6h12v-.5a.5.5 0 0 0-.5-.5H9c-.964 0-1.71-.629-2.174-1.154C6.374 3.334 5.82 3 5.264 3H2.5a.5.5 0 0 0-.5.5V6Zm-.367 1a.5.5 0 0 0-.496.562l.64 5.124A1.5 1.5 0 0 0 3.266 14h9.468a1.5 1.5 0 0 0 1.489-1.314l.64-5.124A.5.5 0 0 0 14.367 7H1.633Z"/>
                      </svg>
                      Import Game
                    </button>
                    {positionError && (
                      <span className="text-[10px] text-red-400 leading-none">{positionError}</span>
                    )}
                    <div className="flex-1" />
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
                  <div className="px-3 pb-2.5">
                    <div className="relative">
                      <textarea
                        value={positionText}
                        onChange={e => { setPositionText(e.target.value); setPositionError(null); }}
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
                        className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-[#14161f] text-gray-500 transition-colors hover:border-white/20 hover:text-gray-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                          <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.042-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
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
                            settings.hideEngineInfo ? 'border-violet-600 bg-violet-600' : 'border-white/20 bg-transparent'
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
                            settings.hideArrows ? 'border-violet-600 bg-violet-600' : 'border-white/20 bg-transparent'
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
                            <AnalysisMoveList
                              game={analyzedGame}
                              currentPlyIndex={currentPlyIndex}
                              onNavigate={goTo}
                            />
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
                        value={positionText}
                        onChange={e => { setPositionText(e.target.value); setPositionError(null); }}
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
                        className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-[#14161f] text-gray-500 transition-colors hover:border-white/20 hover:text-gray-200"
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
    </div>
  );
}
