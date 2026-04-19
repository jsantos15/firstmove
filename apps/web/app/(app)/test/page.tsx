export default function TestPage() {
  const modules = [
    {
      title: 'Opening Recall',
      icon: '♟',
      color: 'text-amber-400',
      border: 'border-amber-400/20',
      bg: 'bg-amber-400/5',
      description: 'You\'re shown a position from the first 10 moves. Play the correct continuation from your repertoire.',
      what: ['Random positions from openings you\'ve practiced', 'No move list visible — recall from memory', 'Scored on accuracy and move order'],
    },
    {
      title: 'Tactical Sharpness',
      icon: '⚡',
      color: 'text-orange-400',
      border: 'border-orange-400/20',
      bg: 'bg-orange-400/5',
      description: 'Timed tactical puzzles drawn from all motifs — no hints, no labels. Find the best move.',
      what: ['Mixed motifs (pin, fork, skewer, back rank, …)', 'Time pressure to simulate real game conditions', 'Rating adjusts to your solve rate'],
    },
    {
      title: 'Endgame Accuracy',
      icon: '🏁',
      color: 'text-blue-400',
      border: 'border-blue-400/20',
      bg: 'bg-blue-400/5',
      description: 'Given a theoretical endgame position, convert it — or hold the draw — with best play.',
      what: ['K+P, rook endgames, minor piece matchups', 'The engine evaluates your technique, not just the result', 'Measures how many moves off optimal you play'],
    },
    {
      title: 'Mixed Drill',
      icon: '🎯',
      color: 'text-green-400',
      border: 'border-green-400/20',
      bg: 'bg-green-400/5',
      description: 'The real test — a sequence of positions mixing openings, tactics, and endgames, just like an actual game.',
      what: ['No category labels — you figure out the situation', 'Tracks where your weakest area is over time', 'Weekly and monthly performance reports'],
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-base)]">

      {/* Hero */}
      <div className="mx-auto max-w-5xl px-6 pt-10 pb-6">
        <p className="text-2xl font-bold text-white mb-1">Test Your Skills</p>
        <p className="text-gray-400 text-sm max-w-xl">
          Practice builds knowledge. Testing reveals what actually stuck.
          Each module here combines everything you&apos;ve learned and measures how well you apply it under pressure.
        </p>
      </div>

      {/* Coming soon banner */}
      <div className="mx-auto max-w-5xl px-6 mb-8">
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-5 py-4 flex items-center gap-3">
          <span className="text-amber-400 text-lg">🎯</span>
          <p className="text-sm text-amber-300">
            <span className="font-semibold">Coming soon.</span>{' '}
            The Test section will be unlocked once Tactics and Endgames sections are live.
          </p>
        </div>
      </div>

      {/* Modules */}
      <div className="mx-auto max-w-5xl px-6 pb-16 flex flex-col gap-4">
        {modules.map(mod => (
          <div
            key={mod.title}
            className={`rounded-xl border ${mod.border} ${mod.bg} p-6 opacity-60 cursor-not-allowed select-none`}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{mod.icon}</span>
              <h2 className={`font-semibold text-lg ${mod.color}`}>{mod.title}</h2>
            </div>
            <p className="text-sm text-gray-400 mb-4 leading-relaxed">{mod.description}</p>
            <ul className="flex flex-col gap-1.5">
              {mod.what.map(item => (
                <li key={item} className="flex items-start gap-2 text-xs text-gray-500">
                  <span className="mt-0.5 shrink-0 text-gray-600">—</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

    </div>
  );
}
