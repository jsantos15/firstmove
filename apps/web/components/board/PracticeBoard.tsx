'use client';

import { useEffect, useState, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Opening, OpeningVariation } from '@firstmove/core';
import { usePracticeStore, isUserTurn } from '@/stores/practiceStore';
import { useRecordCompletion } from '@/hooks/useProgress';
import { useAuth } from '@/app/providers';
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
  const playerColor = opening.color === 'white' ? 'w' : 'b';

  // ─── Progress recording ─────────────────────────────────────────────────────
  // Only record once per completion — ref resets when the variation changes.
  const { user } = useAuth();
  const recordCompletion = useRecordCompletion();
  const hasRecordedRef = useRef(false);

  useEffect(() => {
    hasRecordedRef.current = false;
  }, [variation.id]);

  useEffect(() => {
    if (status === 'complete' && !hasRecordedRef.current && user) {
      hasRecordedRef.current = true;
      recordCompletion.mutate({ openingSlug: opening.id, variationSlug: variation.id });
    }
    // recordCompletion.mutate is stable; opening/variation IDs don't change mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user]);

  // ─── Responsive board size ──────────────────────────────────────────────────
  // Ref is on the board-wrapper div (flex-1), so its height already excludes
  // the status bar and controls. min(w, h) gives the largest fitting square.
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

  // ─── Click-to-move state ────────────────────────────────────────────────────
  // Derived-state pattern: track which move/status the selection belongs to,
  // and reset during render (not via effect) when they change.
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [selectionKey, setSelectionKey] = useState(`${currentMoveIndex}-${status}`);

  const currentKey = `${currentMoveIndex}-${status}`;
  if (selectionKey !== currentKey) {
    setSelectionKey(currentKey);
    setSelectedSquare(null);
    setOptionSquares({});
  }

  // ─── Practice lifecycle ─────────────────────────────────────────────────────

  useEffect(() => {
    startPractice(opening, variation);
    // Intentional: only re-run when the opening/variation ID changes, not on
    // every reference change. startPractice is a stable Zustand action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opening.id, variation.id]);

  useEffect(() => {
    if (status !== 'playing') return;
    if (isUserTurn(currentMoveIndex, opening.color)) return;
    if (currentMoveIndex >= moves.length) return;
    const timer = setTimeout(() => advanceComputerMove(), 550);
    return () => clearTimeout(timer);
    // advanceComputerMove is a stable Zustand action; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMoveIndex, status, opening.color, moves.length]);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  // No useCallback — React Compiler handles memoization automatically.

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
      move = chess.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        promotion: 'q',
      });
    } catch {
      return false;
    }
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

  // ─── Square highlights ──────────────────────────────────────────────────────

  const customSquareStyles: Record<string, React.CSSProperties> = { ...optionSquares };

  if (status === 'wrong' && wrongMoveFrom && wrongMoveTo) {
    customSquareStyles[wrongMoveFrom] = { backgroundColor: 'rgba(220, 38, 38, 0.5)' };
    customSquareStyles[wrongMoveTo] = { backgroundColor: 'rgba(220, 38, 38, 0.5)' };
  }

  if (isMyTurn && expectedMove && !selectedSquare) {
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
    <div className="h-full w-full flex flex-col gap-3">

      {/* Status bar — matches board width */}
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

      {/* Board wrapper — takes all remaining height; min(w, h) gives the board size */}
      <div
        ref={boardWrapperRef}
        className="flex-1 min-h-0 w-full flex items-center justify-center"
      >
        <div
          className={`rounded-xl overflow-hidden transition-all duration-150 ${
            status === 'wrong' ? 'ring-2 ring-red-500/60' : 'ring-1 ring-white/10'
          } ${status === 'complete' ? 'ring-2 ring-green-400/60' : ''}`}
        >
          <Chessboard
            position={chess.fen()}
            onPieceDrop={onPieceDrop}
            onSquareClick={onSquareClick}
            boardWidth={boardSize}
            boardOrientation={opening.color}
            arePiecesDraggable={isMyTurn}
            customSquareStyles={customSquareStyles}
            customDarkSquareStyle={{ backgroundColor: '#4a7c59' }}
            customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
            animationDuration={200}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 flex items-center justify-center gap-3">
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
