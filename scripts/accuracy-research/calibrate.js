#!/usr/bin/env node
/**
 * Accuracy-formula calibration research script.
 *
 * Loads two datasets from scripts/accuracy-research/samples/, each a JSON file
 * that's the single source of truth for its games (PGN + Chess.com's real
 * displayed Accuracy/Game Rating/category counts, all in one place -- no more
 * cross-referencing a separate .txt file):
 *
 *   - category-breakdowns.json            (kik1n)         -- PRIMARY fit set
 *   - category-breakdowns_MagnusCarlsen.json (MagnusCarlsen) -- HELD-OUT set
 *
 * The kik1n set (beginner-to-intermediate, the app's actual target audience)
 * is what the aggregation parameters are fit against. The Magnus set (very
 * high rated, deliberately off-distribution) is never fit against -- it's
 * used only to check whether params tuned on kik1n generalize, or whether
 * accuracy needs a rating-dependent adjustment. See the printed comparison at
 * the end for the combined/Magnus-only diagnostic fits and the recommendation
 * on whether merging the datasets would even make sense.
 *
 * Each game is run through Stockfish to get a per-ply centipawn eval series,
 * cached to output/evals-cache.json (gitignored) keyed by a hash of the move
 * sequence, so re-running after a formula tweak doesn't re-analyze unchanged
 * games.
 *
 * Usage: node scripts/accuracy-research/calibrate.js [--depth=16]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Chess } = require('chess.js');
const initEngine = require('stockfish');

const SAMPLES_DIR = path.join(__dirname, 'samples');
const OUTPUT_DIR = path.join(__dirname, 'output');
const CACHE_PATH = path.join(OUTPUT_DIR, 'evals-cache.json');

const PRIMARY_DATASET = { file: 'category-breakdowns.json', label: 'kik1n (primary fit set)' };
const HELDOUT_DATASET = { file: 'category-breakdowns_MagnusCarlsen.json', label: 'MagnusCarlsen (held-out)' };

const depthArg = process.argv.find(a => a.startsWith('--depth='));
const DEPTH = depthArg ? Number(depthArg.split('=')[1]) : 20;
const THREADS = 8;

// ─── Parsing ────────────────────────────────────────────────────────────────

function loadDataset({ file, label }) {
  const data = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, file), 'utf8'));
  const games = [];
  for (const [key, g] of Object.entries(data.games)) {
    if (!g.pgn) {
      console.error(`[skip] ${file}#${key}: no pgn field`);
      continue;
    }
    games.push({
      source: `${file}#${key}`,
      target: { white: g.white.accuracy, black: g.black.accuracy },
      targetWhiteRating: g.white.rating,
      targetBlackRating: g.black.rating,
      pgn: g.pgn,
    });
  }
  console.log(`Loaded ${games.length} games from ${file} [${label}]`);
  return games;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

// Multi-threaded "lite" build -- same net Chess.com's own game-review engine
// uses ("SF 17.1/18 lite"), just single-threaded in this package by default.
// On this 24-core machine, 8 threads takes a sharp tactical position from
// 77s to ~1s at depth 24 (verified directly against Lichess/Chess.com's own
// analysis, which found a forced mate depth-16 single-threaded search missed
// entirely -- see scripts/accuracy-research/README.md).
async function createEngine() {
  const engine = await initEngine('lite');
  let resolveCurrent = null;
  let bestScoreCp = null;
  let currentFenSide = 'w';

  engine.listener = line => {
    if (typeof line !== 'string') return;
    const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
    if (scoreMatch) {
      const type = scoreMatch[1];
      const val = Number(scoreMatch[2]);
      const cpFromMover = type === 'cp' ? val : Math.sign(val) * (100000 - Math.min(Math.abs(val), 999));
      bestScoreCp = currentFenSide === 'w' ? cpFromMover : -cpFromMover;
    }
    if (line.startsWith('bestmove') && resolveCurrent) {
      const r = resolveCurrent;
      resolveCurrent = null;
      r(bestScoreCp);
    }
  };

  engine.sendCommand('uci');
  engine.sendCommand(`setoption name Threads value ${THREADS}`);
  engine.sendCommand('setoption name Hash value 256');

  return {
    evalFen(fen, depth) {
      return new Promise(resolve => {
        currentFenSide = fen.split(' ')[1];
        bestScoreCp = null;
        resolveCurrent = resolve;
        engine.sendCommand('ucinewgame');
        engine.sendCommand(`position fen ${fen}`);
        engine.sendCommand(`go depth ${depth}`);
      });
    },
    quit() {
      engine.sendCommand('quit');
    },
  };
}

function gameKey(sans, depth) {
  return crypto.createHash('sha1').update(depth + '|' + sans.join(' ')).digest('hex');
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

// ─── Formula ────────────────────────────────────────────────────────────────

function winPercent(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
function moveAccuracy(before, after) {
  const loss = Math.max(0, before - after);
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function harmonicMean(arr) { return arr.length / arr.reduce((a, b) => a + 1 / Math.max(b, 0.01), 0); }
function stdev(arr) {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(x => (x - m) ** 2)));
}

// Checkmate has no legal moves, so Stockfish returns no score for it at all —
// treat it as the maximal result for whoever delivered it rather than trusting
// whatever the eval pipeline defaulted to.
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

function computeAccuracy(evalsCp, sans, { window, alpha, blunderPenaltyPerCount, blunderLossThreshold }) {
  const winPcts = evalsCp.map(winPercent);
  const perMove = [];
  for (let ply = 0; ply < sans.length; ply++) {
    const mover = ply % 2 === 0 ? 'white' : 'black';
    const before = winPcts[ply];
    const after = winPcts[ply + 1];
    const beforeMover = mover === 'white' ? before : 100 - before;
    const afterMover = mover === 'white' ? after : 100 - after;
    const loss = Math.max(0, beforeMover - afterMover);
    perMove.push({ ply, mover, acc: moveAccuracy(beforeMover, afterMover), loss });
  }
  const volatility = [];
  for (let ply = 0; ply < sans.length; ply++) {
    const lo = Math.max(0, ply - window);
    const hi = Math.min(winPcts.length - 1, ply + window);
    volatility.push(Math.max(0.5, stdev(winPcts.slice(lo, hi + 1))));
  }

  function aggregate(color) {
    const items = perMove.filter(a => a.mover === color);
    const accs = items.map(a => a.acc);
    const weights = items.map(a => volatility[a.ply]);
    const weightedMean = items.reduce((sum, a, i) => sum + a.acc * weights[i], 0) / weights.reduce((a, b) => a + b, 0);
    const hMean = harmonicMean(accs);
    let result = alpha * weightedMean + (1 - alpha) * hMean;
    if (blunderPenaltyPerCount) {
      const blunderCount = items.filter(a => a.loss >= blunderLossThreshold).length;
      const extra = Math.max(0, blunderCount - 1);
      result *= Math.pow(1 - blunderPenaltyPerCount, extra);
    }
    return Math.max(0, Math.min(100, result));
  }

  return { white: aggregate('white'), black: aggregate('black') };
}

function totalError(dataset, params) {
  let err = 0;
  for (const g of dataset) {
    const r = computeAccuracy(g.evalsCp, g.sans, params);
    err += Math.abs(r.white - g.target.white) + Math.abs(r.black - g.target.black);
  }
  return err;
}

function sweep(dataset) {
  let best = null;
  for (let window = 1; window <= 12; window++) {
    for (let a10 = 0; a10 <= 10; a10++) {
      const alpha = a10 / 10;
      for (const blunderPenaltyPerCount of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
        for (const blunderLossThreshold of [15, 20, 25, 30]) {
          const params = { window, alpha, blunderPenaltyPerCount, blunderLossThreshold };
          const err = totalError(dataset, params);
          if (!best || err < best.err) best = { ...params, err };
        }
      }
    }
  }
  return best;
}

function printPerGame(dataset, params) {
  for (const g of dataset) {
    const r = computeAccuracy(g.evalsCp, g.sans, params);
    console.log(
      `  ${g.source.padEnd(45)} mine W=${r.white.toFixed(1)} B=${r.black.toFixed(1)}` +
      `  target W=${g.target.white} B=${g.target.black}` +
      `  (dW=${(r.white - g.target.white).toFixed(1)} dB=${(r.black - g.target.black).toFixed(1)})`
    );
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const primaryRaw = loadDataset(PRIMARY_DATASET);
  const heldoutRaw = loadDataset(HELDOUT_DATASET);

  const cache = loadCache();
  const engine = await createEngine();

  async function analyze(rawGames) {
    const dataset = [];
    for (let gi = 0; gi < rawGames.length; gi++) {
      const { pgn, target, targetWhiteRating, targetBlackRating, source } = rawGames[gi];
      const chess = new Chess();
      try {
        chess.loadPgn(pgn);
      } catch (e) {
        console.error(`[skip] ${source}: failed to parse PGN (${e.message})`);
        continue;
      }
      const sans = chess.history();
      if (sans.length === 0) continue;

      const key = gameKey(sans, DEPTH);
      let evalsCp = cache[key];
      if (evalsCp) {
        console.log(`[${gi + 1}/${rawGames.length}] ${source} — cached (${sans.length} plies)`);
      } else {
        console.log(`[${gi + 1}/${rawGames.length}] ${source} — analyzing ${sans.length} plies at depth ${DEPTH}...`);
        const replay = new Chess();
        const fens = [replay.fen()];
        for (const san of sans) { replay.move(san); fens.push(replay.fen()); }
        evalsCp = [];
        for (let i = 0; i < fens.length; i++) {
          evalsCp.push(await engine.evalFen(fens[i], DEPTH));
          if (i % 10 === 0) process.stdout.write(`    ${i}/${fens.length - 1}\r`);
        }
        cache[key] = evalsCp;
        saveCache(cache);
      }
      evalsCp = patchTerminalCheckmate(evalsCp.slice(), sans);
      dataset.push({ source, target, targetWhiteRating, targetBlackRating, sans, evalsCp });
    }
    return dataset;
  }

  const primary = await analyze(primaryRaw);
  const heldout = await analyze(heldoutRaw);
  engine.quit();

  console.log(`\nAnalyzed ${primary.length} primary + ${heldout.length} held-out games.\n`);

  // ── 1. Fit on PRIMARY (kik1n) only — this is the formula we'd actually ship ──
  console.log('=== Fitting on PRIMARY (kik1n) only ===');
  const bestPrimary = sweep(primary);
  console.log('Best params:', JSON.stringify(bestPrimary));
  console.log(`PRIMARY fit MAE: ${(bestPrimary.err / (primary.length * 2)).toFixed(2)} per number`);

  const heldoutErrWithPrimaryParams = totalError(heldout, bestPrimary);
  console.log(`HELD-OUT (Magnus) MAE using PRIMARY-fit params: ${(heldoutErrWithPrimaryParams / (heldout.length * 2)).toFixed(2)} per number`);
  console.log('(This is the real generalization check: same formula, same params, unseen rating range.)\n');

  // ── 2. Diagnostic: what if we fit on Magnus alone? How different are the optimal params? ──
  console.log('=== Diagnostic: fitting on HELD-OUT (Magnus) alone ===');
  const bestHeldout = sweep(heldout);
  console.log('Best params:', JSON.stringify(bestHeldout));
  console.log(`HELD-OUT fit MAE: ${(bestHeldout.err / (heldout.length * 2)).toFixed(2)} per number`);
  const primaryErrWithHeldoutParams = totalError(primary, bestHeldout);
  console.log(`PRIMARY (kik1n) MAE using HELD-OUT-fit params: ${(primaryErrWithHeldoutParams / (primary.length * 2)).toFixed(2)} per number\n`);

  // ── 3. Diagnostic: fit on the combined pool ──
  console.log('=== Diagnostic: fitting on COMBINED (kik1n + Magnus) ===');
  const combined = [...primary, ...heldout];
  const bestCombined = sweep(combined);
  console.log('Best params:', JSON.stringify(bestCombined));
  console.log(`COMBINED fit MAE: ${(bestCombined.err / (combined.length * 2)).toFixed(2)} per number`);
  console.log(`  -> PRIMARY-only MAE under combined params: ${(totalError(primary, bestCombined) / (primary.length * 2)).toFixed(2)}`);
  console.log(`  -> HELD-OUT-only MAE under combined params: ${(totalError(heldout, bestCombined) / (heldout.length * 2)).toFixed(2)}\n`);

  console.log('=== Recommendation ===');
  const paramsMatch = bestPrimary.window === bestHeldout.window && bestPrimary.alpha === bestHeldout.alpha;
  const generalizesWell = heldoutErrWithPrimaryParams / (heldout.length * 2) <= (bestPrimary.err / (primary.length * 2)) + 3;
  if (generalizesWell) {
    console.log('PRIMARY-fit params generalize reasonably well to the held-out Magnus set (within ~3pt of fit error).');
    console.log('=> No evidence merging datasets would help; keep kik1n as the fit set, Magnus as a validation check.');
  } else {
    console.log('PRIMARY-fit params do NOT generalize well to Magnus (error jumps notably on held-out set).');
    console.log('=> This suggests a genuine rating-dependent effect in Chess.com\'s real formula that a single global');
    console.log('   aggregation (fit on any one rating range) cannot capture — worth exploring a rating-scaled term');
    console.log('   rather than just merging the two pools into one fit.');
  }

  console.log('\n=== Per-game results: PRIMARY (kik1n), using PRIMARY-fit params ===');
  printPerGame(primary, bestPrimary);
  console.log('\n=== Per-game results: HELD-OUT (Magnus), using PRIMARY-fit params ===');
  printPerGame(heldout, bestPrimary);
}

main().catch(e => { console.error(e); process.exit(1); });
