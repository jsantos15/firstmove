#!/usr/bin/env node
/**
 * Brilliant-move detection calibration.
 *
 * Rule set (designed with the user, 2026-07-17, informed by the verified
 * Rxd3 example in the subham777 game — see README):
 *
 *   A move is Brilliant if ALL of:
 *   1. It is the engine's top move in the pre-move position (verified by
 *      running Stockfish and comparing bestmove — not the loss<=epsilon proxy).
 *   2. It leaves a piece of value >= 3 (no pawn sacs) capturable at a static
 *      material profit for the opponent (SEE >= seeThreshold) — the bait.
 *   3. Actually making that capture loses >= captureLossCp centipawns for the
 *      taker vs. declining (deep engine eval of the hypothetical position
 *      after the capture; mate counts as max loss) — the bait is poisoned.
 *   4. The mover wasn't already completely winning beforehand
 *      (winPctBefore <= maxWinBefore).
 *
 * Deliberately NO "obviousness" test: the verified Rxd3 Brilliant is refuted
 * by a mate-in-1 — as shallow as a refutation can be — and Chess.com still
 * awarded it. Engine-depth obviousness is not part of their algorithm.
 *
 * Candidate filtering is static and cheap (loss proxy + SEE); the engine only
 * runs on the handful of surviving candidates (two evals each: bestmove
 * verification on the pre-move position, deep eval after the tempting
 * capture). Those engine results are cached to output/brilliant-cache.json,
 * keyed by FEN+depth, so knob sweeps after the first run cost nothing.
 *
 * Usage: node scripts/accuracy-research/calibrate-brilliant.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Chess } = require('chess.js');
const initEngine = require('stockfish');

const SAMPLES_DIR = path.join(__dirname, 'samples');
const EVALS_CACHE_PATH = path.join(__dirname, 'output', 'evals-cache.json');
const EXPLORER_CACHE_PATH = path.join(__dirname, 'output', 'lichess-explorer-cache.json');
const BRILLIANT_CACHE_PATH = path.join(__dirname, 'output', 'brilliant-cache.json');
const DEPTH = 20;
const THREADS = 8;
const BOOK_THRESHOLD = 250000;

// Candidate pre-filter — an ENGINE-TIME SAVER ONLY, not a rule. The real rule
// 1 (must be the engine's top move, firm per the user) is enforced by strict
// bestmove verification below. This filter just avoids paying an engine call
// for moves that obviously can't be #1. It must stay loose: run 1 set it to
// 0.3 and silently dropped the verified real Brilliant (Rxd3, measured loss
// 1.44 from eval-series noise) before its bestmove check ever ran — even
// though the engine, asked directly, confirms Rxd3 IS its #1 move at depths
// 16/20/24. Loss values come from two independent searches and carry noise;
// bestmove is the ground truth, so verify with bestmove, filter generously.
const CANDIDATE_LOSS_MAX = 2.0;

// Default knobs (swept at the end against the cached engine results).
// Rule 1 (engine top move) is NOT a knob — it's always enforced.
const DEFAULT_KNOBS = {
  seeThreshold: 1,      // opponent's minimum static profit for the bait to count
  netSacMin: 1,         // bait profit minus material the move itself captured — a recapture that wins a queen while exposing a bishop is a trade, not a sacrifice (run-2 FP: DuoShan Bxb6)
  captureLossCp: 300,   // user's starting point for "taking = trouble"
  maxWinBefore: 95,     // "not already completely winning" cutoff (win%)
  minWinAfter: 40,      // "not in a bad position afterward" — run 1 showed dropping this rule floods FPs with desperate sacs in already-lost positions
};

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function normalizeFenForOpeningPosition(fen) {
  return fen.split(/\s+/).slice(0, 4).join(' ');
}

function winPercent(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function loadDataset(file, label) {
  const data = loadJson(path.join(SAMPLES_DIR, file), { games: {} });
  const games = [];
  for (const [key, g] of Object.entries(data.games)) {
    if (!g.pgn) continue;
    games.push({ source: `${file}#${key}`, pgn: g.pgn, white: g.white, black: g.black });
  }
  console.log(`Loaded ${games.length} games from ${file} [${label}]`);
  return games;
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
      stillInBook = (popularity.get(normalizeFenForOpeningPosition(chess.fen())) ?? 0) >= threshold;
    }
    bookPly.push(stillInBook);
  }
  return bookPly;
}

// Static Exchange Evaluation via chess.js: net material the side to move can
// win by initiating the best capture sequence on `square`, assuming both
// sides always recapture with their least valuable legal attacker and stop
// when continuing loses material. Legality (pins etc.) is enforced for free
// by chess.js only generating legal moves.
function seeGainOnSquare(fen, square) {
  const chess = new Chess(fen);
  const captures = chess.moves({ verbose: true }).filter(m => m.to === square && m.captured);
  if (!captures.length) return 0;
  let best = 0;
  for (const m of captures) {
    const next = new Chess(fen);
    next.move(m.san);
    const gain = PIECE_VALUES[m.captured] - seeGainOnSquare(next.fen(), square);
    if (gain > best) best = gain;
  }
  return best;
}

// After the mover's move (fen = position with opponent to move), find the most
// tempting bait: the opponent capture of a mover piece worth >= 3 with the
// highest static profit. Returns null if nothing qualifies.
function findBestBait(fen) {
  const chess = new Chess(fen);
  const captures = chess.moves({ verbose: true }).filter(
    m => m.captured && PIECE_VALUES[m.captured] >= 3
  );
  let best = null;
  for (const m of captures) {
    const next = new Chess(fen);
    next.move(m.san);
    const profit = PIECE_VALUES[m.captured] - seeGainOnSquare(next.fen(), m.to);
    if (!best || profit > best.profit) best = { san: m.san, uci: m.from + m.to + (m.promotion ?? ''), to: m.to, profit, afterFen: next.fen() };
  }
  return best;
}

// Was a profitable bait already available on this square BEFORE the move?
// A Brilliant requires the move itself to create the offer — run 2 showed the
// same hanging piece being "awarded" on consecutive moves (Qc6 and Rxe8 both
// flagged for the identical pre-existing Rxd4 bait). We check by flipping the
// side to move in the pre-move FEN (null move) and looking for a profitable
// capture on the same square. If the flipped position is illegal (mover was
// in check), the opponent had no quiet turn — treat the bait as new.
function baitExistedBefore(preFen, baitSquare) {
  const parts = preFen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-'; // clear en passant, it can't survive a null move
  const flipped = parts.join(' ');
  let chess;
  try {
    chess = new Chess(flipped);
    if (chess.isCheck()) return false;
  } catch {
    return false;
  }
  const captures = chess.moves({ verbose: true }).filter(
    m => m.captured && m.to === baitSquare && PIECE_VALUES[m.captured] >= 3
  );
  for (const m of captures) {
    const next = new Chess(flipped);
    next.move(m.san);
    if (PIECE_VALUES[m.captured] - seeGainOnSquare(next.fen(), m.to) >= 1) return true;
  }
  return false;
}

// ─── Engine (bestmove + eval, cached by fen+depth) ─────────────────────────

async function createEngine() {
  const engine = await initEngine('lite');
  let resolveCurrent = null, lastScore = null, currentFenSide = 'w';
  engine.listener = line => {
    if (typeof line !== 'string') return;
    const s = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
    if (s) {
      const val = Number(s[2]);
      const cpFromMover = s[1] === 'cp' ? val : Math.sign(val) * (100000 - Math.min(Math.abs(val), 999));
      lastScore = currentFenSide === 'w' ? cpFromMover : -cpFromMover;
    }
    if (line.startsWith('bestmove') && resolveCurrent) {
      const r = resolveCurrent; resolveCurrent = null;
      r({ cpWhite: lastScore, bestmove: line.split(' ')[1] });
    }
  };
  engine.sendCommand('uci');
  engine.sendCommand(`setoption name Threads value ${THREADS}`);
  engine.sendCommand('setoption name Hash value 256');
  return {
    analyzeFen(fen, depth) {
      return new Promise(resolve => {
        currentFenSide = fen.split(' ')[1];
        lastScore = null;
        resolveCurrent = resolve;
        engine.sendCommand('ucinewgame');
        engine.sendCommand(`position fen ${fen}`);
        engine.sendCommand(`go depth ${depth}`);
      });
    },
    quit() { engine.sendCommand('quit'); },
  };
}

// ─── Candidate collection ───────────────────────────────────────────────────

function collectCandidates(games, evalsCache, popularity) {
  const candidates = [];
  const sideTargets = [];
  for (const game of games) {
    const chess = new Chess();
    chess.loadPgn(game.pgn);
    const sans = chess.history();
    const key = crypto.createHash('sha1').update(DEPTH + '|' + sans.join(' ')).digest('hex');
    const evalsCpRaw = evalsCache[key];
    if (!evalsCpRaw) { console.error(`[skip] ${game.source}: no cached eval`); continue; }
    const evalsCp = patchTerminalCheckmate(evalsCpRaw.slice(), sans);
    const winPcts = evalsCp.map(winPercent);
    const bookPly = computeBookPlies(sans, popularity, BOOK_THRESHOLD);

    const replay = new Chess();
    const fens = [replay.fen()];
    const ucis = [];
    const capturedValues = [];
    for (const san of sans) {
      const mv = replay.move(san);
      ucis.push(mv.from + mv.to + (mv.promotion ?? ''));
      capturedValues.push(mv.captured ? PIECE_VALUES[mv.captured] : 0);
      fens.push(replay.fen());
    }

    for (const side of ['white', 'black']) {
      sideTargets.push({ source: game.source, side, targetBrilliant: game[side].brilliant });
    }

    for (let ply = 0; ply < sans.length; ply++) {
      if (bookPly[ply]) continue;
      const mover = ply % 2 === 0 ? 'white' : 'black';
      const before = winPcts[ply], after = winPcts[ply + 1];
      const winPctBeforeMover = mover === 'white' ? before : 100 - before;
      const winPctAfterMover = mover === 'white' ? after : 100 - after;
      const loss = Math.max(0, winPctBeforeMover - winPctAfterMover);
      if (loss > CANDIDATE_LOSS_MAX) continue;

      const bait = findBestBait(fens[ply + 1]);
      if (!bait || bait.profit < 1) continue;
      if (baitExistedBefore(fens[ply], bait.to)) continue; // the move must CREATE the offer

      candidates.push({
        source: game.source, side: mover, ply,
        moveNo: Math.floor(ply / 2) + 1, san: sans[ply], uci: ucis[ply],
        preFen: fens[ply], afterFen: fens[ply + 1],
        bait, winPctBeforeMover, winPctAfterMover, loss,
        movedCapturedValue: capturedValues[ply],
        cpAfterMoveWhite: evalsCp[ply + 1],
      });
    }
  }
  return { candidates, sideTargets };
}

// ─── Classification with knobs (pure, uses cached engine results) ───────────

function classifyCandidates(candidates, brilliantCache, knobs) {
  const detected = [];
  for (const c of candidates) {
    if (c.bait.profit < knobs.seeThreshold) continue;
    if (c.bait.profit - c.movedCapturedValue < knobs.netSacMin) continue;
    if (c.winPctBeforeMover > knobs.maxWinBefore) continue;
    if (c.winPctAfterMover < knobs.minWinAfter) continue;

    // Rule 1, firm: must be the engine's top move.
    const bm = brilliantCache[`bestmove|${DEPTH}|${c.preFen}`];
    if (!bm || bm.bestmove !== c.uci) continue;

    const cap = brilliantCache[`eval|${DEPTH}|${c.bait.afterFen}`];
    if (!cap) continue;
    // Taker = opponent of mover. Loss for the taker = (their eval if they
    // decline, i.e. after the brilliant move) - (their eval after capturing).
    const takerSign = c.side === 'white' ? -1 : 1; // opponent's perspective on white-cp
    const cpDecline = takerSign * c.cpAfterMoveWhite;
    const cpTake = takerSign * cap.cpWhite;
    const takerLoss = Math.min(2000, cpDecline - cpTake);
    if (takerLoss < knobs.captureLossCp) continue;

    detected.push({ ...c, takerLoss });
  }
  return detected;
}

function scoreDetection(detected, sideTargets) {
  const computedBySide = new Map();
  for (const d of detected) {
    const k = `${d.source}|${d.side}`;
    computedBySide.set(k, (computedBySide.get(k) ?? 0) + 1);
  }
  let totalErr = 0, tp = 0, fp = 0, fn = 0;
  for (const st of sideTargets) {
    const computed = computedBySide.get(`${st.source}|${st.side}`) ?? 0;
    totalErr += Math.abs(computed - st.targetBrilliant);
    tp += Math.min(computed, st.targetBrilliant);
    fp += Math.max(0, computed - st.targetBrilliant);
    fn += Math.max(0, st.targetBrilliant - computed);
  }
  return { totalErr, tp, fp, fn };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const primary = loadDataset('category-breakdowns.json', 'kik1n');
  const heldout = loadDataset('category-breakdowns_MagnusCarlsen.json', 'MagnusCarlsen');
  const evalsCache = loadJson(EVALS_CACHE_PATH, {});
  const popularity = new Map(Object.entries(loadJson(EXPLORER_CACHE_PATH, {})));
  const brilliantCache = loadJson(BRILLIANT_CACHE_PATH, {});

  const all = collectCandidates([...primary, ...heldout], evalsCache, popularity);
  console.log(`\n${all.candidates.length} static candidates (top-move-proxy + SEE bait >= 1, piece >= 3) across ${all.sideTargets.length} sides`);

  // Engine pass: fill cache for every candidate (bestmove on preFen, eval after bait capture).
  const engine = await createEngine();
  let done = 0;
  for (const c of all.candidates) {
    const bmKey = `bestmove|${DEPTH}|${c.preFen}`;
    if (!(bmKey in brilliantCache)) {
      brilliantCache[bmKey] = await engine.analyzeFen(c.preFen, DEPTH);
      fs.writeFileSync(BRILLIANT_CACHE_PATH, JSON.stringify(brilliantCache));
    }
    const evKey = `eval|${DEPTH}|${c.bait.afterFen}`;
    if (!(evKey in brilliantCache)) {
      brilliantCache[evKey] = await engine.analyzeFen(c.bait.afterFen, DEPTH);
      fs.writeFileSync(BRILLIANT_CACHE_PATH, JSON.stringify(brilliantCache));
    }
    done++;
    process.stdout.write(`\r  engine: ${done}/${all.candidates.length} candidates analyzed`);
  }
  engine.quit();
  console.log('');

  // Split back into datasets for scoring.
  const primarySources = new Set(primary.map(g => g.source));
  const split = ds => ({
    candidates: all.candidates.filter(c => primarySources.has(c.source) === (ds === 'kik1n')),
    sideTargets: all.sideTargets.filter(s => primarySources.has(s.source) === (ds === 'kik1n')),
  });
  const kik = split('kik1n');
  const mag = split('magnus');

  // ── Default knobs ──
  console.log(`\n=== Default knobs ${JSON.stringify(DEFAULT_KNOBS)} ===`);
  for (const [label, ds] of [['kik1n', kik], ['Magnus', mag]]) {
    const detected = classifyCandidates(ds.candidates, brilliantCache, DEFAULT_KNOBS);
    const s = scoreDetection(detected, ds.sideTargets);
    console.log(`${label}: detected=${detected.length}  TP=${s.tp} FP=${s.fp} FN=${s.fn}  totalErr=${s.totalErr}`);
    for (const d of detected) {
      console.log(`   ${d.source} ${d.side} move ${d.moveNo}. ${d.san}  (bait ${d.bait.san} profit=${d.bait.profit}, takerLoss=${d.takerLoss}cp, loss=${d.loss.toFixed(2)}, winBefore=${d.winPctBeforeMover.toFixed(1)}, winAfter=${d.winPctAfterMover.toFixed(1)})`);
    }
  }

  // ── Knob sweep (engine results cached — free) ──
  console.log('\n=== Knob sweep (scored on combined 70 sides; TP/FP/FN combined) ===');
  const rows = [];
  for (const netSacMin of [0, 1, 2]) {
    for (const seeThreshold of [1, 2, 3]) {
      for (const captureLossCp of [150, 300, 500, 800]) {
        for (const maxWinBefore of [80, 90, 95, 100]) {
          for (const minWinAfter of [0, 30, 40, 50]) {
            const knobs = { seeThreshold, netSacMin, captureLossCp, maxWinBefore, minWinAfter };
            const dK = classifyCandidates(kik.candidates, brilliantCache, knobs);
            const dM = classifyCandidates(mag.candidates, brilliantCache, knobs);
            const sK = scoreDetection(dK, kik.sideTargets);
            const sM = scoreDetection(dM, mag.sideTargets);
            rows.push({ knobs, err: sK.totalErr + sM.totalErr, tp: sK.tp + sM.tp, fp: sK.fp + sM.fp, fn: sK.fn + sM.fn, kikErr: sK.totalErr, magErr: sM.totalErr });
          }
        }
      }
    }
  }
  rows.sort((a, b) => a.err - b.err || b.tp - a.tp);
  for (const r of rows.slice(0, 15)) {
    console.log(`  ${JSON.stringify(r.knobs)}  err=${r.err} (kik1n ${r.kikErr} + Magnus ${r.magErr})  TP=${r.tp} FP=${r.fp} FN=${r.fn}`);
  }

  // Sanity check on the one move-level ground truth we have:
  const rxd3 = all.candidates.find(c => c.source.includes('subham777') && !c.source.includes('_2') && c.san === 'Rxd3');
  console.log(`\nRxd3 (verified real Brilliant) is ${rxd3 ? 'a candidate' : 'NOT a candidate — still being filtered out!'}`);
  if (rxd3) {
    const det = classifyCandidates([rxd3], brilliantCache, DEFAULT_KNOBS);
    console.log(`Rxd3 detected under default knobs: ${det.length ? 'YES' : 'NO'}  (loss=${rxd3.loss.toFixed(2)}, bait=${rxd3.bait.san} profit=${rxd3.bait.profit}, winBefore=${rxd3.winPctBeforeMover.toFixed(1)}, winAfter=${rxd3.winPctAfterMover.toFixed(1)})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
