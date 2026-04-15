/**
 * scripts/fetch-openings.ts
 *
 * Fetches opening lines from the Lichess Masters Explorer API and generates
 * updated opening data for packages/core/src/openings/data.ts.
 *
 * For each named line, the script starts from the defining position and extends
 * it by always following the most popular master-game continuation, stopping
 * when the top move has fewer than MIN_GAMES master games (= out of theory).
 *
 * Usage:
 *   npx tsx scripts/fetch-openings.ts
 *
 * Output:
 *   scripts/output/openings-fetched.json   ← review this before replacing data.ts
 */

import { Chess } from 'chess.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

// ChessDB (chessdb.cn) — free engine-analysis database.
// Returns moves ordered by engine score, which is exactly "theoretically best play."
const API = 'https://www.chessdb.cn/cdb.php';

const MAX_TOTAL_MOVES = 18;  // Hard cap — opening theory ends here for most lines
const DELAY_MS = 800;        // ms between API calls — respect rate limits
const SCORE_CUTOFF_CP = 75;  // Stop if position becomes this imbalanced (past opening theory)
const MIN_MOVES_SCORE_CUTOFF = 10; // Don't apply score cutoff before this many total moves
const MOVES_AFTER_CASTLING = 3; // Play this many more moves after either king castles

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChessDBMove {
  uci: string;
  san: string;
  score: number;   // engine centipawn score
  rank: number;
  note?: string;
}

interface ChessDBResponse {
  status: 'ok' | 'unknown' | 'nobestmove';
  moves?: ChessDBMove[];
}

interface LineConfig {
  id: string;
  name: string;
  description?: string;
  startSans: string[]; // Defining moves for this variation
}

interface OpeningConfig {
  id: string;
  ecoCode: string;
  name: string;
  color: 'white' | 'black';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  description: string;
  tags: string[];
  lines: LineConfig[]; // First line = main line
}

// ─── Opening Definitions ──────────────────────────────────────────────────────
// Lines are ordered: first = main line (best theoretical play), rest = variations.
// startSans = the moves that define each specific variation.
// The script extends from each position following master-game popularity.

const OPENINGS: OpeningConfig[] = [
  {
    id: 'italian-game',
    ecoCode: 'C50',
    name: 'Italian Game',
    color: 'white',
    difficulty: 'beginner',
    description: 'One of the oldest openings in chess. White develops rapidly, targets the center, and aims the bishop at the vulnerable f7 square.',
    tags: ['e4', 'open-game', 'classical', 'beginner-friendly'],
    lines: [
      {
        id: 'italian-giuoco-piano',
        name: 'Giuoco Piano',
        description: 'The classical Italian — both sides develop naturally toward the center.',
        startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'],
      },
      {
        id: 'italian-two-knights',
        name: 'Two Knights Defense',
        description: "Black counterattacks with Nf6 instead of mirroring White's bishop.",
        startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'],
      },
      {
        id: 'italian-evans-gambit',
        name: 'Evans Gambit',
        description: 'White sacrifices a pawn on b4 for rapid development and attacking chances.',
        startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'],
      },
    ],
  },

  {
    id: 'ruy-lopez',
    ecoCode: 'C60',
    name: 'Ruy Lopez',
    color: 'white',
    difficulty: 'intermediate',
    description: 'The most classic of all openings. White pressures the e5 pawn indirectly and aims for long-term positional dominance.',
    tags: ['e4', 'open-game', 'classical', 'positional'],
    lines: [
      {
        id: 'ruy-morphy-closed',
        name: 'Closed Variation',
        description: "White retreats the bishop to a4 and castles. The main theoretical battleground.",
        startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'],
      },
      {
        id: 'ruy-berlin',
        name: 'Berlin Defense',
        description: "Rock-solid defense famously used by Magnus Carlsen to neutralize 1.e4.",
        startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'],
      },
      {
        id: 'ruy-exchange',
        name: 'Exchange Variation',
        description: "White captures on c6 early, doubling Black's pawns for a structural edge.",
        startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'],
      },
    ],
  },

  {
    id: 'sicilian-defense',
    ecoCode: 'B20',
    name: 'Sicilian Defense',
    color: 'black',
    difficulty: 'intermediate',
    description: 'The most popular response to 1.e4. Black fights for the center asymmetrically, leading to rich, complex positions.',
    tags: ['e4', 'semi-open', 'dynamic', 'popular', 'sharp'],
    lines: [
      {
        id: 'sicilian-najdorf',
        name: 'Najdorf Variation',
        description: 'The most popular and theoretically rich Sicilian. Favored by Fischer and Kasparov.',
        startSans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
      },
      {
        id: 'sicilian-dragon',
        name: 'Dragon Variation',
        description: "Black fianchettoes the bishop for a powerful long diagonal battery.",
        startSans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'],
      },
      {
        id: 'sicilian-classical',
        name: 'Classical Variation',
        description: 'Black plays Nc6 — solid and flexible development without early commitments.',
        startSans: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4'],
      },
    ],
  },

  {
    id: 'french-defense',
    ecoCode: 'C00',
    name: 'French Defense',
    color: 'black',
    difficulty: 'intermediate',
    description: 'Black builds a solid pawn chain and counterattacks the center. Leads to closed, strategic battles.',
    tags: ['e4', 'semi-open', 'solid', 'strategic'],
    lines: [
      {
        id: 'french-classical',
        name: 'Classical Variation',
        description: "Black develops the knight to f6, directly challenging White's center.",
        startSans: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6'],
      },
      {
        id: 'french-advance',
        name: 'Advance Variation',
        description: 'White advances e5 to gain space. Black immediately counterattacks with c5.',
        startSans: ['e4', 'e6', 'd4', 'd5', 'e5'],
      },
      {
        id: 'french-exchange',
        name: 'Exchange Variation',
        description: 'White exchanges on d5 for a symmetrical, quieter game.',
        startSans: ['e4', 'e6', 'd4', 'd5', 'exd5', 'exd5'],
      },
    ],
  },

  {
    id: 'caro-kann',
    ecoCode: 'B12',
    name: 'Caro-Kann Defense',
    color: 'black',
    difficulty: 'intermediate',
    description: 'A rock-solid response to 1.e4. Black establishes a strong pawn structure without locking in the light-squared bishop.',
    tags: ['e4', 'semi-open', 'solid', 'positional'],
    lines: [
      {
        id: 'caro-advance',
        name: 'Advance Variation',
        description: 'White gains space with e5. Black develops the bishop outside the pawn chain before it closes.',
        startSans: ['e4', 'c6', 'd4', 'd5', 'e5'],
      },
      {
        id: 'caro-classical',
        name: 'Classical Variation',
        description: 'Black exchanges on e4 and develops the bishop to f5 — the most principled response.',
        startSans: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4'],
      },
      {
        id: 'caro-exchange',
        name: 'Exchange Variation',
        description: 'Symmetrical pawn structure. White looks for a small edge in the endgame.',
        startSans: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'],
      },
    ],
  },

  {
    id: 'queens-gambit',
    ecoCode: 'D06',
    name: "Queen's Gambit",
    color: 'white',
    difficulty: 'intermediate',
    description: "White offers a pawn to seize central control. One of the oldest and most respected openings — used by world champions for over a century.",
    tags: ['d4', 'closed-game', 'classical', 'positional'],
    lines: [
      {
        id: 'qgd-main',
        name: "Queen's Gambit Declined",
        description: "Black declines with e6 — the most principled and solid response.",
        startSans: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'],
      },
      {
        id: 'slav-defense',
        name: 'Slav Defense',
        description: "Black supports d5 with c6 — avoids locking in the light-squared bishop.",
        startSans: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3'],
      },
      {
        id: 'qga',
        name: "Queen's Gambit Accepted",
        description: "Black accepts the pawn with dxc4, fighting for equality with active play.",
        startSans: ['d4', 'd5', 'c4', 'dxc4'],
      },
    ],
  },

  {
    id: 'london-system',
    ecoCode: 'D02',
    name: 'London System',
    color: 'white',
    difficulty: 'beginner',
    description: 'A simple, solid opening system White can use against almost anything. Develop the bishop to f4, support with e3, and build a strong center.',
    tags: ['d4', 'system', 'solid', 'beginner-friendly'],
    lines: [
      {
        id: 'london-main',
        name: 'Main Line',
        description: 'The standard London setup against 1...d5 and 1...Nf6.',
        startSans: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4'],
      },
      {
        id: 'london-vs-kid',
        name: "vs King's Indian Setup",
        description: "Black fianchettoes — White maintains the same solid setup.",
        startSans: ['d4', 'Nf6', 'Nf3', 'g6', 'Bf4'],
      },
      {
        id: 'london-vs-slav',
        name: 'vs Slav Setup',
        description: "Black plays c6 early — White's London structure handles it comfortably.",
        startSans: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'c6'],
      },
    ],
  },

  {
    id: 'kings-indian',
    ecoCode: 'E60',
    name: "King's Indian Defense",
    color: 'black',
    difficulty: 'intermediate',
    description: "Black allows White to build a large center, then attacks it dynamically. One of the sharpest and most complex openings.",
    tags: ['d4', 'indian-defense', 'dynamic', 'counterattack'],
    lines: [
      {
        id: 'kid-classical',
        name: 'Classical Variation',
        description: 'White plays Be2 — the most popular main line response.',
        startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2'],
      },
      {
        id: 'kid-saemisch',
        name: 'Sämisch Variation',
        description: 'White plays f3 to support the center aggressively, weakening the kingside.',
        startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f3'],
      },
      {
        id: 'kid-four-pawns',
        name: 'Four Pawns Attack',
        description: 'White grabs maximum center space. Black must counterattack immediately.',
        startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f4'],
      },
    ],
  },

  {
    id: 'vienna-game',
    ecoCode: 'C25',
    name: 'Vienna Game',
    color: 'white',
    difficulty: 'beginner',
    description: "A flexible opening where White develops the knight to c3 before committing the king's knight. Can lead to quiet or sharp play.",
    tags: ['e4', 'open-game', 'flexible', 'beginner-friendly'],
    lines: [
      {
        id: 'vienna-main',
        name: 'Main Line',
        description: "White plays Bc4 aiming for the center and f7.",
        startSans: ['e4', 'e5', 'Nc3', 'Nc6', 'Bc4'],
      },
      {
        id: 'vienna-gambit',
        name: 'Vienna Gambit',
        description: 'White plays f4 to immediately challenge the center.',
        startSans: ['e4', 'e5', 'Nc3', 'Nf6', 'f4'],
      },
      {
        id: 'vienna-mieses',
        name: 'Mieses Variation',
        description: 'White plays Nf3 for a quieter, more positional game.',
        startSans: ['e4', 'e5', 'Nc3', 'Nc6', 'Nf3'],
      },
    ],
  },

  {
    id: 'kings-gambit',
    ecoCode: 'C30',
    name: "King's Gambit",
    color: 'white',
    difficulty: 'intermediate',
    description: "One of the oldest and most aggressive openings. White sacrifices a pawn on move 2 for rapid development and a fierce kingside attack.",
    tags: ['e4', 'gambit', 'sharp', 'attacking', 'romantic'],
    lines: [
      {
        id: 'kga-accepted',
        name: "King's Gambit Accepted",
        description: "Black accepts the pawn — the sharpest and most principled reply.",
        startSans: ['e4', 'e5', 'f4', 'exf4'],
      },
      {
        id: 'kgd-falkbeer',
        name: 'Falkbeer Counter Gambit',
        description: "Black sacrifices a pawn for immediate counterplay with d5.",
        startSans: ['e4', 'e5', 'f4', 'd5'],
      },
      {
        id: 'kgd-classical',
        name: "King's Gambit Declined",
        description: "Black declines with Bc5 — solid and avoids the sharp gambit lines.",
        startSans: ['e4', 'e5', 'f4', 'Bc5'],
      },
    ],
  },
];

// ─── API + Chess Helpers ──────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchBestMoves(fen: string, attempt = 1): Promise<ChessDBMove[]> {
  await sleep(DELAY_MS);

  const url = `${API}?action=queryall&board=${encodeURIComponent(fen)}&json=1`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'FirstMove/1.0 (chess openings teaching app)' },
    });
  } catch {
    if (attempt <= 3) {
      console.log(`  Network error — retrying (${attempt}/3)...`);
      await sleep(3_000 * attempt);
      return fetchBestMoves(fen, attempt + 1);
    }
    throw new Error(`Network error after 3 attempts for FEN: ${fen}`);
  }

  if (res.status === 429) {
    console.log('  Rate limited — waiting 15s...');
    await sleep(15_000);
    return fetchBestMoves(fen, attempt);
  }
  if (!res.ok) throw new Error(`ChessDB API ${res.status} for FEN: ${fen}`);

  const data = await res.json() as ChessDBResponse;
  if (data.status !== 'ok' || !data.moves?.length) return [];

  return data.moves;
}

/** True once either king has left its starting square (castled or moved). */
function eitherKingLeft(chess: Chess): boolean {
  const whiteKingGone = chess.get('e1')?.type !== 'k';
  const blackKingGone = chess.get('e8')?.type !== 'k';
  return whiteKingGone || blackKingGone;
}

// ─── Line Builder ─────────────────────────────────────────────────────────────

async function buildLine(startSans: string[]): Promise<string[]> {
  const chess = new Chess();

  for (const san of startSans) {
    try {
      chess.move(san);
    } catch (e) {
      console.error(`  Invalid start move "${san}": ${e}`);
      return startSans;
    }
  }

  const sans = [...startSans];
  // Track castling that happens DURING extension (not in startSans)
  const kingAlreadyLeftAtStart = eitherKingLeft(chess);
  let castledDuringExtension = false;
  let movesAfterCastling = 0;

  while (sans.length < MAX_TOTAL_MOVES) {
    // Once either king leaves its starting square during extension, count down
    if (!kingAlreadyLeftAtStart && eitherKingLeft(chess)) {
      castledDuringExtension = true;
    }
    if (castledDuringExtension) {
      movesAfterCastling++;
      if (movesAfterCastling > MOVES_AFTER_CASTLING) {
        console.log(`  King castled — stopping after ${MOVES_AFTER_CASTLING} more moves`);
        break;
      }
    }

    const moves = await fetchBestMoves(chess.fen());
    if (!moves.length) {
      console.log(`  No engine moves at move ${sans.length} — stopping`);
      break;
    }

    const best = moves[0];

    // Stop if position becomes imbalanced (out of opening theory)
    if (sans.length >= MIN_MOVES_SCORE_CUTOFF && Math.abs(best.score) > SCORE_CUTOFF_CP) {
      console.log(`  Score ${best.score}cp at move ${sans.length} — out of theory, stopping`);
      break;
    }

    console.log(`  Move ${sans.length + 1}: ${best.san} (score: ${best.score})`);
    chess.move(best.san);
    sans.push(best.san);
  }

  return sans;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const results = [];

  for (const opening of OPENINGS) {
    console.log(`\n━━━ ${opening.name} ━━━`);
    const lines = [];

    for (const line of opening.lines) {
      console.log(`\n  Line: ${line.name}`);
      console.log(`  Start: ${line.startSans.join(' ')}`);

      const fullSans = await buildLine(line.startSans);
      console.log(`  → ${fullSans.length} moves total: ${fullSans.join(' ')}`);

      lines.push({
        id: line.id,
        name: line.name,
        description: line.description,
        sans: fullSans,
      });
    }

    results.push({
      id: opening.id,
      ecoCode: opening.ecoCode,
      name: opening.name,
      color: opening.color,
      difficulty: opening.difficulty,
      description: opening.description,
      tags: opening.tags,
      lines,
    });
  }

  const outputPath = path.join(outputDir, 'openings-fetched.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Written to ${outputPath}`);
  console.log('Review the output, then run: node scripts/apply-openings.js');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
