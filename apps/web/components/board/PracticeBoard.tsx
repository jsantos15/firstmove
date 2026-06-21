'use client';

import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, type CoachPersona, type Opening, type OpeningVariation } from '@firstmove/core';
import { useRecordCompletion, useRecordLearned } from '@/hooks/useProgress';
import { useAuth } from '@/app/providers';
import { CompletionOverlay } from './CompletionOverlay';
import { BoardPanel } from './BoardPanel';
import { useBoardSettings } from '@/hooks/useBoardSettings';
import { getCustomPieces } from '@/lib/piecesets';
import {
  buildMoveCoachFeedback,
  buildWrongMoveCoachFeedback,
  type CoachFeedback,
} from '@/lib/coachFeedback';
import { useOpeningPositionEval } from '@/hooks/useOpeningPositionEval';
import { NavBtn } from './NavBtn';

export type PracticeMode = 'learn' | 'practice';

export interface PracticeBoardHandle {
  navigateFirst: () => void;
  navigateBack: () => void;
  navigateForward: () => void;
  navigateLast: () => void;
  navigateTo: (index: number) => void;
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
  onDisplayIndexChange?: (index: number) => void;
  onCoachFeedbackChange?: (feedback: CoachFeedback | null) => void;
  onNavStateChange?: (state: { canGoBack: boolean; canGoForward: boolean; isLive: boolean }) => void;
  topBar?: React.ReactNode;
  bottomBar?: React.ReactNode;
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

function isCaptureStyleMove(move: { captured?: string }) {
  return move.captured !== undefined;
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

function toWhiteEvalCp(
  finalEvalCp: number | undefined,
  perspective: 'white' | 'black' | undefined,
  fallbackPerspective: 'white' | 'black'
) {
  if (typeof finalEvalCp !== 'number' || !Number.isFinite(finalEvalCp)) return null;
  const evalPerspective = perspective ?? fallbackPerspective;
  return evalPerspective === 'white' ? finalEvalCp : -finalEvalCp;
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

// ─── Board ────────────────────────────────────────────────────────────────────

export const PracticeBoard = forwardRef<PracticeBoardHandle, PracticeBoardProps>(function PracticeBoard({
  opening,
  variation,
  mode,
  coachPersona = 'neutral',
  onMoveIndexChange,
  onDisplayIndexChange,
  onCoachFeedbackChange,
  onNavStateChange,
  topBar,
  bottomBar,
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
  // In Learn mode the user can play at any displayed position where it's their turn
  const learnIsMyTurn = mode === 'learn'
    ? status === 'playing' && displayIndex < moves.length && isUserTurn(displayIndex, opening.color)
    : isMyTurn;
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



  const getEvalAtPly = (ply: number) => {
    // Ply 0 is always the initial board position — use the well-known constant rather than
    // whatever the line's evalCpByPly[0] says (practical branches index that array from their
    // anchor position, so [0] reflects the anchor eval, not the initial position).
    if (ply === 0) {
      return INITIAL_POSITION_EVAL_CP;
    }

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

  // Keep board offset stable from the start whenever this line can show eval data.
  const hasVisibleEvalBar =
    (typeof dbEvalCp === 'number' && Number.isFinite(dbEvalCp)) ||
    (typeof currentStaticEvalCp === 'number' && Number.isFinite(currentStaticEvalCp)) ||
    (typeof variation.finalEvalCp === 'number' && Number.isFinite(variation.finalEvalCp));

  const legalTargets = useMemo(() => {
    if (!selectedSquare || status !== 'playing') return [];
    if (mode === 'learn' && !learnIsMyTurn) return [];
    if (mode !== 'learn' && (!isLive || !isMyTurn)) return [];

    const selectionChess = mode === 'learn' ? new Chess(displayPosition) : new Chess(chessRef.current.fen());
    if (mode !== 'learn' && !isMyTurn) {
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
  }, [currentMoveIndex, displayPosition, isLive, isMyTurn, learnIsMyTurn, moves, selectedSquare, status]);

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if ((isLive || learnIsMyTurn) && selectedSquare) {
      styles[selectedSquare] = { background: '#D8A548' };
    }
    if (lastMove && status !== 'wrong') {
      styles[lastMove.from] = { background: 'rgba(255, 210, 0, 0.38)' };
      styles[lastMove.to] = { background: 'rgba(255, 210, 0, 0.38)' };
    }
    if ((isLive || mode === 'learn') && status === 'wrong' && wrongMoveFrom && wrongMoveTo) {
      styles[wrongMoveFrom] = { background: 'rgba(220, 38, 38, 0.5)' };
      styles[wrongMoveTo] = { background: 'rgba(220, 38, 38, 0.5)' };
    }
    if ((isLive || learnIsMyTurn) && selectedSquare && status === 'playing') {
      for (const move of legalTargets) {
        const base = styles[move.to] ?? {};
        styles[move.to] = isCaptureStyleMove(move)
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
    if (learnIsMyTurn && moves[displayIndex]) {
      const hintChess = new Chess(displayPosition);
      const match = hintChess
        .moves({ verbose: true })
        .find(m => m.san === moves[displayIndex].san);
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
    displayIndex,
    displayPosition,
    hintActive,
    isLive,
    isMyTurn,
    lastMove,
    learnIsMyTurn,
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

  // Learn mode: play from the displayed position (may be a review position)
  const attemptLearnMove = (sourceSquare: string, targetSquare: string) => {
    const baseChess = new Chess(displayPosition);
    if (isPromotionCandidate(baseChess, sourceSquare, targetSquare)) return false;
    const success = commitMove(sourceSquare, targetSquare, 'q', displayIndex, baseChess);
    if (success && !isLive) setViewIndex(null);
    return success;
  };

  const onPieceDrop = (sourceSquare: string, targetSquare: string) => {
    if (mode === 'learn') {
      if (!learnIsMyTurn) return false;
      return attemptLearnMove(sourceSquare, targetSquare);
    }
    if (!isLive || status !== 'playing') return false;
    if (!isMyTurn) return validatePremove(sourceSquare, targetSquare);
    return attemptMove(sourceSquare, targetSquare);
  };

  const onPieceClick = (piece: string, square: string) => {
    if (mode === 'learn' ? !learnIsMyTurn : (!isLive || status !== 'playing')) return;
    if (piece[0] !== playerColor) return;

    setSelectedSquare(current => (current === square ? null : square));
  };

  const onPieceDragBegin = (piece: string, sourceSquare: string) => {
    if (mode === 'learn' ? !learnIsMyTurn : (!isLive || status !== 'playing')) return;
    if (piece[0] !== playerColor) return;
    setSelectedSquare(sourceSquare);
  };

  const onPieceDragEnd = (piece: string, sourceSquare: string) => {
    if (mode === 'learn' ? !learnIsMyTurn : (!isLive || status !== 'playing')) return;
    if (piece[0] !== playerColor) return;

    if (mode === 'learn') {
      setSelectedSquare(sourceSquare);
    } else {
      const currentPiece = chessRef.current.get(sourceSquare as Parameters<Chess['get']>[0]);
      if (currentPiece?.color === playerColor) {
        setSelectedSquare(sourceSquare);
      }
    }
  };

  const onSquareClick = (square: string, piece?: string) => {
    if (mode === 'learn' ? status !== 'playing' : (!isLive || status !== 'playing')) return;
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

    if (mode === 'learn') {
      if (!learnIsMyTurn) { setSelectedSquare(null); return; }
      const opensPromotion = isPromotionCandidate(new Chess(displayPosition), selectedSquare, square);
      const moved = attemptLearnMove(selectedSquare, square);
      if (!moved && !opensPromotion) setSelectedSquare(selectedSquare);
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
    if (mode === 'learn') {
      if (!learnIsMyTurn || piece[0] !== playerColor) return false;
      return isPromotionCandidate(new Chess(displayPosition), sourceSquare, targetSquare);
    }
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
    if (mode === 'learn') {
      const baseChess = new Chess(displayPosition);
      const success = commitMove(promoteFromSquare, promoteToSquare, normalizePromotionPiece(piece), displayIndex, baseChess);
      if (success && !isLive) setViewIndex(null);
      return success;
    }
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
    navigateFirst: () => navigateTo(1),
    navigateBack: () => navigateTo(displayIndex - 1),
    navigateForward: () => navigateTo(displayIndex + 1),
    navigateLast: () => navigateTo(maxNavigableIndex),
    navigateTo,
    reset: resetPractice,
  }));

  useEffect(() => {
    onNavStateChange?.({ canGoBack, canGoForward, isLive });
  }, [canGoBack, canGoForward, isLive, onNavStateChange]);

  useEffect(() => {
    onDisplayIndexChange?.(displayIndex);
  }, [displayIndex, onDisplayIndexChange]);

  const ringClass = !isLive
    ? 'ring-2 ring-blue-500/40'
    : status === 'wrong'
      ? 'ring-2 ring-red-500/60'
      : status === 'complete'
        ? 'ring-2 ring-green-400/60'
        : 'ring-1 ring-white/10';

  const defaultControls = !hideControls && !bottomBar ? (
    <div className="grid grid-cols-3 items-center">
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
  ) : null;

  return (
    <BoardPanel
      topBar={topBar}
      bottomBar={bottomBar ?? defaultControls ?? undefined}
      evalCp={displayedEvalCp}
      displayPerspective={boardOrientation}
      reserveEvalSpace={hasVisibleEvalBar}
      boardSize={boardSize}
      onBoardSizeChange={setBoardSize}
      ringClass={ringClass}
      overlay={mode === 'practice' && status === 'complete' && isLive && !overlayDismissed ? (
        <CompletionOverlay
          variationName={variation.name}
          moveCount={moves.length}
          onPracticeAgain={resetPractice}
          onDismiss={() => setOverlayDismissed(true)}
        />
      ) : undefined}
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
        arePiecesDraggable={isLive || learnIsMyTurn}
        arePremovesAllowed={isLive}
        clearPremovesOnRightClick={true}
        isDraggablePiece={({ piece }) => (isLive || learnIsMyTurn) && piece[0] === playerColor}
        customSquareStyles={customSquareStyles}
        showBoardNotation={settings.showCoordinates}
        customDarkSquareStyle={{ backgroundColor: theme.dark }}
        customLightSquareStyle={{ backgroundColor: theme.light }}
        animationDuration={animationDuration}
        customPieces={customPieces}
      />
    </BoardPanel>
  );
});
