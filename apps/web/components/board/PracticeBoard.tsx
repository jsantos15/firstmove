'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Opening, OpeningVariation } from '@firstmove/core';
import { usePracticeStore, isUserTurn } from '@/stores/practiceStore';
import { useRecordCompletion } from '@/hooks/useProgress';
import { useAuth } from '@/app/providers';
import { CompletionOverlay } from './CompletionOverlay';
import { useBoardSettings } from '@/hooks/useBoardSettings';
import { getCustomPieces } from '@/lib/piecesets';
import type { Square } from 'chess.js';

interface PracticeBoardProps {
  opening: Opening;
  variation: OpeningVariation;
}

export function PracticeBoard({ opening, variation }: PracticeBoardProps) {
  const chess           = usePracticeStore(s => s.chess);
  const currentMoveIndex = usePracticeStore(s => s.currentMoveIndex);
  const status          = usePracticeStore(s => s.status);
  const wrongMoveFrom   = usePracticeStore(s => s.wrongMoveFrom);
  const wrongMoveTo     = usePracticeStore(s => s.wrongMoveTo);
  const startPractice   = usePracticeStore(s => s.startPractice);
  const attemptMove     = usePracticeStore(s => s.attemptMove);
  const advanceComputerMove = usePracticeStore(s => s.advanceComputerMove);
  const restart         = usePracticeStore(s => s.restart);

  const moves        = variation.moves;
  const expectedMove = moves[currentMoveIndex];
  const isMyTurn     = status === 'playing' && isUserTurn(currentMoveIndex, opening.color);
  const playerColor  = opening.color === 'white' ? 'w' : 'b';

  // ─── Board settings ──────────────────────────────────────────────────────────
  const { theme, animationDuration: settingsAnimDuration, settings } = useBoardSettings();
  const customPieces     = useMemo(() => getCustomPieces(settings.pieceSetId), [settings.pieceSetId]);
  const darkSquareStyle  = useMemo(() => ({ backgroundColor: theme.dark }),  [theme.dark]);
  const lightSquareStyle = useMemo(() => ({ backgroundColor: theme.light }), [theme.light]);

  // ─── Progress recording ─────────────────────────────────────────────────────
  const { user } = useAuth();
  const recordCompletion = useRecordCompletion();
  const hasRecordedRef = useRef(false);

  useEffect(() => { hasRecordedRef.current = false; }, [variation.id]);

  useEffect(() => {
    if (status === 'complete' && !hasRecordedRef.current && user) {
      hasRecordedRef.current = true;
      recordCompletion.mutate({ openingSlug: opening.id, variationSlug: variation.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user]);

  // ─── Responsive board size ───────────────────────────────────────────────────
  const boardWrapperRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(480);

  useEffect(() => {
    const el = boardWrapperRef.current;
    if (!el) return;
    const update = () => {
      const size = Math.min(el.clientWidth, el.clientHeight);
      if (size > 0) setBoardSize(size);
    };
    const obs = new ResizeObserver(update);
    obs.observe(el);
    update();
    return () => obs.disconnect();
  }, []);

  // ─── Click-to-move state ─────────────────────────────────────────────────────
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares]   = useState<Record<string, React.CSSProperties>>({});

  // Reset selection when move index or status changes (effect, not during render)
  useEffect(() => {
    setSelectedSquare(null);
    setOptionSquares({});
  }, [currentMoveIndex, status]);

  const computerReplyDelay = 300;

  // ─── Move sound ──────────────────────────────────────────────────────────────
  const prevMoveIndexRef = useRef(currentMoveIndex);
  useEffect(() => {
    if (currentMoveIndex > prevMoveIndexRef.current && settings.moveSound) playMoveSound();
    prevMoveIndexRef.current = currentMoveIndex;
  }, [currentMoveIndex, settings.moveSound]);

  // ─── Practice lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    startPractice(opening, variation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opening.id, variation.id]);

  useEffect(() => {
    if (status !== 'playing') return;
    if (isUserTurn(currentMoveIndex, opening.color)) return;
    if (currentMoveIndex >= moves.length) return;
    const timer = setTimeout(() => advanceComputerMove(), computerReplyDelay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMoveIndex, status, opening.color, moves.length, computerReplyDelay]);

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function buildOptionSquares(square: Square): Record<string, React.CSSProperties> {
    const legalMoves = chess.moves({ square, verbose: true });
    const dots: Record<string, React.CSSProperties> = {
      [square]: { background: 'rgba(251, 191, 36, 0.4)' },
    };
    legalMoves.forEach(m => {
      dots[m.to] = {
        background: chess.get(m.to)
          ? 'radial-gradient(circle, rgba(0,0,0,.35) 82%, transparent 82%)'
          : 'radial-gradient(circle, rgba(0,0,0,.18) 25%, transparent 25%)',
        borderRadius: '50%',
      };
    });
    return dots;
  }

  function onPieceDrop(sourceSquare: string, targetSquare: string): boolean {
    if (!isMyTurn) return false;
    let move;
    try {
      move = chess.move({ from: sourceSquare as Square, to: targetSquare as Square, promotion: 'q' });
    } catch { return false; }
    return attemptMove(sourceSquare, targetSquare, move.san);
  }

  function onSquareClick(square: Square) {
    if (!isMyTurn) return;
    if (!selectedSquare) {
      const piece = chess.get(square);
      if (!piece || piece.color !== playerColor) return;
      setSelectedSquare(square);
      setOptionSquares(buildOptionSquares(square));
      return;
    }
    if (square === selectedSquare) {
      setSelectedSquare(null);
      setOptionSquares({});
      return;
    }
    const piece = chess.get(square);
    if (piece && piece.color === playerColor) {
      setSelectedSquare(square);
      setOptionSquares(buildOptionSquares(square));
      return;
    }
    let move;
    try {
      move = chess.move({ from: selectedSquare, to: square, promotion: 'q' });
    } catch {
      setSelectedSquare(null);
      setOptionSquares({});
      return;
    }
    setSelectedSquare(null);
    setOptionSquares({});
    attemptMove(selectedSquare, square, move.san);
  }

  // ─── Hint square ─────────────────────────────────────────────────────────────
  const hintFromSquare = useMemo(() => {
    if (!isMyTurn || !expectedMove || selectedSquare) return null;
    return getFromSquare(chess.fen(), expectedMove.san);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, expectedMove?.san, selectedSquare, currentMoveIndex]);

  // ─── Square highlights ───────────────────────────────────────────────────────
  const lastMove = useMemo(() => {
    const h = chess.history({ verbose: true });
    return h[h.length - 1];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMoveIndex]);

  const customSquareStyles: Record<string, React.CSSProperties> = {};

  if (lastMove && status !== 'wrong') {
    customSquareStyles[lastMove.from] = { backgroundColor: 'rgba(255, 210, 0, 0.38)' };
    customSquareStyles[lastMove.to]   = { backgroundColor: 'rgba(255, 210, 0, 0.38)' };
  }

  Object.assign(customSquareStyles, optionSquares);

  if (status === 'wrong' && wrongMoveFrom && wrongMoveTo) {
    customSquareStyles[wrongMoveFrom] = { backgroundColor: 'rgba(220, 38, 38, 0.5)' };
    customSquareStyles[wrongMoveTo]   = { backgroundColor: 'rgba(220, 38, 38, 0.5)' };
  }

  if (isMyTurn && hintFromSquare && !selectedSquare) {
    customSquareStyles[hintFromSquare] = {
      ...(customSquareStyles[hintFromSquare] ?? {}),
      boxShadow: 'inset 0 0 0 3px rgba(251, 191, 36, 0.3)',
    };
  }

  const progressPct = moves.length > 0 ? (currentMoveIndex / moves.length) * 100 : 0;

  return (
    <div className="relative h-full w-full flex flex-col gap-3">

      {/* Status bar */}
      <div className="shrink-0 mx-auto w-full" style={{ maxWidth: boardSize }}>
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="text-gray-400">
            {status === 'complete'
              ? '✓ Line complete!'
              : status === 'wrong'
              ? '✗ Wrong move — try again'
              : isMyTurn
              ? `Your turn (${opening.color})`
              : 'Computer is thinking…'}
          </span>
          <span className="text-gray-500">{currentMoveIndex}/{moves.length} moves</span>
        </div>
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              status === 'complete' ? 'bg-green-400' : 'bg-amber-400'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Board */}
      <div ref={boardWrapperRef} className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div className={`rounded-xl overflow-hidden transition-all duration-150 ${
          status === 'wrong' ? 'ring-2 ring-red-500/60' : 'ring-1 ring-white/10'
        } ${status === 'complete' ? 'ring-2 ring-green-400/60' : ''}`}>
          <Chessboard
            position={chess.fen()}
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
            customDarkSquareStyle={darkSquareStyle}
            customLightSquareStyle={lightSquareStyle}
            animationDuration={settingsAnimDuration}
            customPieces={customPieces}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 flex items-center justify-center gap-3">
        <button
          onClick={restart}
          className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors"
        >
          ↺ Restart
        </button>
      </div>

      {status === 'complete' && (
        <CompletionOverlay
          variationName={variation.name}
          moveCount={moves.length}
          onPracticeAgain={restart}
        />
      )}

    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';

let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === 'closed') _audioCtx = new AudioContext();
  return _audioCtx;
}

function playMoveSound() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
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

function getFromSquare(fen: string, san: string): string | null {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    const match = moves.find(m => m.san === san);
    return match?.from ?? null;
  } catch {
    return null;
  }
}
