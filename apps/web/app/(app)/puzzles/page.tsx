export default function PuzzlesPage() {
  const difficulties = [
    { label: 'Beginner',     range: '< 1000',    description: 'One-move mates and simple captures.',                   color: 'text-green-400',  border: 'border-green-400/20',  bg: 'bg-green-400/5'  },
    { label: 'Intermediate', range: '1000–1500', description: 'Two to three-move combinations with a clear motif.',    color: 'text-amber-400',  border: 'border-amber-400/20',  bg: 'bg-amber-400/5'  },
    { label: 'Advanced',     range: '1500–2000', description: 'Deeper calculations, multiple candidate moves.',         color: 'text-orange-400', border: 'border-orange-400/20', bg: 'bg-orange-400/5' },
    { label: 'Expert',       range: '2000+',     description: 'Complex, multi-step problems from grandmaster games.',  color: 'text-red-400',    border: 'border-red-400/20',    bg: 'bg-red-400/5'    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-base)]">

      {/* Hero */}
      <div className="mx-auto max-w-5xl px-6 pt-10 pb-6">
        <p className="text-2xl font-bold text-white mb-1">Daily Puzzles</p>
        <p className="text-gray-400 text-sm">
          Random positions from real games — no motif label given. You find the best move on your own.
          This is how you build the instinct tactics drills can&apos;t give you.
        </p>
      </div>

      {/* Coming soon banner */}
      <div className="mx-auto max-w-5xl px-6 mb-8">
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-5 py-4 flex items-center gap-3">
          <span className="text-amber-400 text-lg">🧩</span>
          <p className="text-sm text-amber-300">
            <span className="font-semibold">Coming soon.</span>{' '}
            Puzzles will be served from a curated set of real games, rated by difficulty.
          </p>
        </div>
      </div>

      {/* Difficulty tiers */}
      <div className="mx-auto max-w-5xl px-6 pb-16">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Difficulty tiers</h2>
        <div className="flex flex-col gap-3">
          {difficulties.map(d => (
            <div
              key={d.label}
              className={`rounded-xl border ${d.border} ${d.bg} p-5 opacity-60 cursor-not-allowed select-none`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-semibold text-sm ${d.color}`}>{d.label}</span>
                <span className="text-xs text-gray-600 font-mono">{d.range}</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{d.description}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
