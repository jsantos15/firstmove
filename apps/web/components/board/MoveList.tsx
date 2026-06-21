'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { OpeningVariation } from '@firstmove/core';
import type { OpeningPositionMilestone } from '@/hooks/useOpeningPositionLabels';

interface MoveListProps {
  variation: OpeningVariation;
  currentMoveIndex: number;
  selectedMoveIndex?: number;
  onNavigate?: (index: number) => void;
  milestones?: OpeningPositionMilestone[];
  mode?: 'learn' | 'practice';
  anchorPly?: number;
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
  selectedMoveIndex,
  onNavigate,
  mode,
  isAnchor,
}: {
  san: string;
  index: number;
  currentMoveIndex: number;
  selectedMoveIndex?: number;
  onNavigate?: (index: number) => void;
  mode?: 'learn' | 'practice';
  isAnchor?: boolean;
}) {
  const isSelected = index === (selectedMoveIndex ?? currentMoveIndex);
  const isPlayed = index <= currentMoveIndex;

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(index)}
      className={`w-full px-2 py-1.5 text-left font-mono text-sm transition-colors ${
        isSelected
          ? 'bg-white/20 text-white font-semibold'
          : isAnchor
            ? 'text-gray-600 hover:bg-white/5 hover:text-gray-400'
            : isPlayed || mode === 'learn'
              ? 'text-gray-300 hover:bg-white/10 hover:text-white'
              : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
      }`}
    >
      {san}
    </button>
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

export function MoveList({ variation, currentMoveIndex, selectedMoveIndex, onNavigate, milestones = [], mode, anchorPly }: MoveListProps) {
  const pairs = toPairs(variation);
  const activeMilestone = getActiveMilestone(milestones, currentMoveIndex);
  const [copied, setCopied] = useState(false);
  const selectedRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedMoveIndex ?? currentMoveIndex]);

  const handleCopy = useCallback(async () => {
    if (currentMoveIndex < 0) return;
    const pgn = buildPgn(variation, currentMoveIndex);
    await navigator.clipboard.writeText(pgn);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [variation, currentMoveIndex]);

  const activeIndex = selectedMoveIndex ?? currentMoveIndex;

  // Whether anchorPly splits a pair (white=anchor, black=first continuation)
  const splitPairExists = anchorPly != null &&
    pairs.some(p => p.whiteIndex < anchorPly && p.blackIndex != null && p.blackIndex >= anchorPly);

  // Index of the first pair where white itself is the first continuation move.
  // Only used when there is no split pair (split pair renders its own divider).
  const firstContinuationPairIdx = !splitPairExists && anchorPly != null
    ? pairs.findIndex(p => p.whiteIndex >= anchorPly)
    : -1;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/8">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Moves</h3>
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

      {/* Milestone label — pinned above scroll area, never wraps */}
      <div className="shrink-0 h-6 flex items-center overflow-hidden px-4">
        <span
          className={`block truncate text-[11px] font-medium transition-all duration-200 ${
            activeMilestone
              ? 'translate-y-0 opacity-100 text-amber-400/80'
              : 'translate-y-1 opacity-0'
          }`}
        >
          {activeMilestone?.name ?? ''}
        </span>
      </div>

      {/* Move rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[2.5rem_1fr_1fr] text-sm">
          {pairs.map((pair, i) => {
            const whiteIsAnchor = anchorPly != null && pair.whiteIndex < anchorPly;
            const blackIsAnchor = anchorPly != null && pair.blackIndex != null && pair.blackIndex < anchorPly;
            const showDivider = firstContinuationPairIdx !== -1 && i === firstContinuationPairIdx;

            // Split pair: white is anchor but black is the first continuation move.
            // Render: [anchor half] → [divider] → [continuation half]
            const isSplitPair =
              anchorPly != null &&
              pair.whiteIndex < anchorPly &&
              pair.blackIndex != null &&
              pair.blackIndex >= anchorPly;

            if (isSplitPair && pair.black !== null && pair.blackIndex !== null) {
              const dividerEl = (
                <div className="col-span-3 flex items-center gap-2 px-3 py-1.5">
                  <div className="h-px flex-1 bg-white/[0.07]" />
                  <span className="text-[9px] uppercase tracking-widest text-gray-700">Continuation</span>
                  <div className="h-px flex-1 bg-white/[0.07]" />
                </div>
              );
              return (
                <div key={pair.moveNumber} className="contents">
                  {/* Anchor half: move# + white move + blank black slot */}
                  <span
                    ref={pair.whiteIndex === activeIndex ? selectedRowRef : undefined}
                    className="flex items-center justify-center text-[11px] text-gray-600 select-none font-mono"
                  >
                    {pair.moveNumber}
                  </span>
                  <MoveCell
                    san={pair.white}
                    index={pair.whiteIndex}
                    currentMoveIndex={currentMoveIndex}
                    selectedMoveIndex={selectedMoveIndex}
                    onNavigate={onNavigate}
                    mode={mode}
                    isAnchor
                  />
                  <span />

                  {dividerEl}

                  {/* Continuation half: move# + blank white slot + black move */}
                  <span
                    ref={pair.blackIndex === activeIndex ? selectedRowRef : undefined}
                    className="flex items-center justify-center text-[11px] text-gray-600 select-none font-mono"
                  >
                    {pair.moveNumber}
                  </span>
                  <span />
                  <MoveCell
                    san={pair.black}
                    index={pair.blackIndex}
                    currentMoveIndex={currentMoveIndex}
                    selectedMoveIndex={selectedMoveIndex}
                    onNavigate={onNavigate}
                    mode={mode}
                    isAnchor={false}
                  />
                </div>
              );
            }

            const isSelectedRow =
              pair.whiteIndex === activeIndex || pair.blackIndex === activeIndex;

            return (
              <div key={pair.moveNumber} className="contents">
                {showDivider && (
                  <div className="col-span-3 flex items-center gap-2 px-3 py-1.5">
                    <div className="h-px flex-1 bg-white/[0.07]" />
                    <span className="text-[9px] uppercase tracking-widest text-gray-700">Continuation</span>
                    <div className="h-px flex-1 bg-white/[0.07]" />
                  </div>
                )}
                <span ref={isSelectedRow ? selectedRowRef : undefined} className="flex items-center justify-center text-[11px] text-gray-600 select-none font-mono">
                  {pair.moveNumber}
                </span>
                <MoveCell
                  san={pair.white}
                  index={pair.whiteIndex}
                  currentMoveIndex={currentMoveIndex}
                  selectedMoveIndex={selectedMoveIndex}
                  onNavigate={onNavigate}
                  mode={mode}
                  isAnchor={whiteIsAnchor}
                />
                {pair.black !== null && pair.blackIndex !== null ? (
                  <MoveCell
                    san={pair.black}
                    index={pair.blackIndex}
                    currentMoveIndex={currentMoveIndex}
                    selectedMoveIndex={selectedMoveIndex}
                    onNavigate={onNavigate}
                    mode={mode}
                    isAnchor={blackIsAnchor}
                  />
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
