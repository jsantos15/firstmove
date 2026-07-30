#!/usr/bin/env node
/**
 * Single-game move-by-move comparison: our current calibrated classifier vs
 * the exact per-move badges from Chess.com (moveBadges ground truth).
 * The workbench for tuning categories one by one against a single game.
 *
 * Usage: node scripts/accuracy-research/match-single-game.js <gameKey>
 *        (gameKey = key in category-breakdowns_MagnusCarlsen.json, e.g. Silent-Killer100)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Chess } = require('chess.js');

const SAMPLES_DIR = path.join(__dirname, 'samples');
const CACHE_PATH = path.join(__dirname, 'output', 'evals-cache.json');
const EXPLORER_CACHE_PATH = path.join(__dirname, 'output', 'lichess-explorer-cache.json');
const DEPTH = 20;

// Current calibrated params (count-level fits — the baseline being tested).
const BOOK_THRESHOLD = 250000;
const CORE = { best: 0.3, excellent: 1.5, good: 3, inaccuracy: 6, mistake: 20 };
const GREAT = { losingMax: 25, winningMin: 60 };
const MISS_OPPONENT_BLUNDER = 15;

function normalizeFen(fen) { return fen.split(/\s+/).slice(0, 4).join(' '); }
function winPercent(cp) { return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1); }

function main() {
  const gameKey = process.argv[2];
  if (!gameKey) { console.error('Usage: node match-single-game.js <gameKey>'); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, 'category-breakdowns_MagnusCarlsen.json'), 'utf8'));
  const game = data.games[gameKey];
  if (!game) { console.error(`No game "${gameKey}"`); process.exit(1); }
  const evalsCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  const popularity = new Map(Object.entries(JSON.parse(fs.readFileSync(EXPLORER_CACHE_PATH, 'utf8'))));

  const chess = new Chess();
  chess.loadPgn(game.pgn);
  const sans = chess.history();
  const key = crypto.createHash('sha1').update(DEPTH + '|' + sans.join(' ')).digest('hex');
  const evalsCp = evalsCache[key].slice();
  const last = new Chess();
  for (const san of sans) last.move(san);
  if (last.isCheckmate()) evalsCp[evalsCp.length - 1] = (sans.length - 1) % 2 === 0 ? 100000 : -100000;
  const winPcts = evalsCp.map(winPercent);

  // Book plies
  const bookChess = new Chess();
  const bookPly = [];
  let inBook = true;
  for (const san of sans) {
    bookChess.move(san);
    if (inBook) inBook = (popularity.get(normalizeFen(bookChess.fen())) ?? 0) >= BOOK_THRESHOLD;
    bookPly.push(inBook);
  }

  const losses = sans.map((_, ply) => {
    if (bookPly[ply]) return 0;
    const mover = ply % 2 === 0 ? 'white' : 'black';
    const b = winPcts[ply], a = winPcts[ply + 1];
    const bm = mover === 'white' ? b : 100 - b;
    const am = mover === 'white' ? a : 100 - a;
    return Math.max(0, bm - am);
  });

  const badgeByPly = new Map();
  for (const b of game.moveBadges ?? []) {
    badgeByPly.set((b.moveNo - 1) * 2 + (b.side === 'white' ? 0 : 1), b.category);
  }

  console.log(`=== ${gameKey}: ${game.white.player} (W) vs ${game.black.player} (B) — move-by-move ===`);
  console.log('ply  move        side   loss    winB->winA   computed     badge        verdict');
  let exact = 0, badged = 0, positiveOk = 0, positiveTotal = 0;
  for (let ply = 0; ply < sans.length; ply++) {
    const mover = ply % 2 === 0 ? 'white' : 'black';
    const b = winPcts[ply], a = winPcts[ply + 1];
    const beforeMover = mover === 'white' ? b : 100 - b;
    const afterMover = mover === 'white' ? a : 100 - a;
    const loss = losses[ply];

    let computed;
    if (bookPly[ply]) computed = 'book';
    else if (loss <= CORE.excellent) {
      const wasLosing = beforeMover < GREAT.losingMax;
      const crosses = (wasLosing && afterMover >= GREAT.losingMax) ||
        (!wasLosing && beforeMover <= GREAT.winningMin && afterMover > GREAT.winningMin);
      if (crosses) computed = 'great';
      else computed = loss <= CORE.best ? 'best' : 'excellent';
    } else if (ply > 0 && losses[ply - 1] >= MISS_OPPONENT_BLUNDER) computed = 'miss';
    else if (loss <= CORE.good) computed = 'good';
    else if (loss <= CORE.inaccuracy) computed = 'inaccuracy';
    else if (loss <= CORE.mistake) computed = 'mistake';
    else computed = 'blunder';

    const badge = badgeByPly.get(ply);
    const positiveTier = ['book', 'best', 'excellent', 'good'];
    let verdict;
    if (badge) {
      badged++;
      if (badge === computed) { verdict = 'MATCH'; exact++; }
      else verdict = `X want=${badge}`;
    } else {
      positiveTotal++;
      if (positiveTier.includes(computed)) { verdict = 'ok (implied positive)'; positiveOk++; }
      else verdict = `X unbadged but computed=${computed}`;
    }
    const moveNo = Math.floor(ply / 2) + 1;
    const label = `${moveNo}${mover === 'white' ? '.' : '...'}${sans[ply]}`;
    console.log(
      `${String(ply).padStart(3)}  ${label.padEnd(11)} ${mover.padEnd(6)} ` +
      `${loss.toFixed(2).padStart(5)}  ${beforeMover.toFixed(0).padStart(3)}->${afterMover.toFixed(0).padEnd(4)}  ` +
      `${computed.padEnd(12)} ${(badge ?? '-').padEnd(12)} ${verdict}`
    );
  }
  console.log(`\nBadged moves matched exactly: ${exact}/${badged}`);
  console.log(`Unbadged moves computed as positive tier (consistent): ${positiveOk}/${positiveTotal}`);
}

main();
