'use client';

import type { OpeningVariation } from '@firstmove/core';

interface MoveListProps {
  variation: OpeningVariation;
  currentMoveIndex: number;
}

interface MovePair {
  moveNumber: number;
  white: string;
  black: string | null;
  whiteIndex: number;
  blackIndex: number | null;
}

function toPairs(variation: OpeningVariation): MovePair[] {
  const pairs: MovePair[] = [];

  for (let i = 0; i < variation.moves.length; i += 2) {
    pairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: variation.moves[i]?.san ?? '',
      black: variation.moves[i + 1]?.san ?? null,
      whiteIndex: i,
      blackIndex: variation.moves[i + 1] ? i + 1 : null,
    });
  }

  return pairs;
}

function MoveCell({
  san,
  index,
  currentMoveIndex,
}: {
  san: string;
  index: number;
  currentMoveIndex: number;
}) {
  const isDone = index < currentMoveIndex;
  const isCurrent = index === currentMoveIndex;

  return (
    <span
      className={`min-w-[56px] rounded px-2 py-0.5 text-center transition-colors ${
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

export function MoveList({ variation, currentMoveIndex }: MoveListProps) {
  const pairs = toPairs(variation);

  return (
    <div className="flex h-[17.5rem] shrink-0 flex-col rounded-xl border border-white/5 bg-[var(--bg-panel)] p-4">
      <h3 className="mb-3 shrink-0 text-xs font-medium uppercase tracking-wider text-gray-500">
        Move sequence
      </h3>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1 font-mono text-sm">
        {pairs.map(pair => (
          <div key={pair.moveNumber} className="flex items-center gap-1">
            <span className="w-6 text-right text-gray-600">{pair.moveNumber}.</span>
            <MoveCell san={pair.white} index={pair.whiteIndex} currentMoveIndex={currentMoveIndex} />
            {pair.black !== null && pair.blackIndex !== null && (
              <MoveCell san={pair.black} index={pair.blackIndex} currentMoveIndex={currentMoveIndex} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
