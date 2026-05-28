'use client';

import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, type CoachPersona, type Opening, type OpeningVariation } from '@firstmove/core';
import { useRecordCompletion, useRecordLearned } from '@/hooks/useProgress';
import { useAuth } from '@/app/providers';
import { CompletionOverlay } from './CompletionOverlay';
import { useBoardSettings } from '@/hooks/useBoardSettings';
import { getCustomPieces } from '@/lib/piecesets';
import {
  buildMoveCoachFeedback,
  buildWrongMoveCoachFeedback,
  type CoachFeedback,
} from '@/lib/coachFeedback';
import { useOpeningPositionEval } from '@/hooks/useOpeningPositionEval';

export type PracticeMode = 'learn' | 'practice';

export interface PracticeBoardHandle {
  navigateFirst: () => void;
  navigateBack: () => void;
  navigateForward: () => void;
  navigateLast: () => void;
  reset: () => void;
}

interface PracticeBoardProps {
  opening: Opening;
  variation: OpeningVariation & {
    engineChecked?: boolean;
    evalCpByPly?: number[];
    finalEvalCp?: number;
    finalEvalPerspective?: 'white' | 'black';
    primaryCategory?: string;
  };
  mode: PracticeMode;
  coachPersona?: CoachPersona;
  onMoveIndexChange?: (index: number) => void;
  onCoachFeedbackChange?: (feedback: CoachFeedback | null) => void;
  onNavStateChange?: (state: { canGoBack: boolean; canGoForward: boolean; isLive: boolean }) => void;
  onBoardSizeChange?: (size: number) => void;
  controlsRight?: React.ReactNode;
  hideControls?: boolean;
}

type PracticeStatus = 'loading' | 'playing' | 'wrong' | 'complete';
type PromotionPiece = 'q' | 'r' | 'b' | 'n';

interface QueuedPremove {
  from: string;
  to: string;
}

const WRONG_MOVE_RESET_MS = 900;
const EVAL_BAR_CP_LIMIT = 600;
const INITIAL_POSITION_EVAL_CP = 20;

function isUserTurn(moveIndex: number, openingColor: 'white' | 'black') {
  return openingColor === 'white' ? moveIndex % 2 === 0 : moveIndex % 2 === 1;
}

function isPromotionCandidate(chess: Chess, from: string, to: string) {
  const piece = chess.get(from as Parameters<Chess['get']>[0]);
  if (!piece || piece.type !== 'p') return false;
  const targetRank = to[1];
  return (piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1');
}

function isCaptureStyleMove(flags?: string) {
  return Boolean(flags?.includes('c') || flags?.includes('e'));
}

function normalizePromotionPiece(piece?: string): PromotionPiece {
  const normalized = piece?.toLowerCase();
  if (normalized === 'q' || normalized === 'r' || normalized === 'b' || normalized === 'n')
    return normalized;
  return 'q';
}

function getBoardOrientation(openingColor: 'white' | 'black', flipBoard: boolean) {
  const baseOrientation = openingColor;
  if (!flipBoard) return baseOrientation;
  return baseOrientation === 'white' ? 'black' : 'white';
}

function formatEvalLabel(evalCp: number) {
  if (Math.abs(evalCp) >= 9000) return '#';
  if (Math.abs(evalCp) < 10) return '0.0';
  const pawns = Math.abs(evalCp) / 100;
  return `${evalCp > 0 ? '+' : '-'}${pawns.toFixed(1)}`;
}

function toWhiteEvalCp(
  finalEvalCp: number | undefined,
  perspective: 'white' | 'black' | undefined,
  fallbackPerspective: 'white' | 'black'
) {
  if (typeof finalEvalCp !== 'number' || !Number.isFinite(finalEvalCp)) return null;
  const evalPerspective = perspective ?? fallbackPerspective;
  return evalPerspective === 'white' ? finalEvalCp : -finalEvalCp;
}

function EvalBar({
  evalCp,
  displayEvalCp,
  displayPerspective,
  reserveSpace = false,
  size,
}: {
  evalCp?: number;
  displayEvalCp?: number;
  displayPerspective: 'white' | 'black';
  reserveSpace?: boolean;
  size?: number;
}) {
  const bottomColor = displayPerspective;
  const bottomClassName = bottomColor === 'white' ? 'bg-zinc-100' : 'bg-[#181818]';
  const topClassName = bottomColor === 'white' ? 'bg-[#181818]' : 'bg-zinc-100';
  const heightStyle = size != null ? { height: size } : undefined;
  const heightClass = size != null ? '' : 'h-full';

  if (typeof evalCp !== 'number' || !Number.isFinite(evalCp)) {
    return reserveSpace ? (
      <div
        className={`relative mr-2 hidden ${heightClass} w-8 shrink-0 overflow-hidden rounded-md border border-white/15 ${topClassName} shadow-inner shadow-black/40 sm:block`}
        style={heightStyle}
        title="Engine evaluation loading"
        aria-label="Engine evaluation loading"
      >
        <div className={`absolute inset-x-0 bottom-0 h-1/2 opacity-70 ${bottomClassName}`} />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-amber-400/45" />
      </div>
    ) : null;
  }

  const clamped = Math.max(-EVAL_BAR_CP_LIMIT, Math.min(EVAL_BAR_CP_LIMIT, evalCp));
  const whiteHeight = 50 + (clamped / EVAL_BAR_CP_LIMIT) * 45;
  const bottomHeight = bottomColor === 'white' ? whiteHeight : 100 - whiteHeight;
  const labelValue =
    typeof displayEvalCp === 'number' && Number.isFinite(displayEvalCp) ? displayEvalCp : evalCp;
  const label = formatEvalLabel(labelValue);
  const labelOnBottom = labelValue >= 0;
  const perspectiveLabel = displayPerspective === 'white' ? 'White' : 'Black';

  return (
    <div
      className={`relative mr-2 hidden ${heightClass} w-8 shrink-0 overflow-hidden rounded-md border border-white/15 ${topClassName} shadow-inner shadow-black/40 sm:block`}
      style={heightStyle}
      title={`Engine evaluation for ${perspectiveLabel}: ${label}`}
      aria-label={`Engine evaluation for ${perspectiveLabel} ${label}`}
    >
      <div
        className={`absolute inset-x-0 bottom-0 transition-[height] duration-300 ${bottomClassName}`}
        style={{ height: `${bottomHeight}%` }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-amber-400/45" />
      <div
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 text-[10px] font-semibold tabular-nums ${
          labelOnBottom
            ? bottomColor === 'white'
              ? 'bottom-1 text-zinc-950'
              : 'bottom-1 text-zinc-100'
            : bottomColor === 'white'
              ? 'top-1 text-zinc-100'
              : 'top-1 text-zinc-950'
        }`}
      >
        {label}
      </div>
    </div>
  );
}

let moveSoundCtx: AudioContext | null = null;
let moveSoundBuffer: AudioBuffer | null = null;
let moveSoundGain: GainNode | null = null;
let moveSoundWakeSource: OscillatorNode | null = null;
let moveSoundWakeGain: GainNode | null = null;
let moveSoundWakeTimer: ReturnType<typeof setTimeout> | null = null;

function getMoveSoundCtx() {
  if (!moveSoundCtx || moveSoundCtx.state === 'closed') {
    moveSoundCtx = new AudioContext({ latencyHint: 'interactive' });
    moveSoundBuffer = null;
    moveSoundGain = moveSoundCtx.createGain();
    moveSoundGain.gain.value = 0.5;
    moveSoundGain.connect(moveSoundCtx.destination);
  }

  return moveSoundCtx;
}

function getMoveSoundBuffer(ctx: AudioContext) {
  if (moveSoundBuffer && moveSoundBuffer.sampleRate === ctx.sampleRate) {
    return moveSoundBuffer;
  }

  const sampleCount = Math.floor(ctx.sampleRate * 0.055);
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2f6e2b1;

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / ctx.sampleRate;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = (seed / 0xffffffff) * 2 - 1;
    const envelope = Math.exp(-i / (sampleCount * 0.12));
    const wood = Math.sin(2 * Math.PI * 240 * t) * 0.12;
    data[i] = (noise * 0.82 + wood) * envelope;
  }

  moveSoundBuffer = buffer;
  return buffer;
}

function startMoveSound(ctx: AudioContext) {
  const destination = moveSoundGain;
  if (!destination) return;

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  source.buffer = getMoveSoundBuffer(ctx);
  filter.type = 'lowpass';
  filter.frequency.value = 720;
  source.connect(filter);
  filter.connect(destination);
  source.start(ctx.currentTime + 0.001);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
  };
}

function unlockMoveSound(enabled: boolean) {
  if (!enabled) return;

  try {
    const ctx = getMoveSoundCtx();
    getMoveSoundBuffer(ctx);
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  } catch {}
}

function stopMoveSoundWake() {
  if (moveSoundWakeTimer) {
    clearTimeout(moveSoundWakeTimer);
    moveSoundWakeTimer = null;
  }

  if (!moveSoundWakeSource) return;

  try {
    moveSoundWakeSource.stop();
    moveSoundWakeSource.disconnect();
    moveSoundWakeGain?.disconnect();
  } catch {}

  moveSoundWakeSource = null;
  moveSoundWakeGain = null;
}

function keepMoveSoundAwake(enabled: boolean) {
  if (!enabled) return;

  try {
    const ctx = getMoveSoundCtx();
    getMoveSoundBuffer(ctx);
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    if (!moveSoundWakeSource) {
      const source = ctx.createOscillator();
      const gain = ctx.createGain();
      source.frequency.value = 20;
      gain.gain.value = 0.00001;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      moveSoundWakeSource = source;
      moveSoundWakeGain = gain;
    }

    if (moveSoundWakeTimer) clearTimeout(moveSoundWakeTimer);
    moveSoundWakeTimer = setTimeout(stopMoveSoundWake, 8000);
  } catch {}
}

function playMoveSound(enabled: boolean) {
  if (!enabled) return;

  try {
    const ctx = getMoveSoundCtx();
    getMoveSoundBuffer(ctx);

    if (ctx.state === 'running') {
      startMoveSound(ctx);
      return;
    }

    void ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') startMoveSound(ctx);
      })
      .catch(() => {});
  } catch {}
}

// ─── Nav button ───────────────────────────────────────────────────────────────

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
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center px-5 py-2.5 text-gray-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
    >
      {children}
    </button>
  );
}

// ─── Board ────────────────────────────────────────────────────────────────────

export const PracticeBoard = forwardRef<PracticeBoardHandle, PracticeBoardProps>(function PracticeBoard({
  opening,
  variation,
  mode,
  coachPersona = 'neutral',
  onMoveIndexChange,
  onCoachFeedbackChange,
  onNavStateChange,
  onBoardSizeChange,
  controlsRight,
  hideControls = false,
}, ref) {
  const { theme, animationDuration, settings } = useBoardSettings();
  const customPieces = useMemo(() => getCustomPieces(settings.pieceSetId), [settings.pieceSetId]);
  const { user } = useAuth();
  const recordCompletion = useRecordCompletion();
  const recordLearned = useRecordLearned();

  const chessboardRef = useRef<{ clearPremoves: (clearLastPieceColour?: boolean) => void } | null>(
    null
  );
  const chessRef = useRef(new Chess());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const wrongResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickPremoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRecordedRef = useRef(false);
  const hintUsedRef = useRef(false);

  const [position, setPosition] = useState(chessRef.current.fen());
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [status, setStatus] = useState<PracticeStatus>('loading');
  const [hintActive, setHintActive] = useState(false);
  const [wrongMoveFrom, setWrongMoveFrom] = useState<string | null>(null);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [wrongMoveTo, setWrongMoveTo] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [queuedClickPremove, setQueuedClickPremove] = useState<QueuedPremove | null>(null);
  const [boardSize, setBoardSize] = useState(480);

  // ─── Browse / review navigation ──────────────────────────────────────────────
  // null = live (showing current game position), number = reviewing a past position
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const isLive = viewIndex === null;
  const displayIndex = viewIndex ?? currentMoveIndex;
  const canGoBack = displayIndex > 0;
  const moves = variation.moves;
  const maxNavigableIndex = currentMoveIndex;
  const canGoForward = displayIndex < maxNavigableIndex;

  const isMyTurn = isLive && status === 'playing' && isUserTurn(currentMoveIndex, opening.color);
  const playerColor = opening.color === 'white' ? 'w' : 'b';
  const boardOrientation = getBoardOrientation(opening.color, settings.flipBoard);

  // FEN at an arbitrary move index by replaying from start
  const displayPosition = useMemo(() => {
    if (isLive) return position;
    const chess = new Chess();
    for (let i = 0; i < displayIndex; i++) {
      try {
        chess.move(moves[i].san);
      } catch {
        break;
      }
    }
    return chess.fen();
  }, [isLive, displayIndex, moves, position]);

  const navigateTo = (index: number) => {
    const clamped = Math.max(0, Math.min(index, maxNavigableIndex));
    if (clamped !== displayIndex) playMoveSound(settings.moveSound);
    setViewIndex(clamped === currentMoveIndex ? null : clamped);
  };

  const updateMoveIndex = (nextIndex: number) => {
    setCurrentMoveIndex(nextIndex);
  };

  const highlightedMoveIndex = useMemo(() => {
    if (moves.length === 0) return -1;
    if (isLive) {
      return currentMoveIndex > 0 ? Math.min(currentMoveIndex - 1, moves.length - 1) : -1;
    }

    return displayIndex > 0 ? Math.min(displayIndex - 1, moves.length - 1) : -1;
  }, [currentMoveIndex, displayIndex, isLive, moves.length]);

  useEffect(() => {
    onMoveIndexChange?.(highlightedMoveIndex);
  }, [highlightedMoveIndex, onMoveIndexChange]);

  const resetWrongMove = () => {
    if (wrongResetRef.current) clearTimeout(wrongResetRef.current);
    wrongResetRef.current = setTimeout(() => {
      setStatus(current => (current === 'wrong' ? 'playing' : current));
      setWrongMoveFrom(null);
      setWrongMoveTo(null);
    }, WRONG_MOVE_RESET_MS);
  };

  const resetPractice = () => {
    if (wrongResetRef.current) clearTimeout(wrongResetRef.current);
    if (clickPremoveTimerRef.current) clearTimeout(clickPremoveTimerRef.current);
    wrongResetRef.current = null;
    clickPremoveTimerRef.current = null;
    hasRecordedRef.current = false;
    hintUsedRef.current = false;
    setHintActive(false);
    chessRef.current = new Chess();
    setPosition(chessRef.current.fen());
    updateMoveIndex(0);
    setStatus('playing');
    setWrongMoveFrom(null);
    setWrongMoveTo(null);
    setSelectedSquare(null);
    setQueuedClickPremove(null);
    onCoachFeedbackChange?.(null);
    setViewIndex(null);
    setOverlayDismissed(false);
    chessboardRef.current?.clearPremoves?.();
  };

  useEffect(() => {
    resetPractice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, opening.id, variation.id]);

  useEffect(() => {
    if (!settings.moveSound) return;

    const unlock = () => {
      unlockMoveSound(settings.moveSound);
    };
    const unlockWhenVisible = () => {
      if (document.visibilityState === 'visible') unlockMoveSound(settings.moveSound);
    };
    const keepAwake = () => {
      keepMoveSoundAwake(settings.moveSound);
    };
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

  useEffect(() => {
    return () => {
      if (wrongResetRef.current) clearTimeout(wrongResetRef.current);
      if (clickPremoveTimerRef.current) clearTimeout(clickPremoveTimerRef.current);
      stopMoveSoundWake();
    };
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const updateSize = () => {
      // Reserve space for the eval bar (w-8 = 32px) + mr-2 gap (8px)
      const size = Math.min(el.clientWidth - 40, el.clientHeight);
      if (size > 0) {
        setBoardSize(size);
        onBoardSizeChange?.(size);
      }
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    updateSize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (status === 'complete' && !hasRecordedRef.current && user) {
      hasRecordedRef.current = true;
      if (mode === 'learn') {
        recordLearned.mutate({ openingSlug: opening.id, variationSlug: variation.id });
      } else if (!hintUsedRef.current) {
        recordCompletion.mutate({ openingSlug: opening.id, variationSlug: variation.id });
      }
    }
  }, [mode, opening.id, recordCompletion, recordLearned, status, user, variation.id]);

  useEffect(() => {
    setHintActive(false);
  }, [currentMoveIndex]);

  useEffect(() => {
    if (status === 'wrong' || status === 'complete' || !isLive) {
      chessboardRef.current?.clearPremoves?.();
      setQueuedClickPremove(null);
      setSelectedSquare(null);
    }
  }, [isLive, status]);

  useEffect(() => {
    if (viewIndex === null) return;
    if (viewIndex <= maxNavigableIndex) return;
    setViewIndex(null);
  }, [maxNavigableIndex, viewIndex]);

  // Computer reply — only advances when live
  useEffect(() => {
    if (status !== 'playing') return;
    if (currentMoveIndex >= moves.length) return;
    if (isUserTurn(currentMoveIndex, opening.color)) return;

    const timer = setTimeout(() => {
      const reply = moves[currentMoveIndex];
      if (!reply) return;
      const nextChess = new Chess(chessRef.current.fen());
      try {
        nextChess.move(reply.san);
      } catch {
        return;
      }
      playMoveSound(settings.moveSound);
      chessRef.current = nextChess;
      setPosition(nextChess.fen());
      const nextIndex = currentMoveIndex + 1;
      updateMoveIndex(nextIndex);
      setStatus(nextIndex >= moves.length ? 'complete' : 'playing');
      setWrongMoveFrom(null);
      setWrongMoveTo(null);

      if (queuedClickPremove && nextIndex < moves.length) {
        if (clickPremoveTimerRef.current) clearTimeout(clickPremoveTimerRef.current);
        clickPremoveTimerRef.current = setTimeout(() => {
          const premoveChess = new Chess(nextChess.fen());
          commitMove(queuedClickPremove.from, queuedClickPremove.to, 'q', nextIndex, premoveChess);
          clickPremoveTimerRef.current = null;
        }, animationDuration);
      }
    }, animationDuration);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    animationDuration,
    currentMoveIndex,
    moves,
    opening.color,
    queuedClickPremove,
    settings.moveSound,
    status,
  ]);

  // ─── Derived display values ───────────────────────────────────────────────────

  const lastMove = useMemo(() => {
    if (displayIndex === 0) return null;
    if (isLive) {
      const h = chessRef.current.history({ verbose: true });
      return h[h.length - 1] ?? null;
    }
    // Replay up to displayIndex to find the move that landed there
    const chess = new Chess();
    for (let i = 0; i < displayIndex; i++) {
      try {
        chess.move(moves[i].san);
      } catch {
        break;
      }
    }
    const h = chess.history({ verbose: true });
    return h[h.length - 1] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, displayIndex, moves, position]);

  const isViewingLineEnd = displayIndex >= moves.length && moves.length > 0;

  const getEvalAtPly = (ply: number) => {
    const evalByPly = variation.evalCpByPly;
    if (Array.isArray(evalByPly) && typeof evalByPly[ply] === 'number') {
      return evalByPly[ply];
    }

    if (Array.isArray(evalByPly)) {
      for (let index = Math.min(ply, evalByPly.length - 1); index >= 0; index -= 1) {
        if (typeof evalByPly[index] === 'number' && Number.isFinite(evalByPly[index])) {
          return evalByPly[index];
        }
      }
    }

    if (ply === 0) {
      return INITIAL_POSITION_EVAL_CP;
    }

    if (ply === moves.length) {
      return (
        toWhiteEvalCp(variation.finalEvalCp, variation.finalEvalPerspective, opening.color) ??
        undefined
      );
    }

    return undefined;
  };

  const currentStaticEvalCp = getEvalAtPly(displayIndex);
  const dbEvalCp = useOpeningPositionEval(displayPosition);
  const displayedEvalCp = currentStaticEvalCp ?? dbEvalCp;
  const trainedSideDisplayedEvalCp =
    typeof displayedEvalCp === 'number' && Number.isFinite(displayedEvalCp)
      ? opening.color === 'white'
        ? displayedEvalCp
        : -displayedEvalCp
      : undefined;

  // Keep board offset stable from the start whenever this line can show eval data.
  const hasVisibleEvalBar =
    (typeof dbEvalCp === 'number' && Number.isFinite(dbEvalCp)) ||
    (typeof currentStaticEvalCp === 'number' && Number.isFinite(currentStaticEvalCp)) ||
    (typeof variation.finalEvalCp === 'number' && Number.isFinite(variation.finalEvalCp));
  const boardAlignedClassName = `mx-auto w-full ${hasVisibleEvalBar ? 'sm:translate-x-[20px]' : ''}`;

  const legalTargets = useMemo(() => {
    if (!isLive || status !== 'playing' || !selectedSquare) return [];

    const selectionChess = new Chess(chessRef.current.fen());
    if (!isMyTurn) {
      const opponentReply = moves[currentMoveIndex];
      if (!opponentReply) return [];
      try {
        selectionChess.move(opponentReply.san);
      } catch {
        return [];
      }
    }

    try {
      return selectionChess.moves({
        square: selectedSquare as Parameters<Chess['moves']>[0]['square'],
        verbose: true,
      });
    } catch {
      return [];
    }
  }, [currentMoveIndex, isLive, isMyTurn, moves, selectedSquare, status]);

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (isLive && selectedSquare) {
      styles[selectedSquare] = { background: '#D8A548' };
    }
    if (lastMove && status !== 'wrong') {
      styles[lastMove.from] = { background: 'rgba(255, 210, 0, 0.38)' };
      styles[lastMove.to] = { background: 'rgba(255, 210, 0, 0.38)' };
    }
    if (isLive && status === 'wrong' && wrongMoveFrom && wrongMoveTo) {
      styles[wrongMoveFrom] = { background: 'rgba(220, 38, 38, 0.5)' };
      styles[wrongMoveTo] = { background: 'rgba(220, 38, 38, 0.5)' };
    }
    if (isLive && selectedSquare && status === 'playing') {
      for (const move of legalTargets) {
        const base = styles[move.to] ?? {};
        styles[move.to] = isCaptureStyleMove(move.flags)
          ? {
              ...base,
              background:
                'radial-gradient(circle, rgba(0,0,0,0) 61%, rgba(32,32,32,0.45) 63%, rgba(32,32,32,0.45) 73%, rgba(0,0,0,0) 75%)',
              borderRadius: '50%',
            }
          : {
              ...base,
              background: 'radial-gradient(circle, rgba(36, 40, 50, 0.42) 22%, rgba(0,0,0,0) 24%)',
            };
      }
    }
    if (isLive && isMyTurn && moves[currentMoveIndex]) {
      const hintChess = new Chess(chessRef.current.fen());
      const match = hintChess
        .moves({ verbose: true })
        .find(m => m.san === moves[currentMoveIndex].san);
      if (match?.from) {
        const existingStyle = styles[match.from] ?? {};
        if (mode === 'learn') {
          styles[match.from] = {
            ...existingStyle,
            boxShadow: 'inset 0 0 0 5px rgba(251,191,36,0.65)',
          };
        } else if (hintActive) {
          styles[match.from] = {
            ...existingStyle,
            background: 'rgba(251,191,36,0.35)',
            boxShadow: 'inset 0 0 0 3px rgba(251,191,36,0.85)',
          };
        }
      }
    }
    if (queuedClickPremove) {
      styles[queuedClickPremove.from] = {
        ...(styles[queuedClickPremove.from] ?? {}),
        background: '#D8A548',
      };
      styles[queuedClickPremove.to] = {
        ...(styles[queuedClickPremove.to] ?? {}),
        background: 'rgba(216, 165, 72, 0.58)',
      };
    }
    return styles;
  }, [
    currentMoveIndex,
    hintActive,
    isLive,
    isMyTurn,
    lastMove,
    legalTargets,
    mode,
    moves,
    queuedClickPremove,
    selectedSquare,
    status,
    wrongMoveFrom,
    wrongMoveTo,
  ]);

  // ─── Input handlers (disabled while reviewing) ────────────────────────────────

  const validatePremove = (sourceSquare: string, targetSquare: string) => {
    const opponentReply = moves[currentMoveIndex];
    const expectedFollowUp = moves[currentMoveIndex + 1];
    if (!opponentReply || !expectedFollowUp) return false;
    const afterReply = new Chess(chessRef.current.fen());
    try {
      afterReply.move(opponentReply.san);
      const queued = afterReply.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      return queued.san === expectedFollowUp.san;
    } catch {
      return false;
    }
  };

  const commitMove = (
    sourceSquare: string,
    targetSquare: string,
    promotion: PromotionPiece,
    expectedIndex = currentMoveIndex,
    baseChess = new Chess(chessRef.current.fen())
  ) => {
    const expectedMove = moves[expectedIndex];
    if (!expectedMove) return false;
    try {
      const move = baseChess.move({ from: sourceSquare, to: targetSquare, promotion });
      if (move.san !== expectedMove.san) {
        onCoachFeedbackChange?.(
          buildWrongMoveCoachFeedback({
            attemptedSan: move.san,
            expectedSan: expectedMove.san,
            openingId: opening.id,
            variationId: variation.id,
            variationName: variation.name,
            moveIndex: expectedIndex,
            persona: coachPersona,
          })
        );
        setStatus('wrong');
        setWrongMoveFrom(sourceSquare);
        setWrongMoveTo(targetSquare);
        setSelectedSquare(null);
        setQueuedClickPremove(null);
        chessboardRef.current?.clearPremoves?.();
        resetWrongMove();
        return false;
      }
      playMoveSound(settings.moveSound);
      chessRef.current = baseChess;
      setPosition(baseChess.fen());
      setSelectedSquare(null);
      setQueuedClickPremove(null);
      const nextIndex = expectedIndex + 1;
      updateMoveIndex(nextIndex);
      onCoachFeedbackChange?.(
        buildMoveCoachFeedback({
          openingColor: opening.color,
          openingId: opening.id,
          variationId: variation.id,
          variationName: variation.name,
          moveSan: move.san,
          moveIndex: expectedIndex,
          moveCount: moves.length,
          beforeEvalCp: getEvalAtPly(expectedIndex),
          afterEvalCp: getEvalAtPly(nextIndex),
          primaryCategory: variation.primaryCategory,
          isFinalMove: nextIndex >= moves.length,
          persona: coachPersona,
        })
      );
      setWrongMoveFrom(null);
      setWrongMoveTo(null);
      setStatus(nextIndex >= moves.length ? 'complete' : 'playing');
      return true;
    } catch {
      return false;
    }
  };

  const attemptMove = (sourceSquare: string, targetSquare: string) => {
    const nextChess = new Chess(chessRef.current.fen());
    if (isPromotionCandidate(nextChess, sourceSquare, targetSquare)) return false;
    return commitMove(sourceSquare, targetSquare, 'q', currentMoveIndex, nextChess);
  };

  const onPieceDrop = (sourceSquare: string, targetSquare: string) => {
    if (!isLive || status !== 'playing') return false;
    if (!isMyTurn) return validatePremove(sourceSquare, targetSquare);
    return attemptMove(sourceSquare, targetSquare);
  };

  const onPieceClick = (piece: string, square: string) => {
    if (!isLive || status !== 'playing') return;
    if (piece[0] !== playerColor) return;

    setSelectedSquare(current => (current === square ? null : square));
  };

  const onPieceDragBegin = (piece: string, sourceSquare: string) => {
    if (!isLive || status !== 'playing') return;
    if (piece[0] !== playerColor) return;
    setSelectedSquare(sourceSquare);
  };

  const onPieceDragEnd = (piece: string, sourceSquare: string) => {
    if (!isLive || status !== 'playing') return;
    if (piece[0] !== playerColor) return;

    const currentPiece = chessRef.current.get(sourceSquare as Parameters<Chess['get']>[0]);
    if (currentPiece?.color === playerColor) {
      setSelectedSquare(sourceSquare);
    }
  };

  const onSquareClick = (square: string, piece?: string) => {
    if (!isLive || status !== 'playing') return;
    const isOwnPiece = piece?.[0] === playerColor;

    if (!selectedSquare) {
      if (isOwnPiece) return;
      setSelectedSquare(null);
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    if (isOwnPiece) {
      setSelectedSquare(square);
      return;
    }

    if (!isMyTurn) {
      if (validatePremove(selectedSquare, square)) {
        setQueuedClickPremove({ from: selectedSquare, to: square });
        setSelectedSquare(null);
      }
      return;
    }

    const opensPromotion = isPromotionCandidate(
      new Chess(chessRef.current.fen()),
      selectedSquare,
      square
    );
    const moved = attemptMove(selectedSquare, square);
    if (!moved && !opensPromotion) setSelectedSquare(selectedSquare);
  };

  const onPromotionCheck = (sourceSquare: string, targetSquare: string, piece: string) => {
    if (!isLive || status !== 'playing' || !isMyTurn) return false;
    if (piece[0] !== playerColor) return false;
    return isPromotionCandidate(new Chess(chessRef.current.fen()), sourceSquare, targetSquare);
  };

  const onPromotionPieceSelect = (
    piece?: string,
    promoteFromSquare?: string,
    promoteToSquare?: string
  ) => {
    if (!promoteFromSquare || !promoteToSquare) return false;
    const nextChess = new Chess(chessRef.current.fen());
    return commitMove(
      promoteFromSquare,
      promoteToSquare,
      normalizePromotionPiece(piece),
      currentMoveIndex,
      nextChess
    );
  };

  // ─── Keyboard navigation ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') navigateTo(displayIndex - 1);
      if (e.key === 'ArrowRight') navigateTo(displayIndex + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayIndex, currentMoveIndex]);

  useImperativeHandle(ref, () => ({
    navigateFirst: () => navigateTo(0),
    navigateBack: () => navigateTo(displayIndex - 1),
    navigateForward: () => navigateTo(displayIndex + 1),
    navigateLast: () => navigateTo(currentMoveIndex),
    reset: resetPractice,
  }));

  useEffect(() => {
    onNavStateChange?.({ canGoBack, canGoForward, isLive });
  }, [canGoBack, canGoForward, isLive, onNavStateChange]);

  return (
    <div className="relative flex h-full w-full select-none flex-col">
      {/* Board */}
      <div ref={wrapperRef} className="flex min-h-0 flex-1 items-center justify-center">
        <EvalBar
          evalCp={displayedEvalCp}
          displayEvalCp={trainedSideDisplayedEvalCp}
          displayPerspective={opening.color}
          reserveSpace={hasVisibleEvalBar}
          size={boardSize}
        />
        <div className="relative">
          <div
            className={`overflow-hidden transition-all duration-150 ${
              !isLive
                ? 'ring-2 ring-blue-500/40'
                : status === 'wrong'
                  ? 'ring-2 ring-red-500/60'
                  : status === 'complete'
                    ? 'ring-2 ring-green-400/60'
                    : 'ring-1 ring-white/10'
            }`}
          >
            <Chessboard
              ref={chessboardRef}
              position={displayPosition}
              onPieceDrop={onPieceDrop}
              onPieceClick={onPieceClick}
              onPieceDragBegin={onPieceDragBegin}
              onPieceDragEnd={onPieceDragEnd}
              onSquareClick={onSquareClick}
              onPromotionCheck={onPromotionCheck}
              onPromotionPieceSelect={onPromotionPieceSelect}
              boardWidth={boardSize}
              boardOrientation={boardOrientation}
              arePiecesDraggable={isLive}
              arePremovesAllowed={isLive}
              clearPremovesOnRightClick={true}
              isDraggablePiece={({ piece }) => isLive && piece[0] === playerColor}
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

      {!hideControls && (
        <div
          className={`${boardAlignedClassName} grid shrink-0 grid-cols-3 items-center`}
          style={{ maxWidth: boardSize }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={resetPractice}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-white/20 hover:text-white"
            >
              ↺ Restart
            </button>
            {mode === 'practice' && isMyTurn && (
              <button
                onClick={() => {
                  hintUsedRef.current = true;
                  setHintActive(true);
                }}
                disabled={hintActive}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
              >
                Hint
              </button>
            )}
          </div>
          <div className="flex justify-center">
            <div className="flex items-center divide-x divide-white/10 overflow-hidden rounded-lg border border-white/10">
              <NavBtn onClick={() => navigateTo(0)} disabled={!canGoBack} title="First move">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                  <path d="M3.5 3a.5.5 0 0 1 .5.5v3.793l6.146-4.439A.5.5 0 0 1 11 3.5v9a.5.5 0 0 1-.854.354L4 8.707V12.5a.5.5 0 0 1-1 0v-9a.5.5 0 0 1 .5-.5z" />
                </svg>
              </NavBtn>
              <NavBtn onClick={() => navigateTo(displayIndex - 1)} disabled={!canGoBack} title="Previous move">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                  <path d="M11.354 3.646a.5.5 0 0 1 0 .708L6.707 9l4.647 4.646a.5.5 0 0 1-.708.708l-5-5a.5.5 0 0 1 0-.708l5-5a.5.5 0 0 1 .708 0z" />
                </svg>
              </NavBtn>
              <NavBtn onClick={() => navigateTo(displayIndex + 1)} disabled={!canGoForward} title="Next move">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                  <path d="M4.646 3.646a.5.5 0 0 1 .708 0l5 5a.5.5 0 0 1 0 .708l-5 5a.5.5 0 0 1-.708-.708L9.293 9 4.646 4.354a.5.5 0 0 1 0-.708z" />
                </svg>
              </NavBtn>
              <NavBtn onClick={() => navigateTo(currentMoveIndex)} disabled={isLive} title="Latest move">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                  <path d="M12.5 3a.5.5 0 0 0-.5.5v3.793L5.854 2.854A.5.5 0 0 0 5 3.5v9a.5.5 0 0 0 .854.354L12 8.207V12.5a.5.5 0 0 0 1 0v-9a.5.5 0 0 0-.5-.5z" />
                </svg>
              </NavBtn>
            </div>
          </div>
          <div className="flex justify-end">{controlsRight}</div>
        </div>
      )}
      {((status === 'complete' && isLive) || (mode === 'learn' && isViewingLineEnd)) &&
        !overlayDismissed && (
          <CompletionOverlay
            variationName={variation.name}
            moveCount={moves.length}
            onPracticeAgain={resetPractice}
            onDismiss={() => setOverlayDismissed(true)}
          />
        )}
    </div>
  );
});
