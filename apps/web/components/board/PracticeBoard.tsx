'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, type Opening, type OpeningVariation } from '@firstmove/core';
import { useRecordCompletion, useRecordLearned } from '@/hooks/useProgress';
import { useAuth } from '@/app/providers';
import { CompletionOverlay } from './CompletionOverlay';
import { useBoardSettings } from '@/hooks/useBoardSettings';
import { getCustomPieces } from '@/lib/piecesets';

export type PracticeMode = 'learn' | 'practice';

interface PracticeBoardProps {
  opening: Opening;
  variation: OpeningVariation & {
    engineChecked?: boolean;
    evalCpByPly?: number[];
    finalEvalCp?: number;
    finalEvalPerspective?: 'white' | 'black';
  };
  mode: PracticeMode;
  onModeChange: (mode: PracticeMode) => void;
  onMoveIndexChange?: (index: number) => void;
  controlsRight?: React.ReactNode;
}

type PracticeStatus = 'loading' | 'playing' | 'wrong' | 'complete';
type PromotionPiece = 'q' | 'r' | 'b' | 'n';

interface QueuedPremove {
  from: string;
  to: string;
}

const WRONG_MOVE_RESET_MS = 900;
const EVAL_BAR_CP_LIMIT = 600;

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
  if (normalized === 'q' || normalized === 'r' || normalized === 'b' || normalized === 'n') return normalized;
  return 'q';
}

function getBoardOrientation(openingColor: 'white' | 'black', flipBoard: boolean) {
  const baseOrientation = openingColor;
  if (!flipBoard) return baseOrientation;
  return baseOrientation === 'white' ? 'black' : 'white';
}

function formatEvalLabel(whiteEvalCp: number) {
  if (Math.abs(whiteEvalCp) < 10) return '0.0';
  const pawns = Math.abs(whiteEvalCp) / 100;
  return `${whiteEvalCp > 0 ? '+' : '-'}${pawns.toFixed(1)}`;
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
}: {
  evalCp?: number;
}) {
  if (typeof evalCp !== 'number' || !Number.isFinite(evalCp)) return null;

  const clamped = Math.max(-EVAL_BAR_CP_LIMIT, Math.min(EVAL_BAR_CP_LIMIT, evalCp));
  const whiteHeight = 50 + (clamped / EVAL_BAR_CP_LIMIT) * 45;
  const label = formatEvalLabel(evalCp);
  const labelOnWhite = evalCp < 0;

  return (
    <div
      className="relative mr-2 hidden h-full w-7 shrink-0 overflow-hidden rounded-md border border-white/15 bg-[#181818] shadow-inner shadow-black/40 sm:block"
      title={`Engine evaluation: ${label}`}
      aria-label={`Engine evaluation ${label}`}
    >
      <div className="absolute inset-x-0 bottom-0 bg-zinc-100 transition-[height] duration-300" style={{ height: `${whiteHeight}%` }} />
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

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-amber-400/15 text-amber-300' : 'text-gray-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

let audioCtx: AudioContext | null = null;

function getAudioCtx() {
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
  return audioCtx;
}

function playMoveSound(enabled: boolean) {
  if (!enabled) return;

  try {
    const ctx = getAudioCtx();
    const bufferSize = Math.floor(ctx.sampleRate * 0.08);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.12));
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();

    if (ctx.state === 'suspended') void ctx.resume();
  } catch {}
}

export function PracticeBoard({ opening, variation, mode, onModeChange, onMoveIndexChange, controlsRight }: PracticeBoardProps) {
  const { theme, animationDuration, settings } = useBoardSettings();
  const customPieces = useMemo(() => getCustomPieces(settings.pieceSetId), [settings.pieceSetId]);
  const { user } = useAuth();
  const recordCompletion = useRecordCompletion();
  const recordLearned = useRecordLearned();

  const chessboardRef = useRef<{ clearPremoves: (clearLastPieceColour?: boolean) => void } | null>(null);
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
  const maxNavigableIndex = mode === 'learn' ? moves.length : currentMoveIndex;
  const canGoForward = displayIndex < maxNavigableIndex;

  const isMyTurn = isLive && status === 'playing' && isUserTurn(currentMoveIndex, opening.color);
  const playerColor = opening.color === 'white' ? 'w' : 'b';
  const boardOrientation = getBoardOrientation(opening.color, settings.flipBoard);

  // FEN at an arbitrary move index by replaying from start
  const displayPosition = useMemo(() => {
    if (isLive) return position;
    const chess = new Chess();
    for (let i = 0; i < displayIndex; i++) {
      try { chess.move(moves[i].san); } catch { break; }
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
      return status === 'complete'
        ? moves.length - 1
        : Math.min(currentMoveIndex, moves.length - 1);
    }

    return displayIndex > 0 ? Math.min(displayIndex - 1, moves.length - 1) : -1;
  }, [currentMoveIndex, displayIndex, isLive, moves.length, status]);

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
    setViewIndex(null);
    setOverlayDismissed(false);
    chessboardRef.current?.clearPremoves?.();
  };

  useEffect(() => {
    resetPractice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, opening.id, variation.id]);

  useEffect(() => {
    return () => {
      if (wrongResetRef.current) clearTimeout(wrongResetRef.current);
      if (clickPremoveTimerRef.current) clearTimeout(clickPremoveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const updateSize = () => {
      const size = Math.min(el.clientWidth, el.clientHeight);
      if (size > 0) setBoardSize(size);
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

  useEffect(() => { setHintActive(false); }, [currentMoveIndex]);

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
      try { nextChess.move(reply.san); } catch { return; }
      chessRef.current = nextChess;
      setPosition(nextChess.fen());
      const nextIndex = currentMoveIndex + 1;
      updateMoveIndex(nextIndex);
      playMoveSound(settings.moveSound);
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
  }, [animationDuration, currentMoveIndex, moves, opening.color, queuedClickPremove, settings.moveSound, status]);

  // ─── Derived display values ───────────────────────────────────────────────────

  const statusLabel = useMemo(() => {
    if (!isLive) return `Reviewing move ${displayIndex} / ${currentMoveIndex}`;
    if (status === 'complete') {
      if (mode === 'learn') return 'Line learned!';
      return hintUsedRef.current ? 'Done — try without hints to complete it' : 'Line completed!';
    }
    if (status === 'wrong') return 'Wrong move — try again';
    return isMyTurn ? `Your turn (${opening.color})` : 'Computer is thinking…';
  }, [isLive, displayIndex, currentMoveIndex, isMyTurn, mode, opening.color, status]);

  const lastMove = useMemo(() => {
    if (displayIndex === 0) return null;
    if (isLive) {
      const h = chessRef.current.history({ verbose: true });
      return h[h.length - 1] ?? null;
    }
    // Replay up to displayIndex to find the move that landed there
    const chess = new Chess();
    for (let i = 0; i < displayIndex; i++) {
      try { chess.move(moves[i].san); } catch { break; }
    }
    const h = chess.history({ verbose: true });
    return h[h.length - 1] ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, displayIndex, moves, position]);

  const progressPct = moves.length > 0 ? (currentMoveIndex / moves.length) * 100 : 0;
  const displayedEvalCp = useMemo(() => {
    const evalByPly = variation.evalCpByPly;
    if (Array.isArray(evalByPly) && typeof evalByPly[displayIndex] === 'number') {
      return evalByPly[displayIndex];
    }

    if (displayIndex === moves.length) {
      return toWhiteEvalCp(
        variation.finalEvalCp,
        variation.finalEvalPerspective,
        opening.color
      ) ?? undefined;
    }

    return undefined;
  }, [
    displayIndex,
    moves.length,
    opening.color,
    variation.evalCpByPly,
    variation.finalEvalCp,
    variation.finalEvalPerspective,
  ]);

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
      styles[lastMove.to]   = { background: 'rgba(255, 210, 0, 0.38)' };
    }
    if (isLive && status === 'wrong' && wrongMoveFrom && wrongMoveTo) {
      styles[wrongMoveFrom] = { background: 'rgba(220, 38, 38, 0.5)' };
      styles[wrongMoveTo]   = { background: 'rgba(220, 38, 38, 0.5)' };
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
              background:
                'radial-gradient(circle, rgba(36, 40, 50, 0.42) 22%, rgba(0,0,0,0) 24%)',
            };
      }
    }
    if (isLive && isMyTurn && moves[currentMoveIndex]) {
      const hintChess = new Chess(chessRef.current.fen());
      const match = hintChess.moves({ verbose: true }).find(m => m.san === moves[currentMoveIndex].san);
      if (match?.from) {
        if (mode === 'learn') {
          styles[match.from] = { boxShadow: 'inset 0 0 0 3px rgba(251,191,36,0.35)' };
        } else if (hintActive) {
          styles[match.from] = { background: 'rgba(251,191,36,0.35)', boxShadow: 'inset 0 0 0 3px rgba(251,191,36,0.85)' };
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
  }, [currentMoveIndex, hintActive, isLive, isMyTurn, lastMove, legalTargets, mode, moves, queuedClickPremove, selectedSquare, status, wrongMoveFrom, wrongMoveTo]);

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
    } catch { return false; }
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
        setStatus('wrong');
        setWrongMoveFrom(sourceSquare);
        setWrongMoveTo(targetSquare);
        setSelectedSquare(null);
        setQueuedClickPremove(null);
        chessboardRef.current?.clearPremoves?.();
        resetWrongMove();
        return false;
      }
      chessRef.current = baseChess;
      setPosition(baseChess.fen());
      setSelectedSquare(null);
      setQueuedClickPremove(null);
      const nextIndex = expectedIndex + 1;
      updateMoveIndex(nextIndex);
      playMoveSound(settings.moveSound);
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

    const opensPromotion = isPromotionCandidate(new Chess(chessRef.current.fen()), selectedSquare, square);
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
      if (e.key === 'ArrowLeft')  navigateTo(displayIndex - 1);
      if (e.key === 'ArrowRight') navigateTo(displayIndex + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayIndex, currentMoveIndex]);

  return (
    <div className="relative flex h-full w-full select-none flex-col gap-3">

      {/* Status + mode */}
      <div className="mx-auto w-full shrink-0" style={{ maxWidth: boardSize }}>
        <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-sm">
          <span className={`min-w-0 truncate ${!isLive ? 'text-blue-400' : 'text-gray-400'}`}>{statusLabel}</span>
          <div className="flex justify-center">
            <div className="flex overflow-hidden rounded-lg border border-white/10">
              <ModeButton active={mode === 'learn'} onClick={() => onModeChange('learn')}>Learn</ModeButton>
              <ModeButton active={mode === 'practice'} onClick={() => onModeChange('practice')}>Practice</ModeButton>
            </div>
          </div>
          <span className="min-w-0 truncate text-right text-gray-500">{currentMoveIndex}/{moves.length} moves</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              status === 'complete' ? 'bg-green-400' : 'bg-amber-400'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Board */}
      <div ref={wrapperRef} className="flex min-h-0 flex-1 items-center justify-center">
        <EvalBar
          evalCp={displayedEvalCp}
        />
        <div
          className={`overflow-hidden rounded-xl transition-all duration-150 ${
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

      {/* Controls — 3 columns: restart left · nav center · spacer right */}
      <div className="shrink-0 mx-auto w-full grid grid-cols-3 items-center" style={{ maxWidth: boardSize }}>

        {/* Restart + Hint — far left */}
        <div className="flex items-center gap-2">
          <button
            onClick={resetPractice}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-white/20 hover:text-white"
          >
            ↺ Restart
          </button>
          {mode === 'practice' && isMyTurn && (
            <button
              onClick={() => { hintUsedRef.current = true; setHintActive(true); }}
              disabled={hintActive}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
            >
              Hint
            </button>
          )}
        </div>

        {/* Navigation group — centered */}
        <div className="flex justify-center">
          <div className="flex items-center divide-x divide-white/10 overflow-hidden rounded-lg border border-white/10">
            <NavBtn onClick={() => navigateTo(0)} disabled={!canGoBack} title="First move">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                <path d="M3.5 3a.5.5 0 0 1 .5.5v3.793l6.146-4.439A.5.5 0 0 1 11 3.5v9a.5.5 0 0 1-.854.354L4 8.707V12.5a.5.5 0 0 1-1 0v-9a.5.5 0 0 1 .5-.5z"/>
              </svg>
            </NavBtn>
            <NavBtn onClick={() => navigateTo(displayIndex - 1)} disabled={!canGoBack} title="Previous move">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                <path d="M11.354 3.646a.5.5 0 0 1 0 .708L6.707 9l4.647 4.646a.5.5 0 0 1-.708.708l-5-5a.5.5 0 0 1 0-.708l5-5a.5.5 0 0 1 .708 0z"/>
              </svg>
            </NavBtn>
            <NavBtn onClick={() => navigateTo(displayIndex + 1)} disabled={!canGoForward} title="Next move">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                <path d="M4.646 3.646a.5.5 0 0 1 .708 0l5 5a.5.5 0 0 1 0 .708l-5 5a.5.5 0 0 1-.708-.708L9.293 9 4.646 4.354a.5.5 0 0 1 0-.708z"/>
              </svg>
            </NavBtn>
            <NavBtn onClick={() => navigateTo(currentMoveIndex)} disabled={isLive} title="Latest move">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
                <path d="M12.5 3a.5.5 0 0 0-.5.5v3.793L5.854 2.854A.5.5 0 0 0 5 3.5v9a.5.5 0 0 0 .854.354L12 8.207V12.5a.5.5 0 0 0 1 0v-9a.5.5 0 0 0-.5-.5z"/>
              </svg>
            </NavBtn>
          </div>
        </div>

        {/* Spacer — keeps nav truly centered */}
        <div className="flex justify-end">
          {controlsRight}
        </div>

      </div>
      {status === 'complete' && isLive && !overlayDismissed && (
        <CompletionOverlay
          variationName={variation.name}
          moveCount={moves.length}
          onPracticeAgain={resetPractice}
          onDismiss={() => setOverlayDismissed(true)}
        />
      )}
    </div>
  );
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
