export default function TacticsPage() {
  const motifs = [
    // Foundational — every player at every level encounters these
    { name: 'Fork',                  lichessTheme: 'fork',                description: 'Attack two pieces simultaneously with one move.',                          icon: '⚔️' },
    { name: 'Pin',                   lichessTheme: 'pin',                 description: 'Immobilize a piece that shields a more valuable target.',                  icon: '📌' },
    { name: 'Skewer',                lichessTheme: 'skewer',              description: 'Force a valuable piece to move, exposing one behind it.',                  icon: '🗡️' },
    { name: 'Discovered Attack',     lichessTheme: 'discoveredAttack',    description: 'Uncover a hidden attack by moving another piece.',                         icon: '👁️' },
    { name: 'Double Check',          lichessTheme: 'doubleCheck',         description: 'Check with two pieces at once — the king must move.',                      icon: '⚡' },
    { name: 'Overloading',           lichessTheme: 'overloading',         description: 'Exploit a piece defending two things at once — it cannot handle both.',    icon: '⚖️' },
    { name: 'Removing the Defender', lichessTheme: 'removingTheDefender', description: 'Capture or chase away the piece protecting a key square or target.',       icon: '🛡️' },
    { name: 'Trapped Piece',         lichessTheme: 'trappedPiece',        description: 'Surround an enemy piece until it has no escape and can be won for free.',  icon: '🪤' },

    // Common attacking patterns
    { name: 'Deflection',            lichessTheme: 'deflection',          description: 'Force a defender away from its key square or file.',                       icon: '↗️' },
    { name: 'Attraction',            lichessTheme: 'attraction',          description: 'Lure an enemy piece to a square where it can be exploited.',                icon: '🎣' },
    { name: 'Clearance',             lichessTheme: 'clearance',           description: 'Sacrifice a piece to open a line or square for a stronger follow-up.',     icon: '🧹' },
    { name: 'Interference',          lichessTheme: 'interference',        description: 'Cut communication between two enemy pieces.',                              icon: '🚧' },
    { name: 'X-Ray Attack',          lichessTheme: 'xRayAttack',          description: 'A piece exerts pressure through an enemy piece on the same line.',         icon: '🔍' },
    { name: 'Zwischenzug',           lichessTheme: 'zwischenzug',         description: 'An in-between move that changes the evaluation before completing a sequence.', icon: '↩️' },

    // Mating patterns
    { name: 'Back Rank Mate',        lichessTheme: 'backRankMate',        description: 'Exploit an undefended first or eighth rank to deliver checkmate.',         icon: '🏰' },
    { name: 'Smothered Mate',        lichessTheme: 'smotheredMate',       description: 'A knight delivers checkmate to a king suffocated by its own pieces.',      icon: '🕸️' },

    // Advanced / Rare
    { name: 'Desperado',             lichessTheme: 'desperado',           description: 'A piece about to be captured goes down fighting, taking maximum material.', icon: '💥' },
    { name: 'Windmill',              lichessTheme: 'windmill',            description: 'A cycle of alternating discovered checks and direct checks that wins material.', icon: '🌀' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-(--bg-base)">

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
            Each motif will have guided examples, drills sourced from the Lichess puzzle database, and a timed challenge mode.
          </p>
        </div>
      </div>

      {/* Motif grid */}
      <div className="mx-auto max-w-5xl px-6 pb-16">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {motifs.map(motif => (
            <div
              key={motif.name}
              className="rounded-xl border border-white/5 bg-(--bg-panel) p-5 opacity-60 cursor-not-allowed select-none"
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
