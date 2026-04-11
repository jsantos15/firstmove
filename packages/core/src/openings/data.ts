import type { OpeningColor, OpeningDifficulty } from '../types';

// ─── Raw Opening Definitions ──────────────────────────────────────────────────
// Only SAN move arrays. FENs are computed at runtime via chess.js.
// Add new openings here. Keep lines to 6–12 moves for learning purposes.

export interface OpeningLineDefinition {
  id: string;
  name: string;
  description?: string;
  sans: string[];
}

export interface OpeningDefinition {
  id: string;
  ecoCode: string;
  name: string;
  color: OpeningColor;
  difficulty: OpeningDifficulty;
  description: string;
  mainLine: OpeningLineDefinition;
  variations: OpeningLineDefinition[];
  tags: string[];
}

export const OPENING_DEFINITIONS: OpeningDefinition[] = [
  // ─── Italian Game ───────────────────────────────────────────────────────────
  {
    id: 'italian-game',
    ecoCode: 'C50',
    name: 'Italian Game',
    color: 'white',
    difficulty: 'beginner',
    description:
      'One of the oldest openings in chess. White develops rapidly, targets the center, and aims the bishop at the vulnerable f7 square.',
    mainLine: {
      id: 'italian-main',
      name: 'Main Line',
      sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4'],
    },
    variations: [
      {
        id: 'italian-two-knights',
        name: 'Two Knights Defense',
        description: 'Black counterattacks immediately with the knight.',
        sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5', 'Bb5+', 'c6'],
      },
      {
        id: 'italian-evans-gambit',
        name: 'Evans Gambit',
        description: 'White sacrifices a pawn for rapid development and attacking chances.',
        sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4', 'Bxb4', 'c3', 'Ba5', 'd4', 'exd4'],
      },
    ],
    tags: ['e4', 'open-game', 'classical', 'beginner-friendly'],
  },

  // ─── Ruy Lopez ──────────────────────────────────────────────────────────────
  {
    id: 'ruy-lopez',
    ecoCode: 'C60',
    name: 'Ruy Lopez',
    color: 'white',
    difficulty: 'intermediate',
    description:
      'The most classic of all openings. White pressures the e5 pawn indirectly and aims for long-term positional dominance.',
    mainLine: {
      id: 'ruy-morphy-closed',
      name: 'Closed Variation',
      sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3'],
    },
    variations: [
      {
        id: 'ruy-berlin',
        name: 'Berlin Defense',
        description: 'A rock-solid defense famously used by Magnus Carlsen to neutralize 1.e4.',
        sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'O-O', 'Nxe4', 'd4', 'Nd6', 'dxe5', 'Nxb5'],
      },
      {
        id: 'ruy-exchange',
        name: 'Exchange Variation',
        description: 'White captures on c6 early, doubling Black\'s pawns for a structural advantage.',
        sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O', 'f6', 'Nxe5', 'fxe5'],
      },
    ],
    tags: ['e4', 'open-game', 'classical', 'positional'],
  },

  // ─── Sicilian Defense ───────────────────────────────────────────────────────
  {
    id: 'sicilian-defense',
    ecoCode: 'B20',
    name: 'Sicilian Defense',
    color: 'black',
    difficulty: 'intermediate',
    description:
      'The most popular response to 1.e4. Black fights for the center asymmetrically, leading to rich, complex positions with winning chances for both sides.',
    mainLine: {
      id: 'sicilian-najdorf',
      name: 'Najdorf Variation',
      description: 'The most popular and theoretically rich variation. Favored by Fischer and Kasparov.',
      sans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
    },
    variations: [
      {
        id: 'sicilian-dragon',
        name: 'Dragon Variation',
        description: 'Black fianchettoes the bishop for a powerful long diagonal battery.',
        sans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'Bg7', 'f3'],
      },
      {
        id: 'sicilian-classical',
        name: 'Classical Variation',
        description: 'Solid and flexible. Black develops naturally without committing early.',
        sans: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'e5', 'Nb5', 'd6', 'N1c3', 'a6'],
      },
    ],
    tags: ['e4', 'semi-open', 'dynamic', 'popular', 'sharp'],
  },

  // ─── French Defense ─────────────────────────────────────────────────────────
  {
    id: 'french-defense',
    ecoCode: 'C00',
    name: 'French Defense',
    color: 'black',
    difficulty: 'intermediate',
    description:
      'Black builds a solid pawn chain and counterattacks the center. Leads to closed, strategic battles where Black is never clearly worse.',
    mainLine: {
      id: 'french-classical',
      name: 'Classical Variation',
      sans: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'e5', 'Nfd7', 'f4', 'c5', 'Nf3'],
    },
    variations: [
      {
        id: 'french-advance',
        name: 'Advance Variation',
        description: 'White advances the e-pawn to gain space. Black immediately counterattacks with c5.',
        sans: ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3', 'Qb6', 'a3'],
      },
      {
        id: 'french-exchange',
        name: 'Exchange Variation',
        description: 'White exchanges on d5 for a symmetrical, quieter game.',
        sans: ['e4', 'e6', 'd4', 'd5', 'exd5', 'exd5', 'Nf3', 'Nf6', 'Bd3', 'Bd6', 'O-O', 'O-O'],
      },
    ],
    tags: ['e4', 'semi-open', 'solid', 'strategic'],
  },

  // ─── Caro-Kann ──────────────────────────────────────────────────────────────
  {
    id: 'caro-kann',
    ecoCode: 'B10',
    name: 'Caro-Kann Defense',
    color: 'black',
    difficulty: 'intermediate',
    description:
      'A rock-solid response to 1.e4. Black establishes a strong pawn structure without locking in the light-squared bishop as in the French.',
    mainLine: {
      id: 'caro-classical',
      name: 'Classical Variation',
      sans: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6', 'h4', 'h6', 'Nf3'],
    },
    variations: [
      {
        id: 'caro-advance',
        name: 'Advance Variation',
        description: 'White gains space. Black develops the bishop outside the pawn chain.',
        sans: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2', 'Nd7', 'O-O', 'Ne7'],
      },
      {
        id: 'caro-exchange',
        name: 'Exchange Variation',
        description: 'Leads to a symmetrical pawn structure and early equality.',
        sans: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'Bd3', 'Nc6', 'c3', 'Qc7', 'Ne2', 'Bg4'],
      },
    ],
    tags: ['e4', 'semi-open', 'solid', 'positional'],
  },

  // ─── Queen's Gambit ─────────────────────────────────────────────────────────
  {
    id: 'queens-gambit',
    ecoCode: 'D06',
    name: "Queen's Gambit",
    color: 'white',
    difficulty: 'intermediate',
    description:
      "White offers a pawn to seize central control. One of the oldest and most respected openings — used by world champions for over a century.",
    mainLine: {
      id: 'qgd-classical',
      name: 'Classical Declined',
      sans: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6', 'Bh4'],
    },
    variations: [
      {
        id: 'qga',
        name: "Queen's Gambit Accepted",
        description: 'Black accepts the pawn. White regains it with better development.',
        sans: ['d4', 'd5', 'c4', 'dxc4', 'e4', 'e5', 'Nf3', 'exd4', 'Nxd4', 'Nf6', 'Nc3', 'Bb4'],
      },
      {
        id: 'slav-defense',
        name: 'Slav Defense',
        description: 'Black supports d5 with c6 — a solid alternative to the French structure.',
        sans: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4', 'a4', 'Bf5', 'e3', 'e6'],
      },
    ],
    tags: ['d4', 'closed-game', 'classical', 'positional'],
  },

  // ─── London System ──────────────────────────────────────────────────────────
  {
    id: 'london-system',
    ecoCode: 'D02',
    name: 'London System',
    color: 'white',
    difficulty: 'beginner',
    description:
      'A simple, solid opening system White can use against almost anything. Develop the bishop to f4, support with e3, and build a strong center.',
    mainLine: {
      id: 'london-main',
      name: 'Main Line',
      sans: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'e6', 'e3', 'Bd6', 'Bg3', 'O-O', 'Nbd2', 'c5'],
    },
    variations: [
      {
        id: 'london-vs-kid',
        name: 'vs King\'s Indian Setup',
        description: 'Against Black\'s fianchetto, White maintains the same solid setup.',
        sans: ['d4', 'Nf6', 'Nf3', 'g6', 'Bf4', 'Bg7', 'e3', 'd6', 'Be2', 'O-O', 'O-O', 'c5'],
      },
      {
        id: 'london-torre',
        name: 'Torre Attack Hybrid',
        description: 'White delays Bf4 in favor of immediate pressure with Bg5.',
        sans: ['d4', 'd5', 'Nf3', 'Nf6', 'Bg5', 'e6', 'e3', 'Be7', 'Nbd2', 'O-O', 'Bd3', 'b6'],
      },
    ],
    tags: ['d4', 'system', 'solid', 'beginner-friendly'],
  },

  // ─── King's Indian Defense ──────────────────────────────────────────────────
  {
    id: 'kings-indian',
    ecoCode: 'E60',
    name: "King's Indian Defense",
    color: 'black',
    difficulty: 'intermediate',
    description:
      "Black allows White to build a large center, then attacks it with pieces and the e5 pawn break. One of the most dynamic openings in chess.",
    mainLine: {
      id: 'kid-classical',
      name: 'Classical Variation',
      sans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'O-O', 'Nc6'],
    },
    variations: [
      {
        id: 'kid-saemisch',
        name: 'Sämisch Variation',
        description: 'White plays f3 to support the center but weakens the kingside.',
        sans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f3', 'O-O', 'Be3', 'e5', 'Nge2'],
      },
      {
        id: 'kid-four-pawns',
        name: 'Four Pawns Attack',
        description: 'White grabs maximum space. Black must counterattack immediately.',
        sans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f4', 'O-O', 'Nf3', 'c5', 'd5'],
      },
    ],
    tags: ['d4', 'indian-defense', 'dynamic', 'counterattack'],
  },

  // ─── Vienna Game ────────────────────────────────────────────────────────────
  {
    id: 'vienna-game',
    ecoCode: 'C25',
    name: 'Vienna Game',
    color: 'white',
    difficulty: 'beginner',
    description:
      'A flexible opening where White develops the knight to c3 before committing the king\'s knight. Can lead to quiet or sharp play depending on White\'s follow-up.',
    mainLine: {
      id: 'vienna-main',
      name: 'Main Line',
      sans: ['e4', 'e5', 'Nc3', 'Nc6', 'Bc4', 'Bc5', 'Qg4', 'Qf6', 'Nd5', 'Qxf2+', 'Kd1'],
    },
    variations: [
      {
        id: 'vienna-gambit',
        name: 'Vienna Gambit',
        description: 'White plays f4 to immediately challenge the center.',
        sans: ['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'd5', 'fxe5', 'Nxe4', 'Qf3', 'Nc5', 'Bb5+', 'c6', 'Be2'],
      },
      {
        id: 'vienna-mieses',
        name: 'Mieses Variation',
        description: 'White plays Nf3 for a quieter, more positional game.',
        sans: ['e4', 'e5', 'Nc3', 'Nc6', 'Nf3', 'Nf6', 'd4', 'exd4', 'Nxd4', 'Bb4', 'Nxc6', 'bxc6'],
      },
    ],
    tags: ['e4', 'open-game', 'flexible', 'beginner-friendly'],
  },

  // ─── King's Gambit ──────────────────────────────────────────────────────────
  {
    id: 'kings-gambit',
    ecoCode: 'C30',
    name: "King's Gambit",
    color: 'white',
    difficulty: 'intermediate',
    description:
      "One of the oldest and most aggressive openings. White sacrifices a pawn on move 2 for rapid development and a fierce attack on the king.",
    mainLine: {
      id: 'kga-classical',
      name: "King's Gambit Accepted — Classical",
      sans: ['e4', 'e5', 'f4', 'exf4', 'Nf3', 'g5', 'h4', 'g4', 'Ne5', 'Nf6', 'Bc4', 'd5', 'exd5'],
    },
    variations: [
      {
        id: 'kga-fischer',
        name: 'Fischer Defense',
        description: 'Bobby Fischer\'s recommendation — Black plays d6 and holds the pawn.',
        sans: ['e4', 'e5', 'f4', 'exf4', 'Nf3', 'd6', 'd4', 'g5', 'h4', 'g4', 'Ng1', 'Bh6'],
      },
      {
        id: 'kgd-falkbeer',
        name: 'Falkbeer Counter Gambit',
        description: 'Black sacrifices a pawn in return for active counterplay.',
        sans: ['e4', 'e5', 'f4', 'd5', 'exd5', 'e4', 'd3', 'Nf6', 'dxe4', 'Nxe4', 'Nf3', 'Bc5'],
      },
    ],
    tags: ['e4', 'gambit', 'sharp', 'attacking', 'romantic'],
  },
];
