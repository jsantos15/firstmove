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
// The script extends from each position following engine best-play.

const OPENINGS: OpeningConfig[] = [

  // ═══════════════════════════════════════════════════════════
  // 1.e4 OPENINGS — WHITE
  // ═══════════════════════════════════════════════════════════

  {
    id: 'italian-game',
    ecoCode: 'C50',
    name: 'Italian Game',
    color: 'white',
    difficulty: 'beginner',
    description: 'One of the oldest openings in chess. White develops rapidly, targets the center, and aims the bishop at the vulnerable f7 square.',
    tags: ['e4', 'open-game', 'classical', 'beginner-friendly'],
    lines: [
      { id: 'italian-giuoco-piano', name: 'Giuoco Piano', description: 'Both sides develop naturally. White plans c3/d4 to challenge the center.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'] },
      { id: 'italian-pianissimo', name: 'Giuoco Pianissimo', description: 'White plays d3 for a slow, maneuvering game without the immediate c3/d4 pawn thrust.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3'] },
      { id: 'italian-two-knights', name: 'Two Knights Defense', description: 'Black counterattacks with Nf6 instead of mirroring the bishop.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'] },
      { id: 'italian-fried-liver', name: 'Fried Liver Attack', description: 'White sacrifices a knight on f7 for a ferocious kingside attack.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7'] },
      { id: 'italian-traxler', name: 'Traxler Counter-Attack', description: 'Black ignores the Ng5 threat and counter-attacks with Bc5, offering a piece.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'Bc5'] },
      { id: 'italian-evans-gambit', name: 'Evans Gambit', description: 'White sacrifices a pawn on b4 for rapid development and a powerful attack.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'] },
      { id: 'italian-hungarian', name: 'Hungarian Defense', description: 'Black plays Be7 — solid and unpretentious, avoiding sharp theoretical battles.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Be7'] },
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
      { id: 'ruy-berlin', name: 'Berlin Defense', description: "Rock-solid defense used by Magnus Carlsen to neutralize 1.e4. Leads to an endgame where Black holds comfortably.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'] },
      { id: 'ruy-morphy-closed', name: 'Closed Variation', description: 'The main theoretical battleground of the Ruy Lopez. White builds a strong center with c3/d4.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'] },
      { id: 'ruy-marshall', name: 'Marshall Attack', description: "Black sacrifices a pawn with d5 to launch a powerful kingside attack — one of the most daring gambits in chess.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'O-O', 'c3', 'd5'] },
      { id: 'ruy-open', name: 'Open Variation', description: "Black captures on e4 instead of castling — the sharpest and most active response.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Nxe4', 'd4', 'b5', 'Bb3', 'd5'] },
      { id: 'ruy-exchange', name: 'Exchange Variation', description: "White captures on c6 early, doubling Black's pawns for a structural edge.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'] },
      { id: 'ruy-schliemann', name: 'Schliemann Gambit', description: 'Black counter-attacks immediately with f5, sacrificing material for active play.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'f5'] },
      { id: 'ruy-steinitz', name: 'Steinitz Defense', description: 'Black supports e5 with d6 — solid but passive.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'd6'] },
      { id: 'ruy-classical', name: 'Classical Defense', description: 'Black develops Bc5, mirroring White, leading to symmetrical tension.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Bc5'] },
    ],
  },

  {
    id: 'scotch-game',
    ecoCode: 'C44',
    name: 'Scotch Game',
    color: 'white',
    difficulty: 'intermediate',
    description: 'White immediately opens the center with d4 on move 3. Popularized by Kasparov in the 1990s as an alternative to the Ruy Lopez.',
    tags: ['e4', 'open-game', 'classical', 'dynamic'],
    lines: [
      { id: 'scotch-classical', name: 'Classical Variation', description: "Black develops the bishop to c5 — the main theoretical response.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Bc5'] },
      { id: 'scotch-mieses', name: 'Mieses Variation', description: "Black plays Nf6 — the most popular modern response.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nxc6'] },
      { id: 'scotch-four-knights', name: "Four Knights Variation", description: "Both sides develop knights, leading to a balanced position.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nc3'] },
      { id: 'scotch-gambit', name: 'Scotch Gambit', description: 'White plays Bc4 instead of recapturing, launching an aggressive gambit.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Bc4'] },
      { id: 'scotch-steinitz', name: 'Steinitz Variation', description: 'Black plays Qh4 — an active but double-edged counter.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Qh4'] },
    ],
  },

  {
    id: 'vienna-game',
    ecoCode: 'C25',
    name: 'Vienna Game',
    color: 'white',
    difficulty: 'beginner',
    description: "White develops Nc3 before committing the king's knight. Flexible — can lead to quiet positional or sharp gambit play.",
    tags: ['e4', 'open-game', 'flexible', 'beginner-friendly'],
    lines: [
      { id: 'vienna-main', name: 'Main Line', description: "White plays Bc4 aiming for the center and f7.", startSans: ['e4', 'e5', 'Nc3', 'Nc6', 'Bc4'] },
      { id: 'vienna-gambit', name: 'Vienna Gambit', description: 'White plays f4 to immediately challenge the center.', startSans: ['e4', 'e5', 'Nc3', 'Nf6', 'f4'] },
      { id: 'vienna-mieses', name: 'Mieses Variation', description: 'White plays Nf3 for a quieter, more positional game.', startSans: ['e4', 'e5', 'Nc3', 'Nc6', 'Nf3'] },
      { id: 'vienna-frankenstein', name: 'Frankenstein-Dracula Variation', description: 'Black captures on e4 with the knight, leading to wild and complex complications.', startSans: ['e4', 'e5', 'Nc3', 'Nf6', 'Bc4', 'Nxe4', 'Qh5', 'Nd6'] },
    ],
  },

  {
    id: 'four-knights-game',
    ecoCode: 'C46',
    name: 'Four Knights Game',
    color: 'white',
    difficulty: 'beginner',
    description: 'Both sides develop all four knights before committing pawns. One of the most classical and symmetrical openings.',
    tags: ['e4', 'open-game', 'classical', 'beginner-friendly'],
    lines: [
      { id: 'four-knights-spanish', name: 'Spanish Variation', description: 'White plays Bb5 — the main theoretical line, leading to rich middlegames.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'Bb5'] },
      { id: 'four-knights-italian', name: 'Italian Variation', description: 'White plays Bc4 — a quieter, classical approach.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'Bc4'] },
      { id: 'four-knights-scotch', name: 'Scotch Variation', description: 'White plays d4, entering Scotch-like complications with four knights developed.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'd4', 'exd4', 'Nxd4'] },
      { id: 'four-knights-halloween', name: 'Halloween Gambit', description: 'White sacrifices a knight on e5 for two pawns and a dangerous pawn roller.', startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'Nxe5'] },
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
      { id: 'kga-accepted', name: "King's Gambit Accepted", description: "Black accepts the pawn — the sharpest and most principled reply.", startSans: ['e4', 'e5', 'f4', 'exf4', 'Nf3'] },
      { id: 'kga-fischer', name: 'Fischer Defense', description: "Bobby Fischer's recommendation: d6 followed by g5, holding the pawn.", startSans: ['e4', 'e5', 'f4', 'exf4', 'Nf3', 'd6'] },
      { id: 'kga-muzio', name: 'Muzio Gambit', description: 'White sacrifices the knight on f3 with O-O for a ferocious attack.', startSans: ['e4', 'e5', 'f4', 'exf4', 'Nf3', 'g5', 'Bc4', 'g4', 'O-O'] },
      { id: 'kga-bishops', name: "Bishop's Gambit", description: 'White plays Bc4 instead of Nf3, a different attacking setup.', startSans: ['e4', 'e5', 'f4', 'exf4', 'Bc4'] },
      { id: 'kgd-falkbeer', name: 'Falkbeer Counter Gambit', description: "Black sacrifices a pawn for immediate counterplay with d5.", startSans: ['e4', 'e5', 'f4', 'd5'] },
      { id: 'kgd-classical', name: "King's Gambit Declined", description: "Black declines with Bc5 — solid and avoids the sharp gambit lines.", startSans: ['e4', 'e5', 'f4', 'Bc5'] },
    ],
  },

  {
    id: 'kings-indian-attack',
    ecoCode: 'A07',
    name: "King's Indian Attack",
    color: 'white',
    difficulty: 'beginner',
    description: "White builds a solid fianchetto system with Nf3, g3, Bg2, d3. Can be used against almost any Black setup.",
    tags: ['system', 'solid', 'beginner-friendly', 'flexible'],
    lines: [
      { id: 'kia-vs-french', name: 'vs French Setup', description: "Against 1...e6 2...d5 — White builds the KIA system and targets the kingside.", startSans: ['e4', 'e6', 'd3', 'd5', 'Nd2', 'Nf6', 'Ngf3', 'Be7', 'g3', 'c5', 'Bg2'] },
      { id: 'kia-vs-sicilian', name: 'vs Sicilian Setup', description: "Against 1...c5 — White fianchettoes and prepares a kingside attack.", startSans: ['e4', 'c5', 'Nf3', 'e6', 'g3', 'Nc6', 'Bg2', 'd6', 'O-O', 'Nf6', 'd3'] },
      { id: 'kia-main', name: 'Main Setup', description: "White plays Nf3-g3-Bg2-O-O-d3-Nbd2 — a universal solid system.", startSans: ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2', 'e6', 'O-O', 'Be7', 'd3', 'O-O', 'Nbd2'] },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 1.e4 DEFENSES — BLACK
  // ═══════════════════════════════════════════════════════════

  {
    id: 'sicilian-defense',
    ecoCode: 'B20',
    name: 'Sicilian Defense',
    color: 'black',
    difficulty: 'intermediate',
    description: 'The most popular response to 1.e4. Black fights for the center asymmetrically, leading to rich, complex positions with winning chances for both sides.',
    tags: ['e4', 'semi-open', 'dynamic', 'popular', 'sharp'],
    lines: [
      { id: 'sicilian-najdorf', name: 'Najdorf Variation', description: 'The most popular and theoretically rich Sicilian. Favored by Fischer and Kasparov.', startSans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'] },
      { id: 'sicilian-dragon', name: 'Dragon Variation', description: "Black fianchettoes the bishop for a powerful long diagonal battery.", startSans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'] },
      { id: 'sicilian-scheveningen', name: 'Scheveningen Variation', description: 'Black plays e6 — flexible and solid, allowing many setups.', startSans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e6'] },
      { id: 'sicilian-classical', name: 'Classical Variation', description: 'Black plays Nc6 — solid and flexible development without early commitments.', startSans: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4'] },
      { id: 'sicilian-sveshnikov', name: 'Sveshnikov Variation', description: 'Black plays e5 to challenge the center immediately, accepting a backward d-pawn for active piece play.', startSans: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5', 'Ndb5', 'd6'] },
      { id: 'sicilian-kan', name: 'Kan Variation', description: 'Black plays a6 — flexible, avoiding commitments and preparing e5 or d5.', startSans: ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'a6'] },
      { id: 'sicilian-taimanov', name: 'Taimanov Variation', description: 'Black plays Nc6 and e6 — solid and flexible, combining features of several systems.', startSans: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'e6'] },
      { id: 'sicilian-accelerated-dragon', name: 'Accelerated Dragon', description: "Black fianchettoes with g6 without playing d6 first, avoiding the Yugoslav Attack.", startSans: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6'] },
      { id: 'sicilian-alapin', name: 'Alapin Variation', description: "White plays c3 to support a d4 pawn center — sidesteps heavy theory.", startSans: ['e4', 'c5', 'c3', 'd5', 'exd5', 'Qxd5', 'Nf3'] },
      { id: 'sicilian-grand-prix', name: 'Grand Prix Attack', description: 'White plays Nc3 and f4 for an aggressive kingside attack without playing d4.', startSans: ['e4', 'c5', 'Nc3', 'Nc6', 'f4', 'd6', 'Nf3', 'g6', 'Bb5'] },
      { id: 'sicilian-closed', name: 'Closed Sicilian', description: "White plays g3 and Bg2 without d4 — a quiet system avoiding all Sicilian theory.", startSans: ['e4', 'c5', 'Nc3', 'Nc6', 'g3', 'g6', 'Bg2', 'Bg7', 'Nge2'] },
    ],
  },

  {
    id: 'french-defense',
    ecoCode: 'C00',
    name: 'French Defense',
    color: 'black',
    difficulty: 'intermediate',
    description: 'Black builds a solid pawn chain and counterattacks the center. Leads to closed, strategic battles where Black is never clearly worse.',
    tags: ['e4', 'semi-open', 'solid', 'strategic'],
    lines: [
      { id: 'french-classical', name: 'Classical Variation', description: "Black develops Nf6, directly challenging White's center. White typically plays e5.", startSans: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6'] },
      { id: 'french-winawer', name: 'Winawer Variation', description: 'Black pins the knight with Bb4 — creates imbalanced, double-edged positions.', startSans: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4'] },
      { id: 'french-tarrasch', name: 'Tarrasch Variation', description: 'White plays Nd2 instead of Nc3 — avoids the pin but loses some central influence.', startSans: ['e4', 'e6', 'd4', 'd5', 'Nd2', 'Nf6', 'e5', 'Nfd7', 'Bd3', 'c5'] },
      { id: 'french-advance', name: 'Advance Variation', description: 'White advances e5 to gain space. Black immediately counterattacks with c5.', startSans: ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3'] },
      { id: 'french-exchange', name: 'Exchange Variation', description: 'White exchanges on d5 for a symmetrical, quieter game.', startSans: ['e4', 'e6', 'd4', 'd5', 'exd5', 'exd5', 'Nf3'] },
      { id: 'french-rubinstein', name: 'Rubinstein Variation', description: "Black exchanges on e4 — gives up the pawn center for easy development.", startSans: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nd7'] },
    ],
  },

  {
    id: 'caro-kann',
    ecoCode: 'B15',
    name: 'Caro-Kann Defense',
    color: 'black',
    difficulty: 'intermediate',
    description: 'A rock-solid response to 1.e4. Black establishes a strong pawn structure without locking in the light-squared bishop.',
    tags: ['e4', 'semi-open', 'solid', 'positional'],
    lines: [
      { id: 'caro-classical', name: 'Classical Variation', description: "Black exchanges on e4 and develops the bishop to f5 — the most principled response.", startSans: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'] },
      { id: 'caro-advance', name: 'Advance Variation', description: 'White gains space with e5. Black develops the bishop outside the pawn chain before it closes.', startSans: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'c3', 'e6', 'Nf3'] },
      { id: 'caro-panov', name: 'Panov-Botvinnik Attack', description: 'White plays c4 after the exchange — an aggressive attempt to unbalance the game.', startSans: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'c4', 'Nf6', 'Nc3'] },
      { id: 'caro-exchange', name: 'Exchange Variation', description: 'Symmetrical pawn structure. White looks for a small edge in the endgame.', startSans: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'Bd3', 'Nc6', 'c3'] },
      { id: 'caro-fantasy', name: 'Fantasy Variation', description: 'White plays f3 — an aggressive, non-standard try that leads to sharp play.', startSans: ['e4', 'c6', 'd4', 'd5', 'f3'] },
    ],
  },

  {
    id: 'petrov-defense',
    ecoCode: 'C42',
    name: 'Petrov Defense',
    color: 'black',
    difficulty: 'intermediate',
    description: "One of the most solid and drawish defenses to 1.e4. Black mirrors White's knight development and achieves quick equality.",
    tags: ['e4', 'open-game', 'solid', 'symmetrical'],
    lines: [
      { id: 'petrov-classical', name: 'Classical Attack', description: "White plays Nxe5 — the main line. Black must recapture correctly.", startSans: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'd6', 'Nf3', 'Nxe4', 'd4'] },
      { id: 'petrov-three-knights', name: 'Three Knights Variation', description: 'White develops Nc3, fighting for the center more aggressively.', startSans: ['e4', 'e5', 'Nf3', 'Nf6', 'Nc3', 'Nc6', 'd4'] },
      { id: 'petrov-modern', name: 'Modern Attack', description: "White plays d4 immediately — the most ambitious try for an advantage.", startSans: ['e4', 'e5', 'Nf3', 'Nf6', 'd4', 'exd4', 'e5', 'Ne4', 'Qxd4'] },
      { id: 'petrov-stafford', name: 'Stafford Gambit', description: "Black counter-attacks with Nc6 instead of d6 — a dangerous gambit with many traps.", startSans: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'Nc6', 'Nxc6', 'dxc6', 'd3'] },
    ],
  },

  {
    id: 'scandinavian-defense',
    ecoCode: 'B01',
    name: 'Scandinavian Defense',
    color: 'black',
    difficulty: 'beginner',
    description: "Black immediately challenges White's e-pawn with d5 on move 1. One of the oldest recorded openings.",
    tags: ['e4', 'semi-open', 'direct', 'beginner-friendly'],
    lines: [
      { id: 'scand-main', name: 'Main Line', description: "Black recaptures with the queen on d5 and repositions to a5 — the classical approach.", startSans: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'Nf3', 'Nf6', 'd4'] },
      { id: 'scand-modern', name: 'Modern Variation', description: "Black retreats the queen to d6 — less exposed and more flexible than Qa5.", startSans: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qd6', 'Nf3', 'Nf6', 'd4', 'c6'] },
      { id: 'scand-mieses', name: 'Mieses-Kotrč Variation', description: "Black develops Nf6 without recapturing immediately — accepts a pawn deficit for activity.", startSans: ['e4', 'd5', 'exd5', 'Nf6', 'd4', 'Nxd5', 'Nf3', 'g6', 'c4', 'Nb6'] },
      { id: 'scand-icelandic', name: 'Icelandic Gambit', description: 'Black plays e6, sacrificing the pawn back for rapid development after c4.', startSans: ['e4', 'd5', 'exd5', 'Nf6', 'c4', 'e6', 'dxe6', 'Bxe6'] },
    ],
  },

  {
    id: 'pirc-defense',
    ecoCode: 'B07',
    name: 'Pirc Defense',
    color: 'black',
    difficulty: 'intermediate',
    description: "Black allows White to build a large pawn center, then attacks it with pieces. A hypermodern defense.",
    tags: ['e4', 'hypermodern', 'dynamic', 'counterattack'],
    lines: [
      { id: 'pirc-classical', name: 'Classical System', description: "White plays Be2 — solid development without overextending.", startSans: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Nf3', 'Bg7', 'Be2', 'O-O', 'O-O'] },
      { id: 'pirc-austrian', name: 'Austrian Attack', description: 'White plays f4 for an aggressive space-grabbing attack.', startSans: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'f4', 'Bg7', 'Nf3', 'O-O'] },
      { id: 'pirc-150', name: '150 Attack', description: 'White plays Be3, Qd2, and O-O-O for a direct queenside castle and opposite-side attack.', startSans: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'Bg7', 'Qd2', 'O-O', 'O-O-O'] },
      { id: 'pirc-byrne', name: 'Byrne Variation', description: 'White plays Bg5 — an interesting alternative that pins the knight.', startSans: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Bg5', 'Bg7', 'Qd2', 'Nc6'] },
    ],
  },

  {
    id: 'modern-defense',
    ecoCode: 'B06',
    name: 'Modern Defense',
    color: 'black',
    difficulty: 'intermediate',
    description: "Black plays g6 and Bg7 without playing d6 immediately — a flexible hypermodern setup.",
    tags: ['e4', 'hypermodern', 'flexible', 'dynamic'],
    lines: [
      { id: 'modern-main', name: 'Main Line', description: "White builds the center with d4 and Nc3, Black fianchettoes and waits.", startSans: ['e4', 'g6', 'd4', 'Bg7', 'Nc3', 'd6', 'Nf3', 'Nf6', 'Be2', 'O-O'] },
      { id: 'modern-averbakh', name: 'Averbakh System', description: 'White plays Be3 and Qd2 for a dangerous attacking setup.', startSans: ['e4', 'g6', 'd4', 'Bg7', 'Nc3', 'd6', 'Be3', 'Nf6', 'Qd2', 'O-O'] },
      { id: 'modern-pseudo-dragon', name: 'Pseudo-Dragon Variation', description: "Black plays c5 to challenge the center — transposes toward Sicilian Dragon ideas.", startSans: ['e4', 'g6', 'd4', 'Bg7', 'Nc3', 'c5', 'd5', 'Bxc3+', 'bxc3'] },
    ],
  },

  {
    id: 'latvian-gambit',
    ecoCode: 'C40',
    name: 'Latvian Gambit',
    color: 'black',
    difficulty: 'advanced',
    description: "Black plays f5 on move 2 to counter-attack immediately. Objectively dubious but full of tactical traps.",
    tags: ['e4', 'gambit', 'sharp', 'trappy', 'romantic'],
    lines: [
      { id: 'latvian-accepted', name: 'Accepted', description: "White accepts with Nxe5 — the main and most challenging response.", startSans: ['e4', 'e5', 'Nf3', 'f5', 'Nxe5', 'Qf6', 'Nc4', 'fxe4', 'Nc3'] },
      { id: 'latvian-greco', name: 'Greco Variation', description: "White plays Bc4 — a safe and solid response.", startSans: ['e4', 'e5', 'Nf3', 'f5', 'Bc4', 'fxe4', 'Nxe5', 'd5', 'Qh5+'] },
      { id: 'latvian-fraser', name: 'Fraser Variation', description: "White plays d4 — an aggressive central response.", startSans: ['e4', 'e5', 'Nf3', 'f5', 'Nxe5', 'Qf6', 'Nc4', 'fxe4', 'd4'] },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 1.d4 OPENINGS — WHITE
  // ═══════════════════════════════════════════════════════════

  {
    id: 'queens-gambit',
    ecoCode: 'D06',
    name: "Queen's Gambit",
    color: 'white',
    difficulty: 'intermediate',
    description: "White offers a pawn to seize central control. One of the oldest and most respected openings — used by world champions for over a century.",
    tags: ['d4', 'closed-game', 'classical', 'positional'],
    lines: [
      { id: 'qgd-main', name: "Queen's Gambit Declined", description: "Black declines with e6 — the most principled and solid response.", startSans: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5'] },
      { id: 'slav-defense', name: 'Slav Defense', description: "Black supports d5 with c6 — avoids locking in the light-squared bishop.", startSans: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3'] },
      { id: 'semi-slav', name: 'Semi-Slav Defense', description: "Black combines c6 and e6 — one of the richest theoretical systems in chess.", startSans: ['d4', 'd5', 'c4', 'c6', 'Nc3', 'Nf6', 'Nf3', 'e6'] },
      { id: 'qga', name: "Queen's Gambit Accepted", description: "Black accepts the pawn with dxc4, fighting for equality with active play.", startSans: ['d4', 'd5', 'c4', 'dxc4', 'Nf3', 'Nf6', 'e3'] },
      { id: 'chigorin-defense', name: 'Chigorin Defense', description: "Black develops Nc6 instead of a pawn — unconventional but rich in complications.", startSans: ['d4', 'd5', 'c4', 'Nc6', 'Nf3', 'Bg4'] },
      { id: 'cambridge-springs', name: 'Cambridge Springs Defense', description: "Black plays Qa5 to create pressure on c3 and a2 — a classical trap-laden variation.", startSans: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Nbd7', 'e3', 'c6', 'Nf3', 'Qa5'] },
      { id: 'qgd-tartakower', name: 'Tartakower Variation', description: "Black plays b6 to fianchetto the bishop — a flexible system popularized by Karpov.", startSans: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'Nf3', 'O-O', 'e3', 'b6'] },
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
      { id: 'london-main', name: 'Main Line', description: 'The standard London setup against 1...d5 and 1...Nf6.', startSans: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'e6', 'e3', 'Bd6'] },
      { id: 'london-vs-kid', name: "vs King's Indian Setup", description: "Black fianchettoes — White maintains the same solid setup.", startSans: ['d4', 'Nf6', 'Nf3', 'g6', 'Bf4', 'Bg7', 'e3', 'd6', 'Be2', 'O-O', 'O-O'] },
      { id: 'london-vs-slav', name: 'vs Slav Setup', description: "Black plays c6 early — White's London structure handles it comfortably.", startSans: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'c6', 'e3', 'Bf5', 'Nbd2'] },
      { id: 'london-barry', name: 'Barry Attack', description: "White plays Nc3 to support an aggressive f3 and e4 pawn advance.", startSans: ['d4', 'Nf6', 'Nf3', 'g6', 'Nc3', 'd5', 'Bf4', 'Bg7', 'e3', 'O-O', 'h3'] },
    ],
  },

  {
    id: 'colle-system',
    ecoCode: 'D05',
    name: 'Colle System',
    color: 'white',
    difficulty: 'beginner',
    description: 'White builds a solid pyramid with d4, Nf3, e3, Bd3 and launches a kingside attack. Ideal for beginners who want a safe, consistent setup.',
    tags: ['d4', 'system', 'solid', 'beginner-friendly', 'attacking'],
    lines: [
      { id: 'colle-koltanowski', name: 'Colle-Koltanowski', description: 'The standard Colle with c3 — White prepares a queenside break or kingside attack.', startSans: ['d4', 'd5', 'Nf3', 'Nf6', 'e3', 'e6', 'Bd3', 'c5', 'c3', 'Nc6', 'Nbd2'] },
      { id: 'colle-zukertort', name: 'Colle-Zukertort', description: "White plays b3 and Bb2 instead of c3 — a more dynamic bishop placement.", startSans: ['d4', 'd5', 'Nf3', 'Nf6', 'e3', 'e6', 'Bd3', 'Nbd7', 'O-O', 'b3', 'Bb2', 'c5'] },
      { id: 'colle-vs-kid', name: "vs King's Indian Setup", description: "Black fianchettoes — White maintains the Colle pyramid.", startSans: ['d4', 'Nf6', 'Nf3', 'g6', 'e3', 'Bg7', 'Bd3', 'd6', 'Nbd2', 'O-O', 'O-O'] },
    ],
  },

  {
    id: 'catalan-opening',
    ecoCode: 'E00',
    name: 'Catalan Opening',
    color: 'white',
    difficulty: 'advanced',
    description: "White combines the Queen's Gambit with a kingside fianchetto. The long diagonal bishop and central pressure create lasting positional pressure.",
    tags: ['d4', 'closed-game', 'positional', 'advanced'],
    lines: [
      { id: 'catalan-open', name: 'Open Catalan', description: "Black accepts with dxc4 — White regains it with long-term pressure.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'd5', 'g3', 'dxc4', 'Bg2', 'a6', 'Ne5'] },
      { id: 'catalan-closed', name: 'Closed Catalan', description: "Black keeps the center closed with Be7 — a solid, fortress-like setup.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'd5', 'g3', 'Be7', 'Bg2', 'O-O', 'O-O', 'dxc4'] },
      { id: 'catalan-anti', name: 'Anti-Catalan', description: "Black plays c5 to immediately challenge the center before White fianchettoes.", startSans: ['d4', 'd5', 'c4', 'e6', 'Nf3', 'Nf6', 'g3', 'c5'] },
    ],
  },

  {
    id: 'trompowsky-attack',
    ecoCode: 'A45',
    name: 'Trompowsky Attack',
    color: 'white',
    difficulty: 'intermediate',
    description: "White pins the knight on f6 immediately with Bg5 — sidesteps all Indian Defense theory.",
    tags: ['d4', 'attacking', 'dynamic', 'system'],
    lines: [
      { id: 'tromp-main', name: 'Main Line', description: "Black plays Ne4, attacking the bishop — the most principled response.", startSans: ['d4', 'Nf6', 'Bg5', 'Ne4', 'Bf4', 'c5', 'f3', 'Nf6', 'e4'] },
      { id: 'tromp-d5', name: 'd5 Variation', description: "Black plays d5 — solid, countering the center directly.", startSans: ['d4', 'Nf6', 'Bg5', 'd5', 'Bxf6', 'exf6', 'e3', 'c5'] },
      { id: 'tromp-e6', name: 'e6 Variation', description: "Black plays e6, ignoring the pin and developing solidly.", startSans: ['d4', 'Nf6', 'Bg5', 'e6', 'e4', 'h6', 'Bxf6', 'Qxf6', 'c3'] },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 1.d4 DEFENSES — BLACK
  // ═══════════════════════════════════════════════════════════

  {
    id: 'kings-indian',
    ecoCode: 'E60',
    name: "King's Indian Defense",
    color: 'black',
    difficulty: 'intermediate',
    description: "Black allows White to build a large center, then attacks it dynamically. One of the sharpest and most complex openings.",
    tags: ['d4', 'indian-defense', 'dynamic', 'counterattack'],
    lines: [
      { id: 'kid-classical', name: 'Classical Variation', description: 'White plays Be2 — the most popular main line response.', startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2'] },
      { id: 'kid-saemisch', name: 'Sämisch Variation', description: 'White plays f3 to support the center aggressively, weakening the kingside.', startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f3', 'O-O', 'Be3'] },
      { id: 'kid-four-pawns', name: 'Four Pawns Attack', description: 'White grabs maximum center space with e4 and f4. Black must counterattack immediately.', startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f4', 'O-O', 'Nf3'] },
      { id: 'kid-averbakh', name: 'Averbakh System', description: "White plays Bg5 and Qd2 for a positional squeeze.", startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Be2', 'O-O', 'Bg5'] },
      { id: 'kid-petrosian', name: 'Petrosian System', description: "White plays d5 to close the center and then attack on the queenside.", startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'd5', 'Ne7', 'Nd2'] },
      { id: 'kid-fianchetto', name: 'Fianchetto Variation', description: "White fianchettoes the bishop — a quieter alternative to e4.", startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nf3', 'Bg7', 'g3', 'O-O', 'Bg2', 'd6', 'Nc3'] },
    ],
  },

  {
    id: 'nimzo-indian',
    ecoCode: 'E20',
    name: 'Nimzo-Indian Defense',
    color: 'black',
    difficulty: 'advanced',
    description: "Black pins the knight with Bb4 — one of the most respected defenses to 1.d4. Favored by Fischer and Kasparov.",
    tags: ['d4', 'indian-defense', 'classical', 'positional'],
    lines: [
      { id: 'nimzo-classical', name: 'Classical Variation', description: "White plays Qc2 — the most popular modern response, avoiding the doubled pawns.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'Qc2', 'O-O', 'a3', 'Bxc3+', 'Qxc3'] },
      { id: 'nimzo-rubinstein', name: 'Rubinstein Variation', description: "White plays e3 — solid and reliable.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3', 'O-O', 'Bd3', 'd5', 'Nf3'] },
      { id: 'nimzo-saemisch', name: 'Sämisch Variation', description: "White plays a3 immediately, forcing Bxc3+ and doubling the pawns.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'a3', 'Bxc3+', 'bxc3', 'c5', 'e3'] },
      { id: 'nimzo-leningrad', name: 'Leningrad Variation', description: "White plays Bg5 — an aggressive pin-based approach.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'Bg5', 'h6', 'Bh4', 'c5', 'd5'] },
      { id: 'nimzo-three-knights', name: 'Three Knights Variation', description: "White plays Nf3 for a flexible, developing move.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'Nf3', 'O-O', 'Bg5', 'c5', 'e3'] },
    ],
  },

  {
    id: 'queens-indian',
    ecoCode: 'E12',
    name: "Queen's Indian Defense",
    color: 'black',
    difficulty: 'advanced',
    description: "Black plays b6 to fianchetto the bishop, controlling e4 without committing to d5 or e5.",
    tags: ['d4', 'indian-defense', 'classical', 'positional'],
    lines: [
      { id: 'qid-main', name: 'Main Line', description: "White fianchettoes with g3 — the main theoretical battleground.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6', 'g3', 'Bb7', 'Bg2', 'Be7', 'O-O'] },
      { id: 'qid-petrosian', name: 'Petrosian System', description: "White plays a3 to prevent Bb4+ — a solid positional approach.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6', 'a3', 'Bb7', 'Nc3', 'Ne4', 'Bd2'] },
      { id: 'qid-miles', name: 'Miles Variation', description: "Black plays Ba6 — an active approach, pressuring c4.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6', 'g3', 'Ba6', 'b3', 'Bb4+', 'Bd2', 'Be7'] },
      { id: 'qid-classical', name: 'Classical Variation', description: "Black plays Bb4+ to gain the bishop pair.", startSans: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6', 'Nc3', 'Bb7', 'a3', 'd5', 'cxd5', 'Nxd5'] },
    ],
  },

  {
    id: 'grunfeld-defense',
    ecoCode: 'D70',
    name: 'Grünfeld Defense',
    color: 'black',
    difficulty: 'advanced',
    description: "Black allows White to build a massive center with d4/c4/e4, then immediately attacks it. A hypermodern classic.",
    tags: ['d4', 'hypermodern', 'dynamic', 'counterattack'],
    lines: [
      { id: 'grunfeld-exchange', name: 'Exchange Variation', description: "White grabs the center with e4 — the sharpest and most theoretical line.", startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'cxd5', 'Nxd5', 'e4', 'Nxc3', 'bxc3', 'Bg7'] },
      { id: 'grunfeld-russian', name: 'Russian System', description: "White plays Qb3 — pressuring d5 and b7 simultaneously.", startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'Nf3', 'Bg7', 'Qb3', 'dxc4', 'Qxc4', 'O-O'] },
      { id: 'grunfeld-three-knights', name: 'Three Knights Variation', description: "White plays Nf3 — a quieter, more positional approach.", startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'Nf3', 'Bg7', 'Bg5'] },
      { id: 'grunfeld-hungarian', name: 'Hungarian Variation', description: "White plays Bg5 — pinning the knight before Black can fianchetto.", startSans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'Bg5', 'Ne4', 'Bh4', 'Nxc3'] },
    ],
  },

  {
    id: 'dutch-defense',
    ecoCode: 'A80',
    name: 'Dutch Defense',
    color: 'black',
    difficulty: 'intermediate',
    description: "Black plays f5 to control e4. An aggressive and unbalancing response to 1.d4.",
    tags: ['d4', 'attacking', 'unbalancing', 'counterattack'],
    lines: [
      { id: 'dutch-stonewall', name: 'Stonewall Variation', description: "Black builds a solid pawn fortress with e6/d5/c6 — strong but passive.", startSans: ['d4', 'f5', 'g3', 'Nf6', 'Bg2', 'e6', 'Nf3', 'd5', 'O-O', 'c6', 'c4'] },
      { id: 'dutch-leningrad', name: 'Leningrad Variation', description: "Black fianchettoes with g6 — creates an aggressive setup with long-term attacking chances.", startSans: ['d4', 'f5', 'g3', 'Nf6', 'Bg2', 'g6', 'Nf3', 'Bg7', 'O-O', 'O-O', 'c4', 'd6'] },
      { id: 'dutch-classical', name: 'Classical Variation', description: "Black plays e6 and Be7 — solid and classical.", startSans: ['d4', 'f5', 'g3', 'e6', 'Bg2', 'Nf6', 'Nf3', 'd5', 'O-O', 'Bd6'] },
      { id: 'dutch-staunton', name: 'Staunton Gambit', description: "White plays e4 immediately — an aggressive pawn sacrifice for rapid development.", startSans: ['d4', 'f5', 'e4', 'fxe4', 'Nc3', 'Nf6', 'Bg5', 'g6', 'f3'] },
    ],
  },

  {
    id: 'benoni-defense',
    ecoCode: 'A61',
    name: 'Benoni Defense',
    color: 'black',
    difficulty: 'advanced',
    description: "Black plays c5 and allows White to advance d5, creating a dynamic pawn structure with long-term attacking chances.",
    tags: ['d4', 'dynamic', 'unbalancing', 'counterattack'],
    lines: [
      { id: 'benoni-modern', name: 'Modern Benoni', description: "Black plays e6 to recapture — the main theoretical battleground.", startSans: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'e6', 'Nc3', 'exd5', 'cxd5', 'd6', 'Nf3', 'g6', 'Nd2'] },
      { id: 'benoni-czech', name: 'Czech Benoni', description: "Black plays e5 to completely block the position — a fortress-like setup.", startSans: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'e5', 'Nc3', 'd6', 'e4', 'Be7', 'Nf3'] },
      { id: 'benoni-taimanov', name: 'Taimanov Variation', description: "White plays f4 — an aggressive pawn advance for an immediate attack.", startSans: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'e6', 'Nc3', 'exd5', 'cxd5', 'd6', 'f4', 'g6', 'Nf3', 'Bg7'] },
    ],
  },

  {
    id: 'benko-gambit',
    ecoCode: 'A57',
    name: 'Benko Gambit',
    color: 'black',
    difficulty: 'intermediate',
    description: "Black sacrifices a pawn with b5 for long-term queenside pressure. Black gets excellent compensation in the endgame.",
    tags: ['d4', 'gambit', 'positional', 'queenside'],
    lines: [
      { id: 'benko-accepted', name: 'Fully Accepted', description: "White takes both pawns — Black gets powerful queenside pressure.", startSans: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'b5', 'cxb5', 'a6', 'bxa6', 'Bxa6', 'Nc3', 'g6'] },
      { id: 'benko-half-accepted', name: 'Half Accepted', description: "White accepts just the one pawn — a safer but still advantageous line.", startSans: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'b5', 'cxb5', 'a6', 'b6', 'Qxb6', 'Nc3'] },
      { id: 'benko-declined', name: 'Declined', description: "White declines the gambit with e4 or f3 — avoids the pressure.", startSans: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'b5', 'f3', 'e6', 'e4', 'exd5', 'exd5'] },
    ],
  },

  {
    id: 'albin-counter-gambit',
    ecoCode: 'D08',
    name: 'Albin Counter-Gambit',
    color: 'black',
    difficulty: 'intermediate',
    description: "Black sacrifices a pawn with e5 to create dangerous counterplay. Contains the famous Lasker Trap.",
    tags: ['d4', 'gambit', 'trappy', 'counterattack'],
    lines: [
      { id: 'albin-main', name: 'Main Line', description: "White accepts and Black pushes d4 for strong central counterplay.", startSans: ['d4', 'd5', 'c4', 'e5', 'dxe5', 'd4', 'Nf3', 'Nc6', 'g3', 'Nge7'] },
      { id: 'albin-lasker', name: 'Lasker Trap', description: "White tries e3 — Black unleashes Bb4+ and dxe3, a brilliant tactical sequence.", startSans: ['d4', 'd5', 'c4', 'e5', 'dxe5', 'd4', 'e3', 'Bb4+', 'Bd2', 'dxe3', 'Bxb4', 'exf2+', 'Ke2', 'fxg1=N+'] },
    ],
  },

  {
    id: 'budapest-gambit',
    ecoCode: 'A52',
    name: 'Budapest Gambit',
    color: 'black',
    difficulty: 'intermediate',
    description: "Black gambits a pawn with e5 after 2.c4 — a dangerous weapon full of traps for the unprepared.",
    tags: ['d4', 'gambit', 'trappy', 'counterattack'],
    lines: [
      { id: 'budapest-alekhine', name: 'Alekhine Variation', description: "Black plays Ng4 to recover the pawn with good piece activity.", startSans: ['d4', 'Nf6', 'c4', 'e5', 'dxe5', 'Ng4', 'Nf3', 'Bc5', 'e3', 'Nc6'] },
      { id: 'budapest-fajarowicz', name: 'Fajarowicz Variation', description: "Black plays Ne4 — an aggressive piece sacrifice for attacking chances.", startSans: ['d4', 'Nf6', 'c4', 'e5', 'dxe5', 'Ne4', 'a3', 'd6', 'exd6', 'Bxd6'] },
      { id: 'budapest-declined', name: 'Declined', description: "White declines with d5 — avoiding the gambit complications.", startSans: ['d4', 'Nf6', 'c4', 'e5', 'd5', 'Bc5', 'Nc3', 'O-O', 'e4'] },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // OTHER FIRST MOVES
  // ═══════════════════════════════════════════════════════════

  {
    id: 'english-opening',
    ecoCode: 'A10',
    name: 'English Opening',
    color: 'white',
    difficulty: 'advanced',
    description: "White plays c4 to control d5 without committing a central pawn. One of the most flexible openings, often transposing into d4 lines.",
    tags: ['c4', 'flank', 'positional', 'advanced'],
    lines: [
      { id: 'english-symmetrical', name: 'Symmetrical Variation', description: "Black mirrors with c5 — leads to rich, maneuvering battles.", startSans: ['c4', 'c5', 'Nf3', 'Nf6', 'Nc3', 'Nc6', 'g3', 'g6', 'Bg2', 'Bg7', 'O-O'] },
      { id: 'english-reversed-sicilian', name: 'Reversed Sicilian', description: "Black plays e5 — White gets a Sicilian with colors reversed.", startSans: ['c4', 'e5', 'Nc3', 'Nf6', 'Nf3', 'Nc6', 'g3', 'd5', 'cxd5', 'Nxd5'] },
      { id: 'english-kings-indian', name: "King's Indian Formation", description: "Black sets up a King's Indian structure — sharp counterattacking play.", startSans: ['c4', 'Nf6', 'Nc3', 'g6', 'g3', 'Bg7', 'Bg2', 'O-O', 'd3', 'd6', 'Nf3'] },
      { id: 'english-four-knights', name: 'Four Knights Variation', description: "Both sides develop knights — a symmetrical battle for center control.", startSans: ['c4', 'c5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'd4', 'cxd4', 'Nxd4', 'e6', 'g3'] },
    ],
  },

  {
    id: 'reti-opening',
    ecoCode: 'A04',
    name: 'Réti Opening',
    color: 'white',
    difficulty: 'advanced',
    description: "White plays Nf3, delaying d4 to keep flexibility. A hypermodern system where White attacks d5 from a distance.",
    tags: ['Nf3', 'hypermodern', 'positional', 'flexible'],
    lines: [
      { id: 'reti-main', name: 'Réti Gambit', description: "White plays c4, attacking d5 in hypermodern fashion.", startSans: ['Nf3', 'd5', 'c4', 'd4', 'b4', 'f6', 'e3'] },
      { id: 'reti-kia', name: "King's Indian Attack", description: "White fianchettoes with g3 and Bg2 — a universal attacking setup.", startSans: ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2', 'e6', 'O-O', 'Be7', 'd3', 'O-O', 'Nbd2', 'c5'] },
      { id: 'reti-anglo-grunfeld', name: 'Anglo-Grünfeld', description: "Black plays g6 and d5 — a Grünfeld-like structure from a Réti move order.", startSans: ['Nf3', 'Nf6', 'c4', 'g6', 'g3', 'd5', 'cxd5', 'Nxd5', 'Bg2', 'Bg7', 'O-O'] },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // GAMBITS
  // ═══════════════════════════════════════════════════════════

  {
    id: 'danish-gambit',
    ecoCode: 'C21',
    name: 'Danish Gambit',
    color: 'white',
    difficulty: 'intermediate',
    description: "White sacrifices two pawns for blistering development and a powerful attack. One of the most aggressive openings in chess.",
    tags: ['e4', 'gambit', 'attacking', 'sharp', 'romantic'],
    lines: [
      { id: 'danish-accepted', name: 'Accepted', description: "Black takes both pawns — White gets overwhelming development and attacking chances.", startSans: ['e4', 'e5', 'd4', 'exd4', 'c3', 'dxc3', 'Bc4', 'cxb2', 'Bxb2'] },
      { id: 'danish-schlechter', name: 'Schlechter Defense', description: "Black declines with d5 — the best defensive try.", startSans: ['e4', 'e5', 'd4', 'exd4', 'c3', 'd5', 'exd5', 'Qxd5', 'cxd4', 'Nc6'] },
      { id: 'danish-declined', name: 'Declined — d5', description: "Black plays d5 to return the pawn with a solid position.", startSans: ['e4', 'e5', 'd4', 'exd4', 'c3', 'dxc3', 'Nxc3', 'Nc6', 'Nf3', 'Bb4'] },
    ],
  },

  {
    id: 'goring-gambit',
    ecoCode: 'C44',
    name: 'Göring Gambit',
    color: 'white',
    difficulty: 'intermediate',
    description: "White plays c3 after the Scotch — offering a pawn for rapid development and active piece play.",
    tags: ['e4', 'gambit', 'attacking', 'sharp'],
    lines: [
      { id: 'goring-accepted', name: 'Accepted', description: "Black accepts both pawns — White launches a powerful attack with Bc4.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'c3', 'dxc3', 'Bc4', 'cxb2', 'Bxb2', 'd6'] },
      { id: 'goring-declined', name: 'Declined — d5', description: "Black declines with d5 — the solid response.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'c3', 'd5', 'exd5', 'Qxd5', 'cxd4', 'Nc6'] },
      { id: 'goring-one-pawn', name: 'One Pawn Accepted', description: "Black takes one pawn but declines the second — a cautious approach.", startSans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'c3', 'dxc3', 'Nxc3', 'Nf6', 'e5', 'Ng4'] },
    ],
  },

  {
    id: 'smith-morra-gambit',
    ecoCode: 'B21',
    name: 'Smith-Morra Gambit',
    color: 'white',
    difficulty: 'intermediate',
    description: "White sacrifices a pawn against the Sicilian for rapid development and open lines. A dangerous weapon at club level.",
    tags: ['e4', 'gambit', 'attacking', 'sharp', 'anti-sicilian'],
    lines: [
      { id: 'smg-accepted', name: 'Accepted', description: "Black accepts — White gets enormous development advantage.", startSans: ['e4', 'c5', 'd4', 'cxd4', 'c3', 'dxc3', 'Nxc3', 'Nc6', 'Nf3', 'd6', 'Bc4'] },
      { id: 'smg-declined-nf6', name: 'Declined — Nf6', description: "Black declines with Nf6, avoiding the gambit.", startSans: ['e4', 'c5', 'd4', 'cxd4', 'c3', 'Nf6', 'e5', 'Nd5', 'cxd4', 'Nc6', 'Nf3'] },
      { id: 'smg-declined-e3', name: 'Declined — e3', description: "Black declines with e3 — an unusual but solid response.", startSans: ['e4', 'c5', 'd4', 'cxd4', 'c3', 'e6', 'cxd4', 'd5', 'exd5', 'exd5', 'Nf3'] },
    ],
  },

  {
    id: 'blackmar-diemer-gambit',
    ecoCode: 'D00',
    name: 'Blackmar-Diemer Gambit',
    color: 'white',
    difficulty: 'intermediate',
    description: "White sacrifices a pawn with e4 and f3 against the Slav pawn structure for wild attacking play.",
    tags: ['d4', 'gambit', 'attacking', 'sharp'],
    lines: [
      { id: 'bdg-teichmann', name: 'Teichmann Defense', description: "Black plays Bg4 to pin the knight — the most popular defensive try.", startSans: ['d4', 'd5', 'e4', 'dxe4', 'Nc3', 'Nf6', 'f3', 'exf3', 'Nxf3', 'Bg4', 'h3', 'Bxf3', 'Qxf3'] },
      { id: 'bdg-euwe', name: 'Euwe Defense', description: "Black plays e6 — solid and classical.", startSans: ['d4', 'd5', 'e4', 'dxe4', 'Nc3', 'Nf6', 'f3', 'exf3', 'Nxf3', 'e6', 'Bg5', 'Be7', 'Bd3'] },
      { id: 'bdg-lemberger', name: 'Lemberger Counter-Gambit', description: "Black counter-gambles with e5 — the sharpest response.", startSans: ['d4', 'd5', 'e4', 'dxe4', 'Nc3', 'e5', 'dxe5', 'Qxd1+', 'Nxd1', 'Nc6', 'f3'] },
    ],
  },

  {
    id: 'birds-opening',
    ecoCode: 'A02',
    name: "Bird's Opening",
    color: 'white',
    difficulty: 'beginner',
    description: "White plays f4 — a flank opening controlling e5 and preparing a Dutch-style attack.",
    tags: ['f4', 'flank', 'attacking', 'offbeat'],
    lines: [
      { id: 'birds-main', name: 'Main Line', description: "White builds a Dutch-like structure with Nf3 and d3.", startSans: ['f4', 'd5', 'Nf3', 'Nf6', 'e3', 'g6', 'Be2', 'Bg7', 'O-O', 'O-O', 'd3'] },
      { id: 'birds-from-gambit', name: 'From Gambit', description: "Black sacrifices a pawn with e5 — a dangerous counter-attack against Bird's.", startSans: ['f4', 'e5', 'fxe5', 'd6', 'exd6', 'Bxd6', 'Nf3', 'g5', 'd4'] },
      { id: 'birds-leningrad', name: 'Leningrad Variation', description: "White plays Nf3 and g3 — a quieter fianchetto setup.", startSans: ['f4', 'd5', 'Nf3', 'Nf6', 'g3', 'g6', 'Bg2', 'Bg7', 'O-O', 'O-O', 'd3', 'c5'] },
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
