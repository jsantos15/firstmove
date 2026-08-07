#!/usr/bin/env node
/**
 * Brilliant-move detection calibration.
 *
 * This script does NOT reimplement the detection rules — it imports the real
 * functions from packages/core/src/coach/tacticalSignals.ts (the same code
 * `apps/web/lib/client/enrichGameMove.ts` calls live in the app) and sweeps
 * threshold overrides through them against 35 real Chess.com-analyzed games.
 * One implementation, one place fixes land; this is a test harness around it,
 * not a parallel copy that can drift out of sync.
 *
 * Rule set (see tacticalSignals.ts for the authoritative, up-to-date version):
 *   1. Must be the engine's top move in the pre-move position (firm, enforced
 *      below via strict bestmove verification — not a knob).
 *   2. Hangs a piece worth >= 3 (findHangingPieceBait / SEE), as a genuine net
 *      sacrifice, not stale (baitWasStaleBeforeOpponentsMove).
 *   3. EITHER the capture is poisoned (computePoisonTakerLossCp) OR this is
 *      the only move that doesn't lose (computeOnlyMoveMarginCp) — and for a
 *      bystander bait (not the piece that just moved), the only-move path also
 *      needs the capture to be absolutely decisive for the taker
 *      (isBystanderCaptureDecisive), not just SEE-profitable.
 *   4. The mover's own position wasn't already lost afterward (minWinAfterPct).
 *
 * Deliberately NO "obviousness" test: the verified Rxd3 Brilliant is refuted
 * by a mate-in-1 — as shallow as a refutation can be — and Chess.com still
 * awarded it. Engine-depth obviousness is not part of their algorithm.
 *
 * Candidate filtering is static and cheap (loss proxy + SEE, this script's own
 * concern — production doesn't need it, since it only ever processes one game
 * interactively); the engine only runs on the handful of surviving candidates.
 * Results cached to output/brilliant-cache.json, keyed by FEN+depth, so knob
 * sweeps after the first run cost nothing.
 *
 * Usage: pnpm exec tsx scripts/accuracy-research/calibrate-brilliant.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Chess } = require('chess.js');
const initEngine = require('stockfish');
const {
  findHangingPieceBait,
  baitWasStaleBeforeOpponentsMove,
  winPercentFromWhiteCp,
  computeOnlyMoveMarginCp,
  isOnlyMoveBrilliant,
  computePoisonTakerLossCp,
  isPoisonBrilliant,
  isBystanderCaptureDecisive,
} = require(path.join(__dirname, '..', '..', 'packages', 'core', 'src', 'coach', 'tacticalSignals.ts'));

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

// Default knobs (swept at the end against the cached engine results) — these map
// 1:1 onto tacticalSignals.ts's BrilliantSignalThresholds (see toThresholds below).
// Rule 1 (engine top move) is NOT a knob — it's always enforced.
const DEFAULT_KNOBS = {
  seeThreshold: 1,      // opponent's minimum static profit for the bait to count
  netSacMin: 1,         // bait profit minus material the move itself captured — a recapture that wins a queen while exposing a bishop is a trade, not a sacrifice (run-2 FP: DuoShan Bxb6)
  captureLossCp: 300,   // user's starting point for "taking = trouble"
  minWinAfter: 40,      // "not in a bad position afterward" — run 1 showed dropping this rule floods FPs with desperate sacs in already-lost positions
  onlyMoveMarginMin: 150, // path B: cp this move beats the 2nd-best legal alternative by (mover POV) — "only move that survives"
  bystanderTakerMaxWinPct: 10, // for a bystander bait, taker's own win% after capturing must be this low to count as decisive (see DenLaz 26.Rf6 vs ArturoCaceres 21.Nd5)
};

function toThresholds(knobs) {
  return {
    seeThreshold: knobs.seeThreshold,
    netSacMin: knobs.netSacMin,
    poisonLossCp: knobs.captureLossCp,
    onlyMoveMarginCp: knobs.onlyMoveMarginMin,
    bystanderTakerMaxWinPct: knobs.bystanderTakerMaxWinPct,
    minWinAfterPct: knobs.minWinAfter,
  };
}

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function normalizeFenForOpeningPosition(fen) {
  return fen.split(/\s+/).slice(0, 4).join(' ');
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

// Bait-finding and staleness logic now live in tacticalSignals.ts
// (findHangingPieceBait / baitWasStaleBeforeOpponentsMove), imported above.

// ─── Engine (bestmove + eval, cached by fen+depth) ─────────────────────────

async function createEngine() {
  const engine = await initEngine('lite');
  let resolveCurrent = null, lastScore = null, currentFenSide = 'w';
  let scoresByPv = {};
  engine.listener = line => {
    if (typeof line !== 'string') return;
    const s = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
    if (s) {
      const val = Number(s[2]);
      const cpFromMover = s[1] === 'cp' ? val : Math.sign(val) * (100000 - Math.min(Math.abs(val), 999));
      const white = currentFenSide === 'w' ? cpFromMover : -cpFromMover;
      lastScore = white;
      const pv = line.match(/\bmultipv\s+(\d+)\b/);
      scoresByPv[pv ? Number(pv[1]) : 1] = white;
    }
    if (line.startsWith('bestmove') && resolveCurrent) {
      const r = resolveCurrent; resolveCurrent = null;
      r({ cpWhite: lastScore, bestmove: line.split(' ')[1], scoresByPv: { ...scoresByPv } });
    }
  };
  engine.sendCommand('uci');
  engine.sendCommand(`setoption name Threads value ${THREADS}`);
  engine.sendCommand('setoption name Hash value 256');
  let currentMultiPv = 1;
  function setMultiPv(n) {
    if (currentMultiPv === n) return;
    engine.sendCommand(`setoption name MultiPV value ${n}`);
    currentMultiPv = n;
  }
  return {
    analyzeFen(fen, depth) {
      setMultiPv(1);
      return new Promise(resolve => {
        currentFenSide = fen.split(' ')[1];
        lastScore = null;
        scoresByPv = {};
        resolveCurrent = resolve;
        engine.sendCommand('ucinewgame');
        engine.sendCommand(`position fen ${fen}`);
        engine.sendCommand(`go depth ${depth}`);
      });
    },
    // Top-N principal variations at the same depth, in one search — used to
    // measure the "only move" margin (PV1 eval minus PV2 eval, mover POV):
    // how much worse every alternative is, not just whether this move is #1.
    async analyzeFenMultiPv(fen, depth, n) {
      setMultiPv(n);
      const r = await new Promise(resolve => {
        currentFenSide = fen.split(' ')[1];
        lastScore = null;
        scoresByPv = {};
        resolveCurrent = resolve;
        engine.sendCommand('ucinewgame');
        engine.sendCommand(`position fen ${fen}`);
        engine.sendCommand(`go depth ${depth}`);
      });
      setMultiPv(1);
      return r.scoresByPv;
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
    const winPcts = evalsCp.map(winPercentFromWhiteCp);
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

      const bait = findHangingPieceBait(fens[ply + 1]);
      if (!bait || bait.profit < 1) continue;
      // The move itself doesn't have to create the offer (a pre-existing hanging
      // piece still counts, e.g. ArturoCaceres 21.Nd5 hanging a knight that was
      // already loose on g6, or Alonmindlin 24.h6 with White's own c3 knight
      // already hanging off 23...b4) — it only has to be FRESH, not stale. So
      // check one ply further back than the move itself: was it already hanging
      // before the OPPONENT's last move too? If yes, neither side has reacted to
      // it in a full round and it's the original stale-bait case this guarded
      // against (run 2: Qc6 then Rxe8 both re-flagged for the same idle Rxd4).
      // If no, the opponent's own last move is what created it — fresh, counts.
      if (ply >= 1 && baitWasStaleBeforeOpponentsMove(fens[ply - 1], bait.to)) continue;

      candidates.push({
        source: game.source, side: mover, ply,
        moveNo: Math.floor(ply / 2) + 1, san: sans[ply], uci: ucis[ply],
        preFen: fens[ply], afterFen: fens[ply + 1],
        bait, winPctBeforeMover, winPctAfterMover, loss,
        movedCapturedValue: capturedValues[ply],
        cpAfterMoveWhite: evalsCp[ply + 1],
        isSelfSacrifice: bait.to === ucis[ply].slice(2, 4),
      });
    }
  }
  return { candidates, sideTargets };
}

// ─── Classification with knobs (pure, uses cached engine results) ───────────

function classifyCandidates(candidates, brilliantCache, knobs) {
  const thresholds = toThresholds(knobs);
  const detected = [];
  for (const c of candidates) {
    if (c.bait.profit < thresholds.seeThreshold) continue;
    if (c.bait.profit - c.movedCapturedValue < thresholds.netSacMin) continue;

    const moverCpAfter = c.side === 'white' ? c.cpAfterMoveWhite : -c.cpAfterMoveWhite;
    if (winPercentFromWhiteCp(moverCpAfter) < thresholds.minWinAfterPct) continue;

    // Rule 1, firm: must be the engine's top move.
    const bm = brilliantCache[`bestmove|${DEPTH}|${c.preFen}`];
    if (!bm || bm.bestmove !== c.uci) continue;

    const cap = brilliantCache[`eval|${DEPTH}|${c.bait.afterFen}`];
    if (!cap) continue;
    const takerLoss = computePoisonTakerLossCp({
      mover: c.side,
      evalAfterMoveWhiteCp: c.cpAfterMoveWhite,
      evalAfterBaitCapturedWhiteCp: cap.cpWhite,
    });
    const poisoned = isPoisonBrilliant(takerLoss, thresholds);

    const mpv = brilliantCache[`multipv2|${DEPTH}|${c.preFen}`];
    const onlyMoveMargin = computeOnlyMoveMarginCp({
      mover: c.side,
      lines: [{ evalCp: mpv?.[1] }, { evalCp: mpv?.[2] }],
    });
    const candidate = { bait: c.bait, onlyMoveMarginCp: onlyMoveMargin, isSelfSacrifice: c.isSelfSacrifice };
    const onlyMove = isOnlyMoveBrilliant(candidate, thresholds);

    // Self-sacrifice + only-move is sufficient alone (Nxe6+ pattern — the point
    // is survival, may have no real poison at all). A bystander bait also needs
    // the capture to be absolutely decisive for the taker, not just SEE-profitable
    // and numerically ahead of the alternatives (DenLaz 26.Rf6 vs ArturoCaceres 21.Nd5).
    const selfSacrificeOnlyMove = c.isSelfSacrifice && onlyMove;
    const bystanderDecisive =
      !c.isSelfSacrifice &&
      onlyMove &&
      isBystanderCaptureDecisive({ mover: c.side, evalAfterBaitCapturedWhiteCp: cap.cpWhite, thresholds });

    if (!poisoned && !selfSacrificeOnlyMove && !bystanderDecisive) continue;

    const mechanism = poisoned ? 'poison' : selfSacrificeOnlyMove ? 'only-move (self-sac)' : 'only-move (bystander)';
    detected.push({ ...c, takerLoss, onlyMoveMargin, mechanism });
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
    // Only fetched for candidates that already have a shot at rule 1+2 (top
    // move, real bait) — the "only move" path needs the runner-up's eval to
    // measure how much worse every other legal move is (see classifyCandidates).
    const mpvKey = `multipv2|${DEPTH}|${c.preFen}`;
    if (!(mpvKey in brilliantCache) && brilliantCache[bmKey]?.bestmove === c.uci) {
      brilliantCache[mpvKey] = await engine.analyzeFenMultiPv(c.preFen, DEPTH, 2);
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
      console.log(`   [${d.mechanism}] ${d.source} ${d.side} move ${d.moveNo}. ${d.san}  (bait ${d.bait.san} profit=${d.bait.profit}, takerLoss=${d.takerLoss}cp, onlyMoveMargin=${d.onlyMoveMargin}, loss=${d.loss.toFixed(2)}, winBefore=${d.winPctBeforeMover.toFixed(1)}, winAfter=${d.winPctAfterMover.toFixed(1)})`);
    }
  }

  // ── Knob sweep (engine results cached — free) ──
  console.log('\n=== Knob sweep (scored on combined 70 sides; TP/FP/FN combined) ===');
  const rows = [];
  for (const netSacMin of [0, 1, 2]) {
    for (const seeThreshold of [1, 2, 3]) {
      for (const captureLossCp of [150, 300, 500, 800, 1200, 2000]) {
        for (const minWinAfter of [0, 30, 40, 50]) {
          for (const onlyMoveMarginMin of [100, 150, 200, 250, 300, 400, 500]) {
            for (const bystanderTakerMaxWinPct of [5, 10, 15, 20]) {
              const knobs = { seeThreshold, netSacMin, captureLossCp, minWinAfter, onlyMoveMarginMin, bystanderTakerMaxWinPct };
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
  }
  rows.sort((a, b) => a.err - b.err || b.tp - a.tp);
  for (const r of rows.slice(0, 15)) {
    console.log(`  ${JSON.stringify(r.knobs)}  err=${r.err} (kik1n ${r.kikErr} + Magnus ${r.magErr})  TP=${r.tp} FP=${r.fp} FN=${r.fn}`);
  }

  // Pareto frontier: best TP achievable at each FP budget (0,1,2,3...) — more
  // useful than "lowest total error" for picking a real precision/recall point.
  console.log('\n=== Best TP at each FP budget ===');
  const byFp = new Map();
  for (const r of rows) {
    const cur = byFp.get(r.fp);
    if (!cur || r.tp > cur.tp) byFp.set(r.fp, r);
  }
  for (const fp of [...byFp.keys()].sort((a, b) => a - b).slice(0, 6)) {
    const r = byFp.get(fp);
    console.log(`  FP=${fp}: best TP=${r.tp} (FN=${r.fn})  knobs=${JSON.stringify(r.knobs)}`);
  }

  // Sanity check on the one move-level ground truth we have:
  const rxd3 = all.candidates.find(c => c.source.includes('subham777') && !c.source.includes('_2') && c.san === 'Rxd3');
  console.log(`\nRxd3 (verified real Brilliant) is ${rxd3 ? 'a candidate' : 'NOT a candidate — still being filtered out!'}`);
  if (rxd3) {
    const det = classifyCandidates([rxd3], brilliantCache, DEFAULT_KNOBS);
    console.log(`Rxd3 detected under default knobs: ${det.length ? 'YES' : 'NO'}  (loss=${rxd3.loss.toFixed(2)}, bait=${rxd3.bait.san} profit=${rxd3.bait.profit}, winBefore=${rxd3.winPctBeforeMover.toFixed(1)}, winAfter=${rxd3.winPctAfterMover.toFixed(1)})`);
  }

  // Sanity check on the new "only move" path: MagnusCarlsen#penguingm1 29.Nxe6+
  // — a real exchange sac (no material regained), engine dead level (0cp) only
  // with this move, -190cp or worse with every alternative (see conversation).
  const nxe6 = all.candidates.find(c => c.source.includes('penguingm1') && c.san === 'Nxe6+');
  console.log(`\nNxe6+ (verified real Brilliant, "only move" case) is ${nxe6 ? 'a candidate' : 'NOT a candidate — still being filtered out!'}`);
  if (nxe6) {
    const det = classifyCandidates([nxe6], brilliantCache, DEFAULT_KNOBS);
    console.log(`Nxe6+ detected under default knobs: ${det.length ? 'YES' : 'NO'}  (mechanism=${det[0]?.mechanism}, onlyMoveMargin=${det[0]?.onlyMoveMargin}, takerLoss=${nxe6.takerLoss ?? 'n/a'}, bait=${nxe6.bait.san} profit=${nxe6.bait.profit}, winBefore=${nxe6.winPctBeforeMover.toFixed(1)}, winAfter=${nxe6.winPctAfterMover.toFixed(1)})`);
  }

  // Sanity check on the "already winning beforehand" fix: ArturoCaceres 21.Nd5
  // — hangs a pre-existing loose piece (the g6 knight from Nxg6 two moves
  // earlier); taking it is only ~99.7%→99.8% (not decisive by cp alone), but
  // absolute win% for the taker after capturing is ~0.06% — decisively lost,
  // which is what isBystanderCaptureDecisive is meant to catch.
  const nd5 = all.candidates.find(c => c.source.includes('ArturoCaceres') && c.san === 'Nd5');
  console.log(`\nNd5 (verified real Brilliant, already-winning case) is ${nd5 ? 'a candidate' : 'NOT a candidate — still being filtered out!'}`);
  if (nd5) {
    const det = classifyCandidates([nd5], brilliantCache, DEFAULT_KNOBS);
    console.log(`Nd5 detected under default knobs: ${det.length ? 'YES' : 'NO'}  (mechanism=${det[0]?.mechanism}, takerLoss=${nd5.takerLoss ?? 'n/a'}, bait=${nd5.bait.san} profit=${nd5.bait.profit}, winBefore=${nd5.winPctBeforeMover.toFixed(1)}, winAfter=${nd5.winPctAfterMover.toFixed(1)})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
