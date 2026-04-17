export default function TacticsPage() {
  const motifs = [
    { name: 'Fork',              description: 'Attack two pieces simultaneously with one move.',           icon: '⚔️' },
    { name: 'Pin',               description: 'Immobilize a piece that shields a more valuable target.',   icon: '📌' },
    { name: 'Skewer',            description: 'Force a valuable piece to move, exposing one behind it.',   icon: '🗡️' },
    { name: 'Discovered Attack', description: 'Uncover a hidden attack by moving another piece.',          icon: '👁️' },
    { name: 'Double Check',      description: 'Check with two pieces at once — the king must move.',       icon: '⚡' },
    { name: 'Back Rank Mate',    description: 'Exploit an undefended first or eighth rank.',               icon: '🏰' },
    { name: 'Deflection',        description: 'Force a defender away from its key square or file.',        icon: '↗️' },
    { name: 'Interference',      description: 'Cut communication between two enemy pieces.',               icon: '🚧' },
    { name: 'Zwischenzug',       description: 'An in-between move that changes the evaluation.',           icon: '↩️' },
    { name: 'Desperado',         description: 'A piece about to be captured goes down fighting.',          icon: '💥' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-base)]">

      {/* Hero */}
      <div className="mx-auto max-w-5xl px-6 pt-10 pb-6">
        <p className="text-2xl font-bold text-white mb-1">Tactical Patterns</p>
        <p className="text-gray-400 text-sm">
          Master the recurring motifs that decide most games under 2000. Recognize the pattern, find the move.
        </p>
      </div>

      {/* Coming soon banner */}
      <div className="mx-auto max-w-5xl px-6 mb-8">
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-5 py-4 flex items-center gap-3">
          <span className="text-amber-400 text-lg">⚡</span>
          <p className="text-sm text-amber-300">
            <span className="font-semibold">Coming soon.</span>{' '}
            Each motif will have guided examples, drills, and a timed challenge mode.
          </p>
        </div>
      </div>

      {/* Motif grid */}
      <div className="mx-auto max-w-5xl px-6 pb-16">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {motifs.map(motif => (
            <div
              key={motif.name}
              className="rounded-xl border border-white/5 bg-[var(--bg-panel)] p-5 opacity-60 cursor-not-allowed select-none"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{motif.icon}</span>
                <span className="font-semibold text-white text-sm">{motif.name}</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{motif.description}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
