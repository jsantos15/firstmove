#!/usr/bin/env node
/**
 * Move Categories calibration — 9-category classifier: Book (frequency-based,
 * see fetch-book-popularity.cjs), the 6 core Win%-loss buckets (Best,
 * Excellent, Good, Inaccuracy, Mistake, Blunder, boundaries already tuned —
 * see README), plus Great and Miss, which sit outside the bucket system and
 * need their own heuristics from Chess.com's public qualitative definitions:
 *
 *   - Great: a "good" move (loss <= excellent) that swings the position across
 *     the losing/equal or equal/winning boundary (winPctBeforeMover/
 *     winPctAfterMover cross greatLosingMax or greatWinningMin).
 *   - Miss: a NOT-good move (loss > excellent) played immediately after the
 *     opponent's own previous move lost at least missOpponentBlunder win% —
 *     i.e. the opponent just handed over a big opportunity and this move
 *     didn't capitalize on it.
 *
 * Brilliant is DEFERRED, not implemented — three heuristics were tried and
 * rejected: (1) immediate material delta on the sac move itself — doesn't
 * work because a real sacrifice usually doesn't change the material count on
 * that exact ply, the piece just sits on an attacked square until captured
 * 1-3 moves later; (2) a lookahead window's minimum material balance over the
 * next few plies — way too noisy, fires on ordinary mid-trade dips in totally
 * normal games (12 false positives in one 50-ply kik1n game with 0 real
 * Brilliants); (3) "landed on a square the opponent can capture" combined
 * with a net-material-deficit check a few plies later — still both missed a
 * known real Brilliant (ArturoCaceres) and fired on ordinary trades elsewhere.
 * All three fail for the same underlying reason: telling a genuine,
 * uncompensated sacrifice apart from a perfectly ordinary trade sequence
 * needs either Static Exchange Evaluation or the engine's own principal
 * variation, and we only have a single depth-16 score per position cached —
 * no PV, no SEE. Real Brilliant detection needs one of those; not attempted
 * further here. `brilliant` stays in the output/comparison as an
 * always-0-computed column so the gap is visible, not hidden.
 *
 * Also worth knowing: kik1n (the primary fit set for everything else in this
 * file) has ZERO Brilliant instances across all 28 sides anyway — even if a
 * working heuristic existed, kik1n couldn't validate it (any threshold that
 * never fires "wins" trivially with 0 error there). Real sacrifices an engine
 * confirms as objectively best are rare at beginner/intermediate level, which
 * is FirstMove's actual audience — so this gap has low practical impact for
 * now even though it's a real gap.
 *
 * Reuses the Stockfish eval cache calibrate.js already built and the Lichess
 * Explorer popularity cache fetch-book-popularity.cjs built — does not
 * re-run either. Usage: node scripts/accuracy-research/calibrate-categories.js
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

const PRIMARY_DATASET = { file: 'category-breakdowns.json', label: 'kik1n (primary fit set)' };
const HELDOUT_DATASET = { file: 'category-breakdowns_MagnusCarlsen.json', label: 'MagnusCarlsen (held-out)' };

// Core-bucket boundaries, already calibrated (see README) — fixed here, not
// re-swept, since that work is done and validated.
const CORE_BOUNDARIES = { best: 0.3, excellent: 1.5, good: 3, inaccuracy: 6, mistake: 20 };
const BOOK_THRESHOLD = 250000; // already calibrated, see README

function normalizeFenForOpeningPosition(fen) {
  return fen.split(/\s+/).slice(0, 4).join(' ');
}

function loadExplorerPopularity() {
  const data = JSON.parse(fs.readFileSync(EXPLORER_CACHE_PATH, 'utf8'));
  return new Map(Object.entries(data));
}

function loadDataset({ file, label }) {
  const data = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, file), 'utf8'));
  const games = [];
  for (const [key, g] of Object.entries(data.games)) {
    if (!g.pgn) continue;
    games.push({ source: `${file}#${key}`, pgn: g.pgn, white: g.white, black: g.black });
  }
  console.log(`Loaded ${games.length} games from ${file} [${label}]`);
  return games;
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

function computeBookPlies(sans, popularity, threshold) {
  const chess = new Chess();
  const bookPly = [];
  let stillInBook = true;
  for (const san of sans) {
    chess.move(san);
    if (stillInBook) {
      const key = normalizeFenForOpeningPosition(chess.fen());
      const games = popularity.get(key) ?? 0;
      stillInBook = games >= threshold;
    }
    bookPly.push(stillInBook);
  }
  return bookPly;
}

// One-time-per-dataset precompute: PGN parsing, engine-eval lookup, Book
// detection, and material tracking all happen here, ONCE. Every sweep below
// just re-buckets this same array of per-move facts — no re-parsing.
function precomputeSides(games, cache, popularity, bookThreshold) {
  const sides = [];
  for (const game of games) {
    const chess = new Chess();
    chess.loadPgn(game.pgn);
    const sans = chess.history();
    const key = crypto.createHash('sha1').update(DEPTH + '|' + sans.join(' ')).digest('hex');
    const evalsCpRaw = cache[key];
    if (!evalsCpRaw) { console.error(`[skip] ${game.source}: no cached eval`); continue; }
    const evalsCp = patchTerminalCheckmate(evalsCpRaw.slice(), sans);
    const winPcts = evalsCp.map(winPercent);
    const bookPly = computeBookPlies(sans, popularity, bookThreshold);

    // mover-perspective loss per ply, 0 for book plies (book moves don't blunder) —
    // needed so "opponent's prior move" lookups work uniformly.
    const allPlyLoss = sans.map((_, ply) => {
      if (bookPly[ply]) return 0;
      const mover = ply % 2 === 0 ? 'white' : 'black';
      const before = winPcts[ply], after = winPcts[ply + 1];
      const beforeMover = mover === 'white' ? before : 100 - before;
      const afterMover = mover === 'white' ? after : 100 - after;
      return Math.max(0, beforeMover - afterMover);
    });

    const moves = { white: [], black: [] };
    const bookCount = { white: 0, black: 0 };
    for (let ply = 0; ply < sans.length; ply++) {
      const mover = ply % 2 === 0 ? 'white' : 'black';
      if (bookPly[ply]) { bookCount[mover] += 1; continue; }
      const before = winPcts[ply], after = winPcts[ply + 1];
      const winPctBeforeMover = mover === 'white' ? before : 100 - before;
      const winPctAfterMover = mover === 'white' ? after : 100 - after;
      const loss = allPlyLoss[ply];
      const opponentPriorLoss = ply > 0 ? allPlyLoss[ply - 1] : 0;
      moves[mover].push({ loss, winPctBeforeMover, winPctAfterMover, opponentPriorLoss });
    }
    for (const side of ['white', 'black']) {
      sides.push({ source: game.source, side, target: game[side], bookCount: bookCount[side], moves: moves[side] });
    }
  }
  return sides;
}

function crossesCriticalBoundary(before, after, params) {
  const wasLosing = before < params.greatLosingMax;
  const wasEqualOrBetter = before >= params.greatLosingMax;
  const nowEqualOrBetter = after >= params.greatLosingMax;
  const nowWinning = after > params.greatWinningMin;
  if (wasLosing && nowEqualOrBetter) return true;
  if (wasEqualOrBetter && before <= params.greatWinningMin && nowWinning) return true;
  return false;
}

function classifyMove(m, params) {
  const isGoodMove = m.loss <= CORE_BOUNDARIES.excellent;
  if (isGoodMove) {
    // Brilliant deliberately not classified here — see module comment.
    if (crossesCriticalBoundary(m.winPctBeforeMover, m.winPctAfterMover, params)) {
      return 'great';
    }
    return m.loss <= CORE_BOUNDARIES.best ? 'best' : 'excellent';
  }
  if (m.opponentPriorLoss >= params.missOpponentBlunder) return 'miss';
  if (m.loss <= CORE_BOUNDARIES.good) return 'good';
  if (m.loss <= CORE_BOUNDARIES.inaccuracy) return 'inaccuracy';
  if (m.loss <= CORE_BOUNDARIES.mistake) return 'mistake';
  return 'blunder';
}

const FULL_BUCKETS = ['book', 'brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'];

function classifySide(pre, params) {
  const counts = Object.fromEntries(FULL_BUCKETS.map(b => [b, 0]));
  counts.book = pre.bookCount;
  for (const m of pre.moves) counts[classifyMove(m, params)] += 1;
  return counts;
}

function perBucketError(computed, target) {
  const out = {};
  for (const b of FULL_BUCKETS) out[b] = Math.abs(computed[b] - target[b]);
  return out;
}

function evaluatePrecomputed(precomputedSides, params) {
  let rawErr = 0, sides = 0;
  const perBucket = Object.fromEntries(FULL_BUCKETS.map(b => [b, 0]));
  const perGame = [];
  for (const pre of precomputedSides) {
    const computed = classifySide(pre, params);
    const target = pre.target;
    const pb = perBucketError(computed, target);
    for (const b of FULL_BUCKETS) perBucket[b] += pb[b];
    rawErr += FULL_BUCKETS.reduce((sum, b) => sum + pb[b], 0);
    sides += 1;
    perGame.push({ source: pre.source, side: pre.side, computed, target });
  }
  return { rawErr, perBucket, sides, perGame };
}

function sweepMiss(precomputedSides) {
  const candidates = [5, 8, 10, 12, 15, 18, 20, 25, 30];
  let best = null;
  for (const missOpponentBlunder of candidates) {
    const params = { ...DEFAULT_PARAMS, missOpponentBlunder };
    const { perBucket } = evaluatePrecomputed(precomputedSides, params);
    if (!best || perBucket.miss < best.err) best = { missOpponentBlunder, err: perBucket.miss };
  }
  return best;
}

function sweepGreat(precomputedSides, missOpponentBlunder) {
  const losingCandidates = [25, 30, 35, 40, 45];
  const winningCandidates = [55, 60, 65, 70, 75];
  let best = null;
  for (const greatLosingMax of losingCandidates) {
    for (const greatWinningMin of winningCandidates) {
      if (greatWinningMin <= greatLosingMax) continue;
      const params = { ...DEFAULT_PARAMS, missOpponentBlunder, greatLosingMax, greatWinningMin };
      const { perBucket } = evaluatePrecomputed(precomputedSides, params);
      if (!best || perBucket.great < best.err) best = { greatLosingMax, greatWinningMin, err: perBucket.great };
    }
  }
  return best;
}

const DEFAULT_PARAMS = {
  greatLosingMax: 35, greatWinningMin: 65, missOpponentBlunder: 15,
};

function printPerBucket(label, result) {
  console.log(`  ${label} per-bucket MAE/side: ${FULL_BUCKETS.map(b => `${b}=${(result.perBucket[b] / result.sides).toFixed(2)}`).join(' ')}`);
}

function main() {
  const primary = loadDataset(PRIMARY_DATASET);
  const heldout = loadDataset(HELDOUT_DATASET);
  const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  const popularity = loadExplorerPopularity();

  const precomputedPrimary = precomputeSides(primary, cache, popularity, BOOK_THRESHOLD);
  const precomputedHeldout = precomputeSides(heldout, cache, popularity, BOOK_THRESHOLD);

  console.log('\n=== Sweeping Miss threshold, fit on kik1n only ===');
  const bestMiss = sweepMiss(precomputedPrimary);
  console.log(`Best missOpponentBlunder on kik1n: >= ${bestMiss.missOpponentBlunder} win% loss  (miss total-error ${bestMiss.err}, kik1n's 28 sides)`);

  console.log('\n=== Sweeping Great boundaries, fit on kik1n only ===');
  const bestGreat = sweepGreat(precomputedPrimary, bestMiss.missOpponentBlunder);
  console.log(`Best greatLosingMax/greatWinningMin on kik1n: ${bestGreat.greatLosingMax}/${bestGreat.greatWinningMin}  (great total-error ${bestGreat.err})`);

  const finalParams = { ...DEFAULT_PARAMS, missOpponentBlunder: bestMiss.missOpponentBlunder, greatLosingMax: bestGreat.greatLosingMax, greatWinningMin: bestGreat.greatWinningMin };
  console.log('\nFinal params:', JSON.stringify(finalParams), '(Brilliant deliberately not classified — see module comment)');

  const finalPrimary = evaluatePrecomputed(precomputedPrimary, finalParams);
  const finalHeldout = evaluatePrecomputed(precomputedHeldout, finalParams);
  console.log(`\nkik1n:  raw MAE/side ${(finalPrimary.rawErr / finalPrimary.sides / 10).toFixed(2)} (10 buckets)`);
  printPerBucket('kik1n', finalPrimary);
  console.log(`Magnus: raw MAE/side ${(finalHeldout.rawErr / finalHeldout.sides / 10).toFixed(2)} (10 buckets)`);
  printPerBucket('Magnus', finalHeldout);

  console.log('\n=== Per-game breakdown ===');
  const fmt = c => FULL_BUCKETS.map(b => `${b}=${c[b]}`).join(',');
  for (const g of [...finalPrimary.perGame, ...finalHeldout.perGame]) {
    console.log(`  ${g.source.padEnd(45)} ${g.side.padEnd(5)} computed[${fmt(g.computed)}] target[${fmt(g.target)}]`);
  }
}

main();
