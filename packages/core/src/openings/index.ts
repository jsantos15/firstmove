import type { Opening } from '../types';

// ─── Openings Library ─────────────────────────────────────────────────────────
// This file is the single source of truth for all bundled opening data.
// Add new openings here. The database in Supabase mirrors this data and serves
// as the authoritative source for server-side queries and future content updates.

export const OPENINGS: Opening[] = [
  {
    id: 'italian-game',
    ecoCode: 'C50',
    name: 'Italian Game',
    color: 'white',
    difficulty: 'beginner',
    description:
      'One of the oldest recorded chess openings. White develops quickly toward the center and prepares to castle.',
    moves: [
      { san: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' },
      { san: 'e5', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2' },
      { san: 'Nf3', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2' },
      { san: 'Nc6', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3' },
      { san: 'Bc4', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', annotation: 'The Italian move — bishop targets f7, the weakest point in Black\'s position.' },
    ],
    variations: [
      {
        id: 'giuoco-piano',
        name: 'Giuoco Piano',
        description: 'Black mirrors White\'s bishop development.',
        moves: [
          { san: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' },
          { san: 'e5', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2' },
          { san: 'Nf3', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2' },
          { san: 'Nc6', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3' },
          { san: 'Bc4', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3' },
          { san: 'Bc5', fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', annotation: 'Black mirrors White — the Giuoco Piano ("quiet game").' },
        ],
      },
    ],
    tags: ['e4', 'open-game', 'classical', 'beginner-friendly'],
  },
  {
    id: 'sicilian-defense',
    ecoCode: 'B20',
    name: 'Sicilian Defense',
    color: 'black',
    difficulty: 'intermediate',
    description:
      'The most popular response to 1.e4. Black fights for the center asymmetrically, leading to rich, complex positions.',
    moves: [
      { san: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' },
      { san: 'c5', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2', annotation: 'The Sicilian — Black contests d4 without symmetry.' },
    ],
    variations: [],
    tags: ['e4', 'semi-open', 'dynamic', 'popular'],
  },
  {
    id: 'queens-gambit',
    ecoCode: 'D06',
    name: "Queen's Gambit",
    color: 'white',
    difficulty: 'intermediate',
    description:
      "White offers a pawn to gain central control. One of the oldest and most respected openings in chess.",
    moves: [
      { san: 'd4', fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1' },
      { san: 'd5', fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6 0 2' },
      { san: 'c4', fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2', annotation: "The gambit pawn — White offers c4 to gain space." },
    ],
    variations: [],
    tags: ['d4', 'closed-game', 'classical', 'positional'],
  },
];

// ─── Lookup Helpers ───────────────────────────────────────────────────────────

export function getOpeningById(id: string): Opening | undefined {
  return OPENINGS.find(o => o.id === id);
}

export function getOpeningByEco(ecoCode: string): Opening | undefined {
  return OPENINGS.find(o => o.ecoCode === ecoCode);
}

export function getOpeningsByColor(color: 'white' | 'black'): Opening[] {
  return OPENINGS.filter(o => o.color === color);
}

export function getOpeningsByDifficulty(difficulty: Opening['difficulty']): Opening[] {
  return OPENINGS.filter(o => o.difficulty === difficulty);
}

export function searchOpenings(query: string): Opening[] {
  const q = query.toLowerCase();
  return OPENINGS.filter(
    o =>
      o.name.toLowerCase().includes(q) ||
      o.ecoCode.toLowerCase().includes(q) ||
      o.tags.some(tag => tag.includes(q))
  );
}
