'use client';

import { useState, use } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PracticeBoard } from '@/components/board/PracticeBoard';
import { useOpening } from '@/hooks/useOpenings';
import { MoveList } from '@/components/board/MoveList';
import { DifficultyBadge, ColorBadge } from '@/components/ui/Badge';
import { UserMenu } from '@/components/ui/UserMenu';
import { useAuth } from '@/app/providers';
import { useAllProgress, MASTERY_LABELS, MASTERY_COLORS } from '@/hooks/useProgress';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PracticePage({ params }: PageProps) {
  const { id } = use(params);
  const { data: opening, isLoading } = useOpening(id);
  const { user } = useAuth();
  const { data: progress } = useAllProgress();
  const [selectedVariationId, setSelectedVariationId] = useState('');
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!opening) notFound();

  const activeVariationId = selectedVariationId || opening.variations[0]?.id;
  const selectedVariation = opening.variations.find(v => v.id === activeVariationId) ?? opening.variations[0];

  function handleVariationClick(variationId: string, index: number) {
    if (index > 0 && !user) {
      setShowAuthPrompt(true);
      return;
    }
    setShowAuthPrompt(false);
    setSelectedVariationId(variationId);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <header className="h-16 shrink-0 border-b border-white/5 bg-[var(--bg-base)]/80 backdrop-blur z-10">
        <div className="mx-auto flex h-full w-full max-w-[1504px] items-center gap-3 px-6">
          <Link href="/openings" className="text-gray-400 hover:text-white transition-colors text-sm">
            ← Openings
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-white font-medium text-sm">{opening.name}</span>
          <div className="ml-auto shrink-0">
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden p-4 lg:p-6">
        <div className="mx-auto flex h-full w-full max-w-[1504px] gap-4 lg:gap-6">

          {/* Board column */}
          <div className="flex h-full min-w-0 flex-1 justify-center">
            <div className="h-full shrink-0" style={{ aspectRatio: '1 / 1' }}>
            {selectedVariation && (
              <PracticeBoard
                opening={opening}
                variation={selectedVariation}
                onMoveIndexChange={setCurrentMoveIndex}
              />
            )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-64 lg:w-72 shrink-0 h-full flex flex-col gap-4">

            {/* Opening info — fixed */}
            <div className="shrink-0 rounded-xl border border-white/5 bg-[var(--bg-panel)] p-5">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <ColorBadge color={opening.color} />
                <DifficultyBadge difficulty={opening.difficulty} />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">{opening.name}</h1>
              <p className="text-sm text-gray-400 leading-relaxed">{opening.description}</p>
            </div>

            {/* Move list — fixed */}
            {selectedVariation && (
              <MoveList variation={selectedVariation} currentMoveIndex={currentMoveIndex} />
            )}

            {/* Line selector — takes remaining height, list scrolls internally */}
            <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-white/5 bg-[var(--bg-panel)]">
              <h3 className="shrink-0 px-4 pt-4 pb-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lines
              </h3>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 flex flex-col gap-1.5">
                {opening.variations.map((variation, index) => {
                  const locked = index > 0 && !user;
                  const vProgress = progress?.get(`${opening.id}/${variation.id}`);
                  const mastery = vProgress?.mastery;
                  return (
                    <button
                      key={variation.id}
                      onClick={() => handleVariationClick(variation.id, index)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        variation.id === activeVariationId
                          ? 'bg-amber-400/15 text-amber-300 border border-amber-400/20'
                          : locked
                          ? 'text-gray-600 cursor-pointer hover:bg-white/5'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{variation.name}</span>
                        {locked ? (
                          <span className="text-xs shrink-0">🔒</span>
                        ) : mastery && mastery !== 'new' ? (
                          <span className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                            <span className={`w-1.5 h-1.5 rounded-full ${MASTERY_COLORS[mastery]}`} />
                            {MASTERY_LABELS[mastery]}
                          </span>
                        ) : null}
                      </div>
                      {variation.description && (
                        <div className="text-xs opacity-60 mt-0.5 line-clamp-2">{variation.description}</div>
                      )}
                      {vProgress && (
                        <div className="text-xs text-gray-600 mt-1">
                          {vProgress.timesCompleted} {vProgress.timesCompleted === 1 ? 'completion' : 'completions'}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {showAuthPrompt && (
                <div className="shrink-0 mx-4 mb-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-300">
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

          </div>{/* end sidebar */}

        </div>
      </div>

    </div>
  );
}
