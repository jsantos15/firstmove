#!/usr/bin/env node
/**
 * Move-level validation of the 9-category classifier against the exact
 * per-move badges transcribed from Chess.com's move list
 * (moveBadges in category-breakdowns_MagnusCarlsen.json).
 *
 * Uses the final calibrated params from calibrate-categories.js unchanged —
 * this is a validation pass, not a re-fit. Two directions per category:
 *
 *   RECALL    — of the moves Chess.com badged as X, how many do we classify
 *               as X? (Meaningful for all badged categories.)
 *   PRECISION — of the moves we classify as X, how many are badged X?
 *               Only meaningful for categories Chess.com badges
 *               consistently (great/mistake/miss/blunder/brilliant); for
 *               selectively-badged positive categories (book/best/excellent/
 *               good) an unbadged move is NOT evidence we're wrong. Note
 *               even 'miss' showed signs of under-badging (summary counts >
 *               visible X badges in a few games), so read miss precision
 *               with mild skepticism.
 *
 * Usage: node scripts/accuracy-research/validate-move-level.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Chess } = require('chess.js');

const SAMPLES_DIR = path.join(__dirname, 'samples');
const CACHE_PATH = path.join(__dirname, 'output', 'evals-cache.json');
const EXPLORER_CACHE_PATH = path.join(__dirname, 'output', 'lichess-explorer-cache.json');
const DEPTH = 16;

// Final calibrated params (see README / calibrate-categories.js).
const BOOK_THRESHOLD = 250000;
const CORE = { best: 0.3, excellent: 1.5, good: 3, inaccuracy: 6, mistake: 20 };
const GREAT = { losingMax: 25, winningMin: 60 };
const MISS_OPPONENT_BLUNDER = 15;

function normalizeFenForOpeningPosition(fen) {
  return fen.split(/\s+/).slice(0, 4).join(' ');
}
function winPercent(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
function patchTerminalCheckmate(evalsCp, sans) {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of sans) { chess.move(san); fens.push(chess.fen()); }
  const last = new Chess(fens[fens.length - 1]);
  if (last.isCheckmate()) {
    const winnerIsWhite = (sans.length - 1) % 2 === 0;
    evalsCp[evalsCp.length - 1] = winnerIsWhite ? 100000 : -100000;
  }
  return evalsCp;
}
function computeBookPlies(sans, popularity) {
  const chess = new Chess();
  const bookPly = [];
  let stillInBook = true;
  for (const san of sans) {
    chess.move(san);
    if (stillInBook) {
      stillInBook = (popularity.get(normalizeFenForOpeningPosition(chess.fen())) ?? 0) >= BOOK_THRESHOLD;
    }
    bookPly.push(stillInBook);
  }
  return bookPly;
}

function crossesCriticalBoundary(before, after) {
  const wasLosing = before < GREAT.losingMax;
  const nowEqualOrBetter = after >= GREAT.losingMax;
  const nowWinning = after > GREAT.winningMin;
  if (wasLosing && nowEqualOrBetter) return true;
  if (!wasLosing && before <= GREAT.winningMin && nowWinning) return true;
  return false;
}

// Full per-ply classification of one game with the calibrated 9-category rules.
function classifyGame(pgn, evalsCache, popularity) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const sans = chess.history();
  const key = crypto.createHash('sha1').update(DEPTH + '|' + sans.join(' ')).digest('hex');
  const evalsCpRaw = evalsCache[key];
  if (!evalsCpRaw) return null;
  const evalsCp = patchTerminalCheckmate(evalsCpRaw.slice(), sans);
  const winPcts = evalsCp.map(winPercent);
  const bookPly = computeBookPlies(sans, popularity);

  const losses = sans.map((_, ply) => {
    if (bookPly[ply]) return 0;
    const mover = ply % 2 === 0 ? 'white' : 'black';
    const b = winPcts[ply], a = winPcts[ply + 1];
    const bm = mover === 'white' ? b : 100 - b;
    const am = mover === 'white' ? a : 100 - a;
    return Math.max(0, bm - am);
  });

  return sans.map((san, ply) => {
    const mover = ply % 2 === 0 ? 'white' : 'black';
    if (bookPly[ply]) return { san, ply, side: mover, category: 'book' };
    const b = winPcts[ply], a = winPcts[ply + 1];
    const beforeMover = mover === 'white' ? b : 100 - b;
    const afterMover = mover === 'white' ? a : 100 - a;
    const loss = losses[ply];
    let category;
    if (loss <= CORE.excellent) {
      if (crossesCriticalBoundary(beforeMover, afterMover)) category = 'great';
      else category = loss <= CORE.best ? 'best' : 'excellent';
    } else if (ply > 0 && losses[ply - 1] >= MISS_OPPONENT_BLUNDER) {
      category = 'miss';
    } else if (loss <= CORE.good) category = 'good';
    else if (loss <= CORE.inaccuracy) category = 'inaccuracy';
    else if (loss <= CORE.mistake) category = 'mistake';
    else category = 'blunder';
    return { san, ply, side: mover, category };
  });
}

function main() {
  const data = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, 'category-breakdowns_MagnusCarlsen.json'), 'utf8'));
  const evalsCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  const popularity = new Map(Object.entries(JSON.parse(fs.readFileSync(EXPLORER_CACHE_PATH, 'utf8'))));

  const CONSISTENT = ['brilliant', 'great', 'mistake', 'miss', 'blunder'];
  const ALL_BADGED = [...CONSISTENT, 'book', 'best', 'excellent'];

  // confusion[badge][computed] = count
  const confusion = {};
  const mismatches = [];
  // For precision: our computed instances of consistently-badged categories.
  const computedCounts = Object.fromEntries(CONSISTENT.map(c => [c, 0]));
  const computedMatched = Object.fromEntries(CONSISTENT.map(c => [c, 0]));

  for (const [gameKey, g] of Object.entries(data.games)) {
    if (!g.moveBadges || !g.pgn) continue;
    const classified = classifyGame(g.pgn, evalsCache, popularity);
    if (!classified) { console.error(`[skip] ${gameKey}: no cached evals`); continue; }

    const badgeByPly = new Map();
    for (const b of g.moveBadges) {
      const ply = (b.moveNo - 1) * 2 + (b.side === 'white' ? 0 : 1);
      badgeByPly.set(ply, b);
    }

    for (const m of classified) {
      const badge = badgeByPly.get(m.ply);
      if (badge) {
        confusion[badge.category] ??= {};
        confusion[badge.category][m.category] = (confusion[badge.category][m.category] ?? 0) + 1;
        if (badge.category !== m.category) {
          mismatches.push({ game: gameKey, moveNo: badge.moveNo, side: badge.side, san: badge.san, badge: badge.category, computed: m.category });
        }
      }
      if (CONSISTENT.includes(m.category)) {
        computedCounts[m.category] += 1;
        if (badge?.category === m.category) computedMatched[m.category] += 1;
      }
    }
  }

  console.log('=== RECALL: of moves Chess.com badged as X, what did we compute? ===');
  for (const cat of ALL_BADGED) {
    const row = confusion[cat];
    if (!row) continue;
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    const hit = row[cat] ?? 0;
    const rest = Object.entries(row).filter(([k]) => k !== cat).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`  ${cat.padEnd(10)} ${hit}/${total} (${(100 * hit / total).toFixed(0)}%)  ${rest ? 'missed as -> ' + rest : ''}`);
  }

  console.log('\n=== PRECISION (consistently-badged categories only): of moves WE computed as X, how many are badged X? ===');
  for (const cat of CONSISTENT) {
    console.log(`  ${cat.padEnd(10)} ${computedMatched[cat]}/${computedCounts[cat]}${cat === 'miss' ? '  (miss badges may be incomplete — see header note)' : ''}`);
  }

  console.log(`\n=== All ${mismatches.length} badge mismatches ===`);
  for (const m of mismatches) {
    console.log(`  ${m.game.padEnd(20)} ${String(m.moveNo).padStart(3)}${m.side === 'white' ? '.' : '...'}${m.san.padEnd(8)} badge=${m.badge}  computed=${m.computed}`);
  }
}

main();
