'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { OpeningVariation } from '@firstmove/core';
import type { OpeningPositionMilestone } from '@/hooks/useOpeningPositionLabels';

interface MoveListProps {
  variation: OpeningVariation;
  currentMoveIndex: number;
  milestones?: OpeningPositionMilestone[];
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
  const isNext = index === currentMoveIndex + 1;

  return (
    <span
      className={`px-2 py-1.5 transition-colors ${
        isNext
          ? 'bg-amber-400/15 text-amber-300 font-semibold'
          : isCurrent
            ? 'bg-white/6 text-white/60'
            : isDone
              ? 'text-gray-500'
              : 'text-gray-600'
      }`}
    >
      {san}
    </span>
  );
}

function buildPgn(variation: OpeningVariation, upToIndex: number): string {
  const moves = variation.moves.slice(0, upToIndex + 1);
  const parts: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) parts.push(`${Math.floor(i / 2) + 1}.`);
    parts.push(moves[i].san);
  }
  return parts.join(' ');
}

function getActiveMilestone(
  milestones: OpeningPositionMilestone[],
  currentMoveIndex: number
) {
  if (currentMoveIndex < 0) {
    return null;
  }

  let active: OpeningPositionMilestone | null = null;
  for (const milestone of milestones) {
    if (milestone.moveIndex <= currentMoveIndex) {
      active = milestone;
    } else {
      break;
    }
  }
  return active;
}

export function MoveList({ variation, currentMoveIndex, milestones = [] }: MoveListProps) {
  const pairs = toPairs(variation);
  const activeMilestone = getActiveMilestone(milestones, currentMoveIndex);
  const [copied, setCopied] = useState(false);
  const nextRowRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    nextRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentMoveIndex]);

  const handleCopy = useCallback(async () => {
    if (currentMoveIndex < 0) return;
    const pgn = buildPgn(variation, currentMoveIndex);
    await navigator.clipboard.writeText(pgn);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [variation, currentMoveIndex]);

  return (
    <div className="flex h-70 shrink-0 flex-col p-4">
      {/* Header + dynamic variation name label */}
      <div className="shrink-0 mb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">Move sequence</h3>
          {currentMoveIndex >= 0 && (
            <button
              type="button"
              onClick={handleCopy}
              title="Copy PGN"
              className="text-gray-600 transition-colors hover:text-gray-400"
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          )}
        </div>
        <div className="mt-1 h-4 overflow-hidden">
          <span
            className={`block text-[11px] font-medium transition-all duration-200 ${
              activeMilestone
                ? 'translate-y-0 opacity-100 text-amber-400/80'
                : 'translate-y-1 opacity-0'
            }`}
          >
            {activeMilestone?.name ?? ''}
          </span>
        </div>
      </div>

      {/* Move rows */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-[1.5rem_4.5rem_4.5rem] gap-y-0.5 font-mono text-sm w-fit">
          {pairs.map(pair => {
            const isNextRow =
              pair.whiteIndex === currentMoveIndex + 1 ||
              pair.blackIndex === currentMoveIndex + 1;
            return (
              <div key={pair.moveNumber} className="contents">
                <span ref={isNextRow ? nextRowRef : undefined} className="flex items-center justify-end pr-1.5 text-[11px] text-gray-600 select-none">
                  {pair.moveNumber}.
                </span>
                <MoveCell san={pair.white} index={pair.whiteIndex} currentMoveIndex={currentMoveIndex} />
                {pair.black !== null && pair.blackIndex !== null ? (
                  <MoveCell san={pair.black} index={pair.blackIndex} currentMoveIndex={currentMoveIndex} />
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
