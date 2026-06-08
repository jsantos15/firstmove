'use client';

import { useState, useMemo } from 'react';
import { OpeningCard } from '@/components/openings/OpeningCard';
import { OpeningFilters } from '@/components/openings/OpeningFilters';
import { useOpeningIndex } from '@/hooks/useOpenings';

interface Filters {
  search: string;
  availability: 'all' | 'available' | 'soon';
}

export default function OpeningsPage() {
  const [filters, setFilters] = useState<Filters>({
    search: '',
    availability: 'all',
  });

  const { data: openings = [], isLoading } = useOpeningIndex();

  const filtered = useMemo(() => {
    return openings.filter(o => {
      if (filters.availability === 'available' && !o.course_slug) return false;
      if (filters.availability === 'soon' && o.course_slug) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const match =
          (o.name ?? '').toLowerCase().includes(q) ||
          (o.eco_code ?? '').toLowerCase().includes(q) ||
          (o.family_name ?? '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [filters, openings]);

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
              onClick={() => setFilters({ search: '', availability: 'all' })}
              className="mt-4 text-sm text-amber-400 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(opening => (
              <OpeningCard
                key={opening.popularity_id}
                opening={opening}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
