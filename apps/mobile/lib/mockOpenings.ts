export interface MockVariation {
  id: string;
  name: string;
  moves: string[]; // alternating moves from move 1 (white first)
  isPunishLine: boolean;
  badge?: string;
}

export interface MockOpening {
  id: string;
  name: string;
  eco: string;
  color: 'white' | 'black';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  fen: string;
  description: string;
  variations: MockVariation[];
  completedIds: string[];
}

export const MOCK_OPENINGS: MockOpening[] = [
  {
    id: 'italian-game',
    name: 'Italian Game',
    eco: 'C50',
    color: 'white',
    difficulty: 'beginner',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    description: 'Control the center, develop pieces, castle early. A solid foundation for beginners.',
    variations: [
      {
        id: 'italian-giuoco-piano',
        name: 'Giuoco Piano',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'cxd4', 'Bb4+'],
        isPunishLine: false,
      },
      {
        id: 'italian-evans-gambit',
        name: 'Evans Gambit',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4', 'Bxb4', 'c3', 'Ba5', 'd4', 'exd4'],
        isPunishLine: false,
      },
      {
        id: 'italian-two-knights',
        name: 'Two Knights Defense',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5', 'Bb5+', 'c6'],
        isPunishLine: false,
      },
      {
        id: 'italian-punish-wayward',
        name: "Punish: 3...Qh4? (Wayward Queen)",
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Qh4?', 'Nxh4'],
        isPunishLine: true,
        badge: 'Win a knight immediately',
      },
    ],
    completedIds: ['italian-giuoco-piano'],
  },
  {
    id: 'ruy-lopez',
    name: 'Ruy Lopez',
    eco: 'C65',
    color: 'white',
    difficulty: 'intermediate',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    description: "One of the oldest and most respected openings. Creates long-term pressure on Black's e5 pawn.",
    variations: [
      {
        id: 'ruy-berlin',
        name: 'Berlin Defense',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'O-O', 'Nxe4', 'd4', 'Nd6', 'Bxc6', 'dxc6', 'dxe5'],
        isPunishLine: false,
      },
      {
        id: 'ruy-morphy',
        name: 'Morphy Defense',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3'],
        isPunishLine: false,
      },
      {
        id: 'ruy-exchange',
        name: 'Exchange Variation',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O', 'f6', 'd4'],
        isPunishLine: false,
      },
      {
        id: 'ruy-punish-nd4',
        name: 'Punish: 3...Nd4? (Fork attempt)',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nd4?', 'Nxd4', 'exd4', 'O-O', 'Bc5', 'd3'],
        isPunishLine: true,
        badge: 'Easy edge, no compensation',
      },
    ],
    completedIds: ['ruy-berlin', 'ruy-morphy', 'ruy-exchange', 'ruy-punish-nd4'],
  },
  {
    id: 'queens-gambit',
    name: "Queen's Gambit",
    eco: 'D30',
    color: 'white',
    difficulty: 'beginner',
    fen: 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
    description: 'Control the center with pawns. Black almost never gets to keep the gambited pawn.',
    variations: [
      {
        id: 'qg-declined',
        name: "Queen's Gambit Declined",
        moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'Nbd7'],
        isPunishLine: false,
      },
      {
        id: 'qg-accepted',
        name: "Queen's Gambit Accepted",
        moves: ['d4', 'd5', 'c4', 'dxc4', 'Nf3', 'Nf6', 'e3', 'e6', 'Bxc4', 'c5', 'O-O'],
        isPunishLine: false,
      },
      {
        id: 'qg-punish-albin',
        name: 'Punish: 2...e5?! (Albin Counter-Gambit)',
        moves: ['d4', 'd5', 'c4', 'e5?!', 'dxe5', 'd4', 'Nf3', 'Nc6', 'g3', 'Bg4', 'Bg2'],
        isPunishLine: true,
        badge: 'Solid advantage with precise play',
      },
    ],
    completedIds: ['qg-declined'],
  },
  {
    id: 'sicilian-najdorf',
    name: 'Sicilian Defense',
    eco: 'B90',
    color: 'black',
    difficulty: 'advanced',
    fen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
    description: "The sharpest and most theoretically rich reply to 1.e4. The Najdorf variation is the choice of champions.",
    variations: [
      {
        id: 'najdorf-english',
        name: 'English Attack (6. Be3)',
        moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5', 'Nb3', 'Be6', 'f3'],
        isPunishLine: false,
      },
      {
        id: 'najdorf-opocensky',
        name: 'Opočenský (6. Be2)',
        moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be2', 'e5', 'Nb3', 'Be6'],
        isPunishLine: false,
      },
      {
        id: 'najdorf-punish-bg5',
        name: 'Punish: 6. Bg5 (Old main line)',
        moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Bg5', 'e6', 'f4', 'Be7', 'Qf3', 'Qc7'],
        isPunishLine: true,
        badge: 'Sharp counter-attack',
      },
    ],
    completedIds: [],
  },
  {
    id: 'kings-indian',
    name: "King's Indian Defense",
    eco: 'E92',
    color: 'black',
    difficulty: 'intermediate',
    fen: 'rnbq1rk1/ppp1ppbp/3p1np1/8/2PPP3/2N2N2/PP3PPP/R1BQKB1R w KQ - 2 6',
    description: "Hypermodern strategy: let White build a center, then dynamically attack it with pieces.",
    variations: [
      {
        id: 'kid-classical',
        name: 'Classical Variation',
        moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'O-O', 'Nc6'],
        isPunishLine: false,
      },
      {
        id: 'kid-saemisch',
        name: 'Sämisch Variation',
        moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f3', 'O-O', 'Be3', 'e5'],
        isPunishLine: false,
      },
      {
        id: 'kid-punish-e5',
        name: 'Punish: 5. e5? (Premature push)',
        moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'e5?', 'dxe5', 'dxe5', 'Ng4', 'Nf3', 'Nc6'],
        isPunishLine: true,
        badge: '+1 pawn, lasting initiative',
      },
    ],
    completedIds: ['kid-classical'],
  },
  {
    id: 'french-defense',
    name: 'French Defense',
    eco: 'C15',
    color: 'black',
    difficulty: 'intermediate',
    fen: 'rnbqk1nr/ppp2ppp/4p3/3p4/1b1PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 2 4',
    description: 'A solid reply to 1.e4 that leads to strategic pawn structures and long-term battles.',
    variations: [
      {
        id: 'french-winawer',
        name: 'Winawer Variation',
        moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+', 'bxc3', 'Ne7'],
        isPunishLine: false,
      },
      {
        id: 'french-advance',
        name: 'Advance Variation',
        moves: ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3', 'Qb6', 'a3', 'Nh6'],
        isPunishLine: false,
      },
      {
        id: 'french-punish-exchange',
        name: 'Punish: 3. exd5 (Exchange Variation)',
        moves: ['e4', 'e6', 'd4', 'd5', 'exd5', 'exd5', 'Bd3', 'Nc6', 'Nf3', 'Bd6', 'O-O', 'Nge7'],
        isPunishLine: true,
        badge: 'Symmetrical — easy equality for Black',
      },
    ],
    completedIds: [],
  },
];

export function findOpening(id: string): MockOpening | undefined {
  return MOCK_OPENINGS.find(o => o.id === id);
}
