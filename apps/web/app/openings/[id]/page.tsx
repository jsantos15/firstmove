'use client';

import { useState, use } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getOpeningById } from '@firstmove/core';
import { PracticeBoard } from '@/components/board/PracticeBoard';
import { MoveList } from '@/components/board/MoveList';
import { DifficultyBadge, ColorBadge, Badge } from '@/components/ui/Badge';
import { usePracticeStore } from '@/stores/practiceStore';
import { UserMenu } from '@/components/ui/UserMenu';
import { useAuth } from '@/app/providers';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PracticePage({ params }: PageProps) {
  const { id } = use(params);
  const opening = getOpeningById(id);

  if (!opening) notFound();

  const { user } = useAuth();
  const [selectedVariationId, setSelectedVariationId] = useState(opening.variations[0]?.id ?? '');
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const selectedVariation = opening.variations.find(v => v.id === selectedVariationId) ?? opening.variations[0];
  const { currentMoveIndex } = usePracticeStore();

  function handleVariationClick(variationId: string, index: number) {
    if (index > 0 && !user) {
      setShowAuthPrompt(true);
      return;
    }
    setShowAuthPrompt(false);
    setSelectedVariationId(variationId);
  }

  return (
    // h-screen + flex-col so content below the header fills the remaining
    // viewport height — required for the responsive board sizing to work.
    <div className="h-screen flex flex-col bg-[#0f1117] overflow-hidden">

      {/* Header */}
      <header className="shrink-0 border-b border-white/5 bg-[#0f1117]/80 backdrop-blur z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/openings" className="text-gray-400 hover:text-white transition-colors text-sm">
              ← Library
            </Link>
            <span className="text-white/20">/</span>
            <span className="text-white font-medium text-sm">{opening.name}</span>
          </div>
          <UserMenu />
        </div>
      </header>

      {/* Content: board + sidebar centred together so the sidebar sits flush
          against the board rather than pinned to the far-right edge. */}
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden p-4 lg:p-6">
        <div className="h-full flex gap-4 lg:gap-6 w-fit max-w-full">

          {/* Board column — square, height-driven */}
          <div className="h-full shrink-0" style={{ aspectRatio: '1 / 1' }}>
            {selectedVariation && (
              <PracticeBoard opening={opening} variation={selectedVariation} />
            )}
          </div>

          {/* Sidebar — adjacent to board, independently scrollable */}
          <div className="w-64 lg:w-72 shrink-0 h-full flex flex-col gap-4 overflow-y-auto">

            {/* Opening info */}
            <div className="rounded-xl border border-white/5 bg-[#1a1d27] p-5">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <Badge variant="eco">{opening.ecoCode}</Badge>
                <ColorBadge color={opening.color} />
                <DifficultyBadge difficulty={opening.difficulty} />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">{opening.name}</h1>
              <p className="text-sm text-gray-400 leading-relaxed">{opening.description}</p>
            </div>

            {/* Line selector */}
            <div className="rounded-xl border border-white/5 bg-[#1a1d27] p-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Lines
              </h3>
              <div className="flex flex-col gap-1.5">
                {opening.variations.map((variation, index) => {
                  const locked = index > 0 && !user;
                  return (
                    <button
                      key={variation.id}
                      onClick={() => handleVariationClick(variation.id, index)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        variation.id === selectedVariationId
                          ? 'bg-amber-400/15 text-amber-300 border border-amber-400/20'
                          : locked
                          ? 'text-gray-600 cursor-pointer hover:bg-white/5'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{variation.name}</span>
                        {locked && <span className="text-xs shrink-0">🔒</span>}
                      </div>
                      {variation.description && (
                        <div className="text-xs opacity-60 mt-0.5 line-clamp-2">{variation.description}</div>
                      )}
                    </button>
                  );
                })}
              </div>

              {showAuthPrompt && (
                <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-300">
                  <p className="mb-2">Sign in to unlock all lines.</p>
                  <Link
                    href="/login"
                    className="inline-block rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#0f1117] hover:bg-amber-300 transition-colors"
                  >
                    Sign in
                  </Link>
                </div>
              )}
            </div>

            {/* Move list */}
            {selectedVariation && (
              <MoveList variation={selectedVariation} currentMoveIndex={currentMoveIndex} />
            )}

          </div>
          {/* end sidebar */}

        </div>
        {/* end board + sidebar group */}

      </div>
      {/* end content */}

    </div>
    // end root
  );
}
