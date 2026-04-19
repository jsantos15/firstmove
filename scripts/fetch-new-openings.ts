/**
 * scripts/fetch-new-openings.ts
 *
 * Fetches engine lines for only the new openings not yet in openings-fetched.json,
 * then merges them in. Run this instead of fetch-openings.ts when adding new openings.
 *
 * Usage:
 *   npx tsx scripts/fetch-new-openings.ts
 */

import { Chess } from 'chess.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API = 'https://www.chessdb.cn/cdb.php';
const MAX_TOTAL_MOVES = 18;
const DELAY_MS = 800;
const SCORE_CUTOFF_CP = 75;
const MIN_MOVES_SCORE_CUTOFF = 10;
const MOVES_AFTER_CASTLING = 3;

interface ChessDBMove {
  uci: string;
  san: string;
  score: number;
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
  startSans: string[];
}

interface OpeningConfig {
  id: string;
  ecoCode: string;
  name: string;
  color: 'white' | 'black';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  description: string;
  tags: string[];
  lines: LineConfig[];
}

// ─── Only the NEW openings to fetch ──────────────────────────────────────────

const NEW_OPENINGS: OpeningConfig[] = [
  {
    id: 'ponziani-opening',
    ecoCode: 'C44',
    name: 'Ponziani Opening',
    color: 'white',
    difficulty: 'intermediate',
    description: "White plays c3 on move 3 to prepare d4 — a solid and tricky opening that avoids heavy theory while retaining good central play.",
    tags: ['e4', 'open-game', 'solid', 'trappy'],
    lines: [
      { id: 'ponziani-main', name: 'Main Line', description: "Black responds with d5, striking the center immediately — the most principled reply.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'c3', 'd5'] },
      { id: 'ponziani-nf6', name: 'Cozio Variation', description: "Black develops Nf6 — solid and classical.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'c3', 'Nf6', 'd4', 'exd4', 'e5', 'Ne4', 'cxd4'] },
      { id: 'ponziani-counter-gambit', name: 'Ponziani Counter-Gambit', description: "Black plays f5 — an aggressive counter sacrificing a pawn for active piece play.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'c3', 'f5', 'd4', 'fxe4', 'dxe5', 'exf3', 'Qxf3'] },
      { id: 'ponziani-steinitz', name: 'Steinitz Variation', description: "White plays d4 immediately — the most direct approach.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'c3', 'Nf6', 'd4', 'exd4', 'cxd4', 'd5', 'exd5'] },
    ],
  },

  {
    id: 'bishops-opening',
    ecoCode: 'C23',
    name: "Bishop's Opening",
    color: 'white',
    difficulty: 'beginner',
    description: "White develops the bishop to c4 before playing Nf3 — flexible and classical, often transposing to Italian or Vienna lines.",
    tags: ['e4', 'open-game', 'classical', 'flexible', 'beginner-friendly'],
    lines: [
      { id: 'bishops-classical', name: 'Classical Variation', description: "Black develops Nf6 — White plays d3 for a solid Italian-like structure.", startSans: ['e4', 'e5', 'Bc4', 'Nf6', 'd3', 'Nc6', 'Nf3', 'Bc5', 'O-O'] },
      { id: 'bishops-berlin', name: 'Berlin Defense', description: "Black plays Bc5 — a symmetrical mirror setup.", startSans: ['e4', 'e5', 'Bc4', 'Bc5', 'Nf3', 'Nf6', 'Nc3', 'Nc6', 'd3'] },
      { id: 'bishops-urusov', name: 'Urusov Gambit', description: "White plays d4 — a sharp gambit offering a pawn for rapid development.", startSans: ['e4', 'e5', 'Bc4', 'Nf6', 'd4', 'exd4', 'Nf3', 'Nxe4', 'Qxd4'] },
      { id: 'bishops-vienna', name: 'Vienna Transposition', description: "White plays Nc3 — transposing into Vienna Game territory.", startSans: ['e4', 'e5', 'Bc4', 'Nc6', 'Nc3', 'Nf6', 'd3', 'Bc5', 'Bg5'] },
    ],
  },

  {
    id: 'philidor-defense',
    ecoCode: 'C41',
    name: 'Philidor Defense',
    color: 'black',
    difficulty: 'beginner',
    description: "Black plays d6 to support e5 — solid and straightforward. Popular with beginners and as a surprise weapon at higher levels.",
    tags: ['e4', 'open-game', 'solid', 'beginner-friendly'],
    lines: [
      { id: 'philidor-main', name: 'Main Line', description: "White opens the center with d4 — Black develops actively with Nf6.", startSans: ['e4', 'e5', 'Nf3', 'd6', 'd4', 'Nf6', 'Nc3', 'exd4', 'Nxd4', 'Be7'] },
      { id: 'philidor-hanham', name: 'Hanham Variation', description: "Black develops Nd7 instead of Nf6 — solid and compact.", startSans: ['e4', 'e5', 'Nf3', 'd6', 'd4', 'Nd7', 'Bc4', 'Be7', 'O-O', 'Ngf6', 'Re1'] },
      { id: 'philidor-exchange', name: 'Exchange Variation', description: "White exchanges on e5 for a small structural edge.", startSans: ['e4', 'e5', 'Nf3', 'd6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nc3', 'Be7', 'Bc4'] },
      { id: 'philidor-counter-gambit', name: 'Philidor Counter-Gambit', description: "Black plays f5 — an aggressive gambit sacrificing central control for piece activity.", startSans: ['e4', 'e5', 'Nf3', 'd6', 'd4', 'f5', 'Nc3', 'fxe4', 'Nxe4', 'd5', 'Nxe5'] },
    ],
  },

  {
    id: 'alekhine-defense',
    ecoCode: 'B02',
    name: "Alekhine's Defense",
    color: 'black',
    difficulty: 'advanced',
    description: "Black plays Nf6 on move 1 — inviting White to chase the knight and overextend. A hypermodern provocation named after World Champion Alexander Alekhine.",
    tags: ['e4', 'hypermodern', 'dynamic', 'counterattack', 'advanced'],
    lines: [
      { id: 'alekhine-modern', name: 'Modern Variation', description: "White plays Nf3 — the most principled response, developing naturally.", startSans: ['e4', 'Nf6', 'e5', 'Nd5', 'd4', 'd6', 'Nf3', 'dxe5', 'Nxe5', 'g6', 'Bc4'] },
      { id: 'alekhine-four-pawns', name: 'Four Pawns Attack', description: "White advances four pawns to build a massive center — the most aggressive response.", startSans: ['e4', 'Nf6', 'e5', 'Nd5', 'd4', 'd6', 'c4', 'Nb6', 'f4', 'dxe5', 'fxe5', 'Nc6'] },
      { id: 'alekhine-exchange', name: 'Exchange Variation', description: "White exchanges on d6 — a quieter approach that gives Black an easy game.", startSans: ['e4', 'Nf6', 'e5', 'Nd5', 'd4', 'd6', 'exd6', 'cxd6', 'Nf3', 'Nf6', 'h3'] },
      { id: 'alekhine-two-pawns', name: 'Two Pawns Attack', description: "White plays c4, chasing the knight further — double-edged play.", startSans: ['e4', 'Nf6', 'e5', 'Nd5', 'c4', 'Nb6', 'c5', 'Nd5', 'Bc4', 'e6', 'Nf3'] },
    ],
  },

  {
    id: 'torre-attack',
    ecoCode: 'A46',
    name: 'Torre Attack',
    color: 'white',
    difficulty: 'beginner',
    description: "White pins the knight with Bg5 after Nf3 — a solid system that avoids heavy theory and creates early pressure on Black's position.",
    tags: ['d4', 'system', 'solid', 'beginner-friendly', 'attacking'],
    lines: [
      { id: 'torre-main', name: 'Main Line', description: "Black plays e6 — White builds a solid setup with Nbd2 and e3.", startSans: ['d4', 'Nf6', 'Nf3', 'e6', 'Bg5', 'Be7', 'Nbd2', 'd5', 'e3', 'O-O', 'Bd3'] },
      { id: 'torre-vs-kid', name: "vs King's Indian Setup", description: "Black fianchettoes — White maintains the Torre system aggressively.", startSans: ['d4', 'Nf6', 'Nf3', 'g6', 'Bg5', 'Bg7', 'Nbd2', 'd6', 'e4', 'O-O', 'Bc4'] },
      { id: 'torre-vs-c5', name: 'vs c5 Variation', description: "Black plays c5 to challenge the center — White maintains pressure with c3.", startSans: ['d4', 'Nf6', 'Nf3', 'e6', 'Bg5', 'c5', 'c3', 'b6', 'Nbd2', 'Bb7', 'e3'] },
    ],
  },

  {
    id: 'old-indian-defense',
    ecoCode: 'A53',
    name: 'Old Indian Defense',
    color: 'black',
    difficulty: 'intermediate',
    description: "Black plays d6 and Nf6 without fianchettoing — a solid setup related to the King's Indian but without the long diagonal bishop.",
    tags: ['d4', 'indian-defense', 'solid', 'classical'],
    lines: [
      { id: 'old-indian-main', name: 'Main Line', description: "White builds the center with c4 and Nc3 — Black solidifies with e5.", startSans: ['d4', 'Nf6', 'c4', 'd6', 'Nc3', 'Nbd7', 'e4', 'e5', 'Nf3', 'Be7', 'Be2', 'O-O'] },
      { id: 'old-indian-ukrainian', name: 'Ukrainian Variation', description: "Black plays g6 — combining Old Indian structure with a fianchetto.", startSans: ['d4', 'Nf6', 'c4', 'd6', 'Nc3', 'e5', 'Nf3', 'Nbd7', 'g3', 'g6', 'Bg2', 'Bg7'] },
      { id: 'old-indian-two-knights', name: 'Two Knights Variation', description: "White plays Nf3 early — a flexible developing approach.", startSans: ['d4', 'Nf6', 'c4', 'd6', 'Nf3', 'Nbd7', 'Nc3', 'e5', 'e4', 'Be7', 'Be2'] },
    ],
  },

  {
    id: 'bogoljubov-indian',
    ecoCode: 'E11',
    name: 'Bogoljubov-Indian Defense',
    color: 'black',
    difficulty: 'advanced',
    description: "Black plays Bb4+ to check the king — a clever move that forces White to block with the bishop or knight, gaining a tempo.",
    tags: ['d4', 'indian-defense', 'classical', 'positional'],
    lines: [
      { id: 'bogo-main', name: 'Main Line', description: "White blocks with Bd2 — the most solid response, leading to a double bishop endgame.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'Bb4+', 'Bd2', 'Bxd2+', 'Qxd2', 'O-O', 'Nc3', 'd5'] },
      { id: 'bogo-nimzowitsch', name: 'Nimzowitsch Variation', description: "White blocks with Nbd2 — a more flexible setup.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'Bb4+', 'Nbd2', 'b6', 'e3', 'Bb7', 'Bd3', 'O-O'] },
      { id: 'bogo-exchange', name: 'Exchange Variation', description: "White plays Nc3 — transposing toward Nimzo-Indian territory.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'Bb4+', 'Nc3', 'Ne4', 'Qc2', 'Nxc3', 'bxc3', 'Be7'] },
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

function eitherKingLeft(chess: Chess): boolean {
  const whiteKingGone = chess.get('e1')?.type !== 'k';
  const blackKingGone = chess.get('e8')?.type !== 'k';
  return whiteKingGone || blackKingGone;
}

async function buildLine(startSans: string[]): Promise<string[]> {
  const chess = new Chess();
  for (const san of startSans) {
    try { chess.move(san); }
    catch (e) {
      console.error(`  Invalid start move "${san}": ${e}`);
      return startSans;
    }
  }
  const sans = [...startSans];
  const kingAlreadyLeftAtStart = eitherKingLeft(chess);
  let castledDuringExtension = false;
  let movesAfterCastling = 0;

  while (sans.length < MAX_TOTAL_MOVES) {
    if (!kingAlreadyLeftAtStart && eitherKingLeft(chess)) castledDuringExtension = true;
    if (castledDuringExtension) {
      movesAfterCastling++;
      if (movesAfterCastling > MOVES_AFTER_CASTLING) {
        console.log(`  King castled — stopping after ${MOVES_AFTER_CASTLING} more moves`);
        break;
      }
    }
    const moves = await fetchBestMoves(chess.fen());
    if (!moves.length) { console.log(`  No engine moves at move ${sans.length} — stopping`); break; }
    const best = moves[0];
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
  const outputPath = path.join(__dirname, 'output', 'openings-fetched.json');
  const existing: any[] = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
  const existingIds = new Set(existing.map((o: any) => o.id));

  const toFetch = NEW_OPENINGS.filter(o => !existingIds.has(o.id));
  if (toFetch.length === 0) {
    console.log('All new openings already in JSON — nothing to fetch.');
    return;
  }
  console.log(`Fetching ${toFetch.length} new openings...`);

  for (const opening of toFetch) {
    console.log(`\n━━━ ${opening.name} ━━━`);
    const lines = [];
    for (const line of opening.lines) {
      console.log(`\n  Line: ${line.name}`);
      console.log(`  Start: ${line.startSans.join(' ')}`);
      const fullSans = await buildLine(line.startSans);
      console.log(`  → ${fullSans.length} moves total: ${fullSans.join(' ')}`);
      lines.push({ id: line.id, name: line.name, description: line.description, sans: fullSans });
    }
    existing.push({
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

  fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));
  console.log(`\n✓ Merged into ${outputPath}`);
  console.log(`  ${existing.length} openings total`);
  console.log('Now run: npx tsx scripts/apply-openings.ts');
}

main().catch(err => { console.error(err); process.exit(1); });
