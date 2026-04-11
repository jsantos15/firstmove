'use client';

interface Filters {
  search: string;
  color: 'all' | 'white' | 'black';
  difficulty: 'all' | 'beginner' | 'intermediate' | 'advanced';
}

interface OpeningFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  totalCount: number;
  filteredCount: number;
}

export function OpeningFilters({ filters, onChange, totalCount, filteredCount }: OpeningFiltersProps) {
  const colorOptions: { value: Filters['color']; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'white', label: '♔ White' },
    { value: 'black', label: '♚ Black' },
  ];

  const difficultyOptions: { value: Filters['difficulty']; label: string }[] = [
    { value: 'all', label: 'All levels' },
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' },
  ];

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Search */}
      <div className="relative max-w-xs w-full">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search openings..."
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
        />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Color filter */}
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          {colorOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange({ ...filters, color: opt.value })}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filters.color === opt.value
                  ? 'bg-amber-400/20 text-amber-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Difficulty filter */}
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          {difficultyOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange({ ...filters, difficulty: opt.value })}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filters.difficulty === opt.value
                  ? 'bg-amber-400/20 text-amber-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Count */}
        <span className="text-xs text-gray-500">
          {filteredCount === totalCount ? `${totalCount} openings` : `${filteredCount} of ${totalCount}`}
        </span>
      </div>
    </div>
  );
}
