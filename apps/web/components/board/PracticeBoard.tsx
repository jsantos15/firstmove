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
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
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

function getLastMove(chess: Chess) {
  const history = chess.history({ verbose: true });
  return history[history.length - 1] ?? null;
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
  const [wrongMoveTo, setWrongMoveTo] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState(480);

  const moves = variation.moves;
  const isMyTurn = status === 'playing' && isUserTurn(currentMoveIndex, opening.color);
  const playerColor = opening.color === 'white' ? 'w' : 'b';

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
    chessboardRef.current?.clearPremoves?.();
  };

  useEffect(() => {
    resetPractice();
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
    if (currentMoveIndex > prevMoveIndexRef.current && settings.moveSound) {
      playMoveSound();
    }
    prevMoveIndexRef.current = currentMoveIndex;
  }, [currentMoveIndex, settings.moveSound]);

  useEffect(() => {
    if (status === 'complete' && !hasRecordedRef.current && user) {
      hasRecordedRef.current = true;
      recordCompletion.mutate({ openingSlug: opening.id, variationSlug: variation.id });
    }
  }, [opening.id, recordCompletion, status, user, variation.id]);

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

      chessRef.current = nextChess;
      setPosition(nextChess.fen());
      const nextIndex = currentMoveIndex + 1;
      updateMoveIndex(nextIndex);
      setStatus(nextIndex >= moves.length ? 'complete' : 'playing');
      setWrongMoveFrom(null);
      setWrongMoveTo(null);
    }, CPU_REPLY_DELAY_MS);

    return () => clearTimeout(timer);
  }, [currentMoveIndex, moves, opening.color, status]);

  const statusLabel = useMemo(() => {
    if (status === 'complete') return 'Line complete!';
    if (status === 'wrong') return 'Wrong move - try again';
    return isMyTurn ? `Your turn (${opening.color})` : 'Computer is thinking...';
  }, [isMyTurn, opening.color, status]);

  const lastMove = useMemo(() => getLastMove(chessRef.current), [position]);
  const progressPct = moves.length > 0 ? (currentMoveIndex / moves.length) * 100 : 0;

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    if (selectedSquare) {
      styles[selectedSquare] = {
        backgroundColor: '#D8A548',
      };
    }

    if (lastMove && status !== 'wrong') {
      styles[lastMove.from] = { backgroundColor: 'rgba(255, 210, 0, 0.38)' };
      styles[lastMove.to] = { backgroundColor: 'rgba(255, 210, 0, 0.38)' };
    }

    if (status === 'wrong' && wrongMoveFrom && wrongMoveTo) {
      styles[wrongMoveFrom] = { backgroundColor: 'rgba(220, 38, 38, 0.5)' };
      styles[wrongMoveTo] = { backgroundColor: 'rgba(220, 38, 38, 0.5)' };
    }

    return styles;
  }, [lastMove, selectedSquare, status, wrongMoveFrom, wrongMoveTo]);

  const validatePremove = (sourceSquare: string, targetSquare: string) => {
    const opponentReply = moves[currentMoveIndex];
    const expectedFollowUp = moves[currentMoveIndex + 1];
    if (!opponentReply || !expectedFollowUp) return false;

    const afterReply = new Chess(chessRef.current.fen());

    try {
      afterReply.move(opponentReply.san);
      const queuedMove = afterReply.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      return queuedMove.san === expectedFollowUp.san;
    } catch {
      return false;
    }
  };

  const onPieceDrop = (sourceSquare: string, targetSquare: string) => {
    if (status !== 'playing') return false;

    if (!isMyTurn) {
      return validatePremove(sourceSquare, targetSquare);
    }

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

  const onSquareClick = (square: string) => {
    if (status !== 'playing') return;

    const piece = chessRef.current.get(square as Parameters<Chess['get']>[0]);
    if (!piece || piece.color !== playerColor) {
      setSelectedSquare(null);
      return;
    }

    setSelectedSquare(current => (current === square ? null : square));
  };

  return (
    <div className="relative flex h-full w-full flex-col gap-3">
      <div className="mx-auto w-full shrink-0" style={{ maxWidth: boardSize }}>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-gray-400">{statusLabel}</span>
          <span className="text-gray-500">
            {currentMoveIndex}/{moves.length} moves
          </span>
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

      <div ref={wrapperRef} className="flex min-h-0 flex-1 items-center justify-center">
        <div
          className={`overflow-hidden rounded-xl transition-all duration-150 ${
            status === 'wrong' ? 'ring-2 ring-red-500/60' : 'ring-1 ring-white/10'
          } ${status === 'complete' ? 'ring-2 ring-green-400/60' : ''}`}
        >
          <Chessboard
            ref={chessboardRef}
            position={position}
            onPieceDrop={onPieceDrop}
            onSquareClick={onSquareClick}
            boardWidth={boardSize}
            boardOrientation={opening.color}
            arePiecesDraggable={true}
            arePremovesAllowed={true}
            clearPremovesOnRightClick={true}
            isDraggablePiece={({ piece }) => piece[0] === playerColor}
            customSquareStyles={customSquareStyles}
            showBoardNotation={settings.showCoordinates}
            customDarkSquareStyle={{ backgroundColor: theme.dark }}
            customLightSquareStyle={{ backgroundColor: theme.light }}
            animationDuration={animationDuration}
            customPieces={customPieces}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3">
        <button
          onClick={resetPractice}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-white/20 hover:text-white"
        >
          Restart
        </button>
      </div>

      {status === 'complete' && (
        <CompletionOverlay
          variationName={variation.name}
          moveCount={moves.length}
          onPracticeAgain={resetPractice}
        />
      )}
    </div>
  );
}
