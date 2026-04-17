'use client';

import { useState, useMemo } from 'react';
import { OpeningCard } from '@/components/openings/OpeningCard';
import { OpeningFilters } from '@/components/openings/OpeningFilters';
import { useAllProgress, getOpeningProgress } from '@/hooks/useProgress';
import { useOpenings } from '@/hooks/useOpenings';
import type { Opening } from '@firstmove/core';

interface Filters {
  search: string;
  color: 'all' | 'white' | 'black' | 'gambits';
  difficulty: 'all' | 'beginner' | 'intermediate' | 'advanced';
  inProgress: boolean;
}

export default function OpeningsPage() {
  const [filters, setFilters] = useState<Filters>({
    search: '',
    color: 'all',
    difficulty: 'all',
    inProgress: false,
  });

  const { data: openings = [], isLoading } = useOpenings();
  const { data: progress } = useAllProgress();

  const filtered = useMemo(() => {
    const result = openings.filter(o => {
      if (filters.color === 'gambits') {
        if (!o.tags.includes('gambit')) return false;
      } else if (filters.color !== 'all' && o.color !== filters.color) return false;
      if (filters.difficulty !== 'all' && o.difficulty !== filters.difficulty) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const match =
          o.name.toLowerCase().includes(q) ||
          o.ecoCode.toLowerCase().includes(q) ||
          o.tags.some(t => t.includes(q));
        if (!match) return false;
      }
      return true;
    });

    if (filters.inProgress) {
      const getProgressCount = (o: Opening) =>
        o.variations.filter(v => (progress?.get(`${o.id}/${v.id}`)?.timesCompleted ?? 0) > 0).length;
      return result
        .filter(o => getProgressCount(o) > 0)
        .sort((a, b) => getProgressCount(b) - getProgressCount(a));
    }

    return result;
  }, [filters, openings, progress]);

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-base)]">

      {/* Hero */}
      <div className="mx-auto max-w-6xl px-6 pt-10 pb-6">
        <p className="text-2xl font-bold text-white mb-1">Chess Opening Courses</p>
        <p className="text-gray-400 text-sm">
          Learn the most important openings step by step. Pick one and practice until it&apos;s muscle memory.
        </p>
      </div>

      {/* Filters */}
      <div className="mx-auto max-w-6xl px-6 pb-6">
        <OpeningFilters filters={filters} onChange={setFilters} />
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-6xl px-6 pb-16">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-5xl mb-4">♟</span>
            <p className="text-gray-400">No openings match your filters.</p>
            <button
              onClick={() => setFilters({ search: '', color: 'all', difficulty: 'all', inProgress: false })}
              className="mt-4 text-sm text-amber-400 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(opening => {
              const { status, completedLines } = getOpeningProgress(
                progress,
                opening.id,
                opening.variations.map(v => v.id)
              );
              return (
                <OpeningCard
                  key={opening.id}
                  opening={opening}
                  completedLines={completedLines}
                  status={status}
                />
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
