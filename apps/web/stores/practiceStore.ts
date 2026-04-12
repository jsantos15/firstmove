import { create } from 'zustand';
import { Chess } from 'chess.js';
import type { Opening, OpeningVariation } from '@firstmove/core';

export type PracticeStatus = 'idle' | 'playing' | 'wrong' | 'complete';

interface PracticeState {
  opening: Opening | null;
  variation: OpeningVariation | null;
  chess: Chess;
  currentMoveIndex: number;
  status: PracticeStatus;
  wrongMoveFrom: string | null;
  wrongMoveTo: string | null;

  // Actions
  startPractice: (opening: Opening, variation: OpeningVariation) => void;
  attemptMove: (from: string, to: string, san: string) => boolean;
  advanceComputerMove: () => void;
  restart: () => void;
}

/** Returns true if the move at this index should be played by the user. */
function isUserTurn(moveIndex: number, openingColor: 'white' | 'black'): boolean {
  // White opening: user plays white's moves (index 0, 2, 4…)
  // Black opening: user plays black's moves (index 1, 3, 5…)
  return openingColor === 'white' ? moveIndex % 2 === 0 : moveIndex % 2 === 1;
}

export const usePracticeStore = create<PracticeState>((set, get) => ({
  opening: null,
  variation: null,
  chess: new Chess(),
  currentMoveIndex: 0,
  status: 'idle',
  wrongMoveFrom: null,
  wrongMoveTo: null,

  startPractice: (opening, variation) => {
    set({
      opening,
      variation,
      chess: new Chess(),
      currentMoveIndex: 0,
      status: 'playing',
      wrongMoveFrom: null,
      wrongMoveTo: null,
    });
  },

  attemptMove: (from, to, san) => {
    const { opening, variation, chess, currentMoveIndex } = get();
    if (!opening || !variation) return false;

    const moves = variation.moves;
    if (currentMoveIndex >= moves.length) return false;
    if (!isUserTurn(currentMoveIndex, opening.color)) return false;

    const expected = moves[currentMoveIndex];
    const isCorrect = san === expected.san;

    if (isCorrect) {
      const nextIndex = currentMoveIndex + 1;
      const isComplete = nextIndex >= moves.length;
      set({
        currentMoveIndex: nextIndex,
        status: isComplete ? 'complete' : 'playing',
        wrongMoveFrom: null,
        wrongMoveTo: null,
      });
      return true;
    } else {
      // Undo the incorrect move from chess.js
      chess.undo();
      set({ status: 'wrong', wrongMoveFrom: from, wrongMoveTo: to });
      setTimeout(() => set({ status: 'playing', wrongMoveFrom: null, wrongMoveTo: null }), 900);
      return false;
    }
  },

  advanceComputerMove: () => {
    const { opening, variation, chess, currentMoveIndex, status } = get();
    if (!opening || !variation || status !== 'playing') return;

    const moves = variation.moves;
    if (currentMoveIndex >= moves.length) return;
    if (isUserTurn(currentMoveIndex, opening.color)) return;

    const move = moves[currentMoveIndex];
    chess.move(move.san);

    const nextIndex = currentMoveIndex + 1;
    const isComplete = nextIndex >= moves.length;

    set({
      currentMoveIndex: nextIndex,
      status: isComplete ? 'complete' : 'playing',
    });
  },

  restart: () => {
    const { opening, variation } = get();
    if (!opening || !variation) return;
    set({
      chess: new Chess(),
      currentMoveIndex: 0,
      status: 'playing',
      wrongMoveFrom: null,
      wrongMoveTo: null,
    });
  },
}));

export { isUserTurn };
