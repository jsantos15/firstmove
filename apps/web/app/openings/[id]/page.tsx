'use client';

import { useState, use } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getOpeningById } from '@firstmove/core';
import { PracticeBoard } from '@/components/board/PracticeBoard';
import { MoveList } from '@/components/board/MoveList';
import { DifficultyBadge, ColorBadge, Badge } from '@/components/ui/Badge';
import { usePracticeStore } from '@/stores/practiceStore';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PracticePage({ params }: PageProps) {
  const { id } = use(params);
  const opening = getOpeningById(id);

  if (!opening) notFound();

  const [selectedVariationId, setSelectedVariationId] = useState(opening.variations[0]?.id ?? '');
  const selectedVariation = opening.variations.find(v => v.id === selectedVariationId) ?? opening.variations[0];
  const { currentMoveIndex } = usePracticeStore();

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#0f1117]/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/openings" className="text-gray-400 hover:text-white transition-colors text-sm">
              ← Library
            </Link>
            <span className="text-white/20">/</span>
            <span className="text-white font-medium text-sm">{opening.name}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Left — Board */}
          <div className="flex flex-col items-center gap-6 flex-1">
            {selectedVariation && (
              <PracticeBoard opening={opening} variation={selectedVariation} />
            )}
          </div>

          {/* Right — Sidebar */}
          <div className="w-full lg:w-72 flex flex-col gap-5">

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
                {opening.variations.map(variation => (
                  <button
                    key={variation.id}
                    onClick={() => setSelectedVariationId(variation.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      variation.id === selectedVariationId
                        ? 'bg-amber-400/15 text-amber-300 border border-amber-400/20'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="font-medium">{variation.name}</div>
                    {variation.description && (
                      <div className="text-xs opacity-60 mt-0.5 line-clamp-2">{variation.description}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Move list */}
            {selectedVariation && (
              <MoveList variation={selectedVariation} currentMoveIndex={currentMoveIndex} />
            )}

            {/* How to play */}
            <div className="rounded-xl border border-white/5 bg-[#1a1d27] p-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                How to play
              </h3>
              <ul className="text-xs text-gray-400 space-y-1.5 leading-relaxed">
                <li>• You play as <span className="text-white">{opening.color}</span></li>
                <li>• Drag pieces to make moves</li>
                <li>• The computer plays the opposing side</li>
                <li>• Wrong moves flash red — try again</li>
                <li>• A subtle glow hints at the piece to move</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
