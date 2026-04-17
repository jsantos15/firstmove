'use client';

import type { OpeningVariation } from '@firstmove/core';

interface MoveListProps {
  variation: OpeningVariation;
  currentMoveIndex: number;
}

export function MoveList({ variation, currentMoveIndex }: MoveListProps) {
  const moves = variation.moves;

  // Group into pairs: [[w1, b1], [w2, b2], ...]
  const pairs: { moveNumber: number; white: string; black: string | null; whiteIndex: number; blackIndex: number | null }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i]?.san ?? '',
      black: moves[i + 1]?.san ?? null,
      whiteIndex: i,
      blackIndex: moves[i + 1] ? i + 1 : null,
    });
  }

  return (
    <div className="rounded-xl border border-white/5 bg-[var(--bg-panel)] p-4">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
        Move sequence
      </h3>
      <div className="space-y-0.5 font-mono text-sm">
        {pairs.map(pair => (
          <div key={pair.moveNumber} className="flex items-center gap-1">
            <span className="text-gray-600 w-6 text-right">{pair.moveNumber}.</span>
            <MoveCell san={pair.white} index={pair.whiteIndex} currentIndex={currentMoveIndex} />
            {pair.black !== null && (
              <MoveCell san={pair.black} index={pair.blackIndex!} currentIndex={currentMoveIndex} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveCell({ san, index, currentIndex }: { san: string; index: number; currentIndex: number }) {
  const isDone = index < currentIndex;
  const isCurrent = index === currentIndex;

  return (
    <span
      className={`px-2 py-0.5 rounded min-w-[56px] text-center transition-colors ${
        isCurrent
          ? 'bg-amber-400/20 text-amber-300 font-semibold'
          : isDone
          ? 'text-gray-400'
          : 'text-gray-600'
      }`}
    >
      {san}
    </span>
  );
}
