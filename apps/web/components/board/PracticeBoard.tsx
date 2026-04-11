'use client';

import { useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Opening, OpeningVariation } from '@firstmove/core';
import { usePracticeStore, isUserTurn } from '@/stores/practiceStore';
import type { Square } from 'chess.js';

interface PracticeBoardProps {
  opening: Opening;
  variation: OpeningVariation;
}

export function PracticeBoard({ opening, variation }: PracticeBoardProps) {
  const {
    chess,
    currentMoveIndex,
    status,
    wrongMoveFrom,
    wrongMoveTo,
    startPractice,
    attemptMove,
    advanceComputerMove,
    restart,
  } = usePracticeStore();

  const moves = variation.moves;
  const expectedMove = moves[currentMoveIndex];
  const isMyTurn = status === 'playing' && isUserTurn(currentMoveIndex, opening.color);

  // Start / restart when opening or variation changes
  useEffect(() => {
    startPractice(opening, variation);
  }, [opening.id, variation.id]);

  // Trigger computer move after a short delay when it's the computer's turn
  useEffect(() => {
    if (status !== 'playing') return;
    if (isUserTurn(currentMoveIndex, opening.color)) return;
    if (currentMoveIndex >= moves.length) return;

    const timer = setTimeout(() => advanceComputerMove(), 550);
    return () => clearTimeout(timer);
  }, [currentMoveIndex, status]);

  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string) => {
      if (!isMyTurn) return false;

      // Attempt the move in chess.js to get the SAN
      const move = chess.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        promotion: 'q',
      });

      if (!move) return false; // illegal move

      const accepted = attemptMove(sourceSquare, targetSquare, move.san);
      if (!accepted) return false; // wrong move — store already undid it

      return true;
    },
    [chess, isMyTurn, attemptMove]
  );

  // Highlight squares
  const customSquareStyles: Record<string, React.CSSProperties> = {};

  if (status === 'wrong' && wrongMoveFrom && wrongMoveTo) {
    customSquareStyles[wrongMoveFrom] = { backgroundColor: 'rgba(220, 38, 38, 0.5)' };
    customSquareStyles[wrongMoveTo] = { backgroundColor: 'rgba(220, 38, 38, 0.5)' };
  }

  // Subtle hint: highlight the expected from-square on user's turn
  if (isMyTurn && expectedMove) {
    const fromSquare = getFromSquare(chess.fen(), expectedMove.san);
    if (fromSquare) {
      customSquareStyles[fromSquare] = {
        ...(customSquareStyles[fromSquare] ?? {}),
        boxShadow: 'inset 0 0 0 3px rgba(251, 191, 36, 0.3)',
      };
    }
  }

  const progressPct = moves.length > 0 ? (currentMoveIndex / moves.length) * 100 : 0;

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Status bar */}
      <div className="w-full max-w-[480px]">
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
          <span className="text-gray-500">
            {currentMoveIndex}/{moves.length} moves
          </span>
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
      <div
        className={`rounded-xl overflow-hidden transition-all duration-150 ${
          status === 'wrong' ? 'ring-2 ring-red-500/60' : 'ring-1 ring-white/10'
        } ${status === 'complete' ? 'ring-2 ring-green-400/60' : ''}`}
      >
        <Chessboard
          position={chess.fen()}
          onPieceDrop={onPieceDrop}
          boardWidth={480}
          boardOrientation={opening.color}
          arePiecesDraggable={isMyTurn}
          customSquareStyles={customSquareStyles}
          customDarkSquareStyle={{ backgroundColor: '#4a7c59' }}
          customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
          animationDuration={200}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {status === 'complete' ? (
          <button
            onClick={restart}
            className="flex items-center gap-2 rounded-lg bg-green-500/20 border border-green-500/30 px-5 py-2.5 text-sm font-medium text-green-400 hover:bg-green-500/30 transition-colors"
          >
            ↺ Practice again
          </button>
        ) : (
          <button
            onClick={restart}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors"
          >
            ↺ Restart
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { Chess } from 'chess.js';

/** Given a FEN and SAN, finds which square the piece moves from. */
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
