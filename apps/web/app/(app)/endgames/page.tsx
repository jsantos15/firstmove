export default function EndgamesPage() {
  const categories = [
    {
      title: 'King & Pawn',
      icon: '♙',
      topics: [
        { name: 'Opposition',           description: 'The key technique for controlling the board with just kings.' },
        { name: 'Key Squares',          description: 'Squares the attacking king must reach to promote.' },
        { name: 'Pawn Races',           description: 'Who promotes first — and what happens when both do.' },
        { name: 'Passed Pawns',         description: 'How to escort a passer to promotion.' },
      ],
    },
    {
      title: 'Rook Endgames',
      icon: '♖',
      topics: [
        { name: 'Lucena Position',      description: 'The fundamental winning technique with rook + pawn.' },
        { name: 'Philidor Position',    description: 'The defensive drawing technique against rook + pawn.' },
        { name: 'Rook Behind Pawn',     description: 'Active rook placement to support or stop a passer.' },
        { name: 'Cutoff Technique',     description: 'Cutting off the defending king along a rank or file.' },
      ],
    },
    {
      title: 'Minor Piece Endgames',
      icon: '♗',
      topics: [
        { name: 'Good vs Bad Bishop',   description: 'How pawn structure determines bishop strength.' },
        { name: 'Bishop vs Knight',     description: 'Open vs closed positions and when each piece wins.' },
        { name: 'Opposite Bishops',     description: 'The drawing fortress with bishops on different colors.' },
        { name: 'Knight Endgames',      description: 'Outposts, blockades, and the knight\'s unique geometry.' },
      ],
    },
    {
      title: 'Checkmate Patterns',
      icon: '♚',
      topics: [
        { name: 'King & Two Bishops',   description: 'Force the king to the corner with two bishops.' },
        { name: 'Bishop & Knight Mate', description: 'The hardest elementary mate — precise technique required.' },
        { name: 'Queen vs Pawn',        description: 'Win or draw depending on pawn file and rank.' },
        { name: 'Rook vs Pawn',         description: 'When can the stronger side win?' },
      ],
    },
    {
      title: 'Pawn Structures',
      icon: '♟',
      topics: [
        { name: 'Zugzwang',             description: 'Positions where any move worsens your situation.' },
        { name: 'Triangulation',        description: 'Lose a tempo with the king to force zugzwang.' },
        { name: 'Outside Passed Pawn',  description: 'Use a pawn as a decoy to win material elsewhere.' },
        { name: 'Breakthrough',         description: 'Create a passed pawn by force with a pawn sacrifice.' },
      ],
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-base)]">

      {/* Hero */}
      <div className="mx-auto max-w-5xl px-6 pt-10 pb-6">
        <p className="text-2xl font-bold text-white mb-1">Endgame Technique</p>
        <p className="text-gray-400 text-sm">
          Openings get you to a decent position. Tactics win the piece. Endgame technique converts the win.
          This is where most games are actually decided.
        </p>
      </div>

      {/* Coming soon banner */}
      <div className="mx-auto max-w-5xl px-6 mb-8">
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-5 py-4 flex items-center gap-3">
          <span className="text-amber-400 text-lg">🏁</span>
          <p className="text-sm text-amber-300">
            <span className="font-semibold">Coming soon.</span>{' '}
            Each topic will include an interactive board, key positions, and a drill to test your technique.
          </p>
        </div>
      </div>

      {/* Categories */}
      <div className="mx-auto max-w-5xl px-6 pb-16 flex flex-col gap-8">
        {categories.map(cat => (
          <div key={cat.title}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{cat.icon}</span>
              <h2 className="text-white font-semibold">{cat.title}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cat.topics.map(topic => (
                <div
                  key={topic.name}
                  className="rounded-xl border border-white/5 bg-[var(--bg-panel)] p-4 opacity-60 cursor-not-allowed select-none"
                >
                  <p className="font-medium text-white text-sm mb-1">{topic.name}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{topic.description}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
