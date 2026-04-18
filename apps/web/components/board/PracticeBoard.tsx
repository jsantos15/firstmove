'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, type Opening, type OpeningVariation } from '@firstmove/core';
import { useRecordCompletion } from '@/hooks/useProgress';
import { useAuth } from '@/app/providers';
import { CompletionOverlay } from './CompletionOverlay';
import { useBoardSettings } from '@/hooks/useBoardSettings';
import { getCustomPieces } from '@/lib/piecesets';

interface PracticeBoardProps {
  opening: Opening;
  variation: OpeningVariation;
  onMoveIndexChange?: (index: number) => void;
}

type PracticeStatus = 'loading' | 'playing' | 'wrong' | 'complete';

const CPU_REPLY_DELAY_MS = 300;
const WRONG_MOVE_RESET_MS = 900;

function isUserTurn(moveIndex: number, openingColor: 'white' | 'black') {
  return openingColor === 'white' ? moveIndex % 2 === 0 : moveIndex % 2 === 1;
}

let audioCtx: AudioContext | null = null;

function getAudioCtx() {
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
  return audioCtx;
}

function playMoveSound() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') void ctx.resume();
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
  } catch {}
}

export function PracticeBoard({ opening, variation, onMoveIndexChange }: PracticeBoardProps) {
  const { theme, animationDuration, settings } = useBoardSettings();
  const customPieces = useMemo(() => getCustomPieces(settings.pieceSetId), [settings.pieceSetId]);
  const { user } = useAuth();
  const recordCompletion = useRecordCompletion();

  const chessboardRef = useRef<{ clearPremoves: (clearLastPieceColour?: boolean) => void } | null>(null);
  const chessRef = useRef(new Chess());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const wrongResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRecordedRef = useRef(false);
  const prevMoveIndexRef = useRef(0);

  const [position, setPosition] = useState(chessRef.current.fen());
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [status, setStatus] = useState<PracticeStatus>('loading');
  const [wrongMoveFrom, setWrongMoveFrom] = useState<string | null>(null);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [wrongMoveTo, setWrongMoveTo] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState(480);

  // ─── Browse / review navigation ──────────────────────────────────────────────
  // null = live (showing current game position), number = reviewing a past position
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const isLive = viewIndex === null;
  const displayIndex = viewIndex ?? currentMoveIndex;
  const canGoBack = displayIndex > 0;
  const canGoForward = !isLive || displayIndex < currentMoveIndex; // live tail can't go forward

  const moves = variation.moves;
  const isMyTurn = isLive && status === 'playing' && isUserTurn(currentMoveIndex, opening.color);
  const playerColor = opening.color === 'white' ? 'w' : 'b';

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
    const clamped = Math.max(0, Math.min(index, currentMoveIndex));
    setViewIndex(clamped === currentMoveIndex ? null : clamped);
  };

  const updateMoveIndex = (nextIndex: number) => {
    setCurrentMoveIndex(nextIndex);
    onMoveIndexChange?.(nextIndex);
  };

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
    wrongResetRef.current = null;
    hasRecordedRef.current = false;
    chessRef.current = new Chess();
    setPosition(chessRef.current.fen());
    updateMoveIndex(0);
    setStatus('playing');
    setWrongMoveFrom(null);
    setWrongMoveTo(null);
    setSelectedSquare(null);
    setViewIndex(null);
    setOverlayDismissed(false);
    chessboardRef.current?.clearPremoves?.();
  };

  useEffect(() => {
    resetPractice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opening.id, variation.id]);

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
    if (currentMoveIndex > prevMoveIndexRef.current && settings.moveSound) playMoveSound();
    prevMoveIndexRef.current = currentMoveIndex;
  }, [currentMoveIndex, settings.moveSound]);

  useEffect(() => {
    if (status === 'complete' && !hasRecordedRef.current && user) {
      hasRecordedRef.current = true;
      recordCompletion.mutate({ openingSlug: opening.id, variationSlug: variation.id });
    }
  }, [opening.id, recordCompletion, status, user, variation.id]);

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
      setStatus(nextIndex >= moves.length ? 'complete' : 'playing');
      setWrongMoveFrom(null);
      setWrongMoveTo(null);
    }, CPU_REPLY_DELAY_MS);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMoveIndex, moves, opening.color, status]);

  // ─── Derived display values ───────────────────────────────────────────────────

  const statusLabel = useMemo(() => {
    if (!isLive) return `Reviewing move ${displayIndex} / ${currentMoveIndex}`;
    if (status === 'complete') return 'Line complete!';
    if (status === 'wrong') return 'Wrong move — try again';
    return isMyTurn ? `Your turn (${opening.color})` : 'Computer is thinking…';
  }, [isLive, displayIndex, currentMoveIndex, isMyTurn, opening.color, status]);

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

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (isLive && selectedSquare) {
      styles[selectedSquare] = { backgroundColor: '#D8A548' };
    }
    if (lastMove && status !== 'wrong') {
      styles[lastMove.from] = { backgroundColor: 'rgba(255, 210, 0, 0.38)' };
      styles[lastMove.to]   = { backgroundColor: 'rgba(255, 210, 0, 0.38)' };
    }
    if (isLive && status === 'wrong' && wrongMoveFrom && wrongMoveTo) {
      styles[wrongMoveFrom] = { backgroundColor: 'rgba(220, 38, 38, 0.5)' };
      styles[wrongMoveTo]   = { backgroundColor: 'rgba(220, 38, 38, 0.5)' };
    }
    return styles;
  }, [isLive, lastMove, selectedSquare, status, wrongMoveFrom, wrongMoveTo]);

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

  const attemptMove = (sourceSquare: string, targetSquare: string) => {
    const expectedMove = moves[currentMoveIndex];
    if (!expectedMove) return false;

    const nextChess = new Chess(chessRef.current.fen());
    try {
      const move = nextChess.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (move.san !== expectedMove.san) {
        setStatus('wrong');
        setWrongMoveFrom(sourceSquare);
        setWrongMoveTo(targetSquare);
        setSelectedSquare(null);
        resetWrongMove();
        return false;
      }
      chessRef.current = nextChess;
      setPosition(nextChess.fen());
      setSelectedSquare(null);
      const nextIndex = currentMoveIndex + 1;
      updateMoveIndex(nextIndex);
      setWrongMoveFrom(null);
      setWrongMoveTo(null);
      setStatus(nextIndex >= moves.length ? 'complete' : 'playing');
      return true;
    } catch {
      return false;
    }
  };

  const onPieceDrop = (sourceSquare: string, targetSquare: string) => {
    if (!isLive || status !== 'playing') return false;
    if (!isMyTurn) return validatePremove(sourceSquare, targetSquare);
    return attemptMove(sourceSquare, targetSquare);
  };

  const onSquareClick = (square: string) => {
    if (!isLive || status !== 'playing') return;
    const piece = chessRef.current.get(square as Parameters<Chess['get']>[0]);
    const isOwnPiece = piece?.color === playerColor;

    if (!selectedSquare) {
      if (isOwnPiece) setSelectedSquare(square);
      else setSelectedSquare(null);
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

    if (!isMyTurn) return;

    const moved = attemptMove(selectedSquare, square);
    if (!moved) setSelectedSquare(selectedSquare);
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

      {/* Status + progress */}
      <div className="mx-auto w-full shrink-0" style={{ maxWidth: boardSize }}>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className={`${!isLive ? 'text-blue-400' : 'text-gray-400'}`}>{statusLabel}</span>
          <span className="text-gray-500">{currentMoveIndex}/{moves.length} moves</span>
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
            onSquareClick={onSquareClick}
            boardWidth={boardSize}
            boardOrientation={opening.color}
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

        {/* Restart — far left, aligns with board edge */}
        <div>
          <button
            onClick={resetPractice}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-white/20 hover:text-white"
          >
            ↺ Restart
          </button>
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
        <div />

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
