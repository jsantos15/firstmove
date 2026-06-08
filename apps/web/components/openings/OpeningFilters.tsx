'use client';

interface Filters {
  search: string;
  availability: 'all' | 'available' | 'soon';
}

interface OpeningFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export function OpeningFilters({ filters, onChange }: OpeningFiltersProps) {
  const availabilityOptions: { value: Filters['availability']; label: string }[] = [
    { value: 'all',       label: 'All openings' },
    { value: 'available', label: 'Available' },
    { value: 'soon',      label: 'Coming soon' },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap">

      {/* Search */}
      <div className="relative w-56">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search…"
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
        />
      </div>

      {/* Availability filter */}
      <div className="flex rounded-lg border border-white/10 overflow-hidden">
        {availabilityOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange({ ...filters, availability: opt.value })}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              filters.availability === opt.value
                ? 'bg-amber-400/20 text-amber-400'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

    </div>
  );
}
