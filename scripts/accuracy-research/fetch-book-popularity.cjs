#!/usr/bin/env node
/**
 * Fetches Lichess Explorer game counts for every early-game position across
 * both calibration datasets (kik1n + MagnusCarlsen), for Book-move detection.
 *
 * Why the live Explorer instead of the static lichess-org/chess-openings named-
 * line index: that index only covers ~3800 canonical named lines, so it
 * undercounts real "book" moves that are common theory but not one of those
 * exact named lines. Chess.com's own book detection is almost certainly
 * frequency-based (a move is book if it's been played often enough), which is
 * exactly what the Explorer's game-count-per-position gives us directly.
 *
 * Walks each game ply-by-ply from move 1, stopping the first time a position's
 * game count is 0 (no point querying further — once completely unseen, later
 * positions won't be either). Caps at ply 40 as a sanity bound. Results are
 * cached by normalized FEN (board+turn+castling+en-passant) in
 * output/lichess-explorer-cache.json, gitignored, so re-running after a
 * threshold tweak in calibrate-categories.js doesn't re-fetch.
 *
 * Usage: node scripts/accuracy-research/fetch-book-popularity.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');
const { fetchLichessExplorer, totalGames } = require('../lib/lichess-explorer.cjs');
const { loadScriptEnv } = require('../lib/local-env.cjs');

loadScriptEnv();

const SAMPLES_DIR = path.join(__dirname, 'samples');
const CACHE_PATH = path.join(__dirname, 'output', 'lichess-explorer-cache.json');
const PLY_CUTOFF = 40;
const DELAY_MS = 300;

function normalizeFenForOpeningPosition(fen) {
  return fen.split(/\s+/).slice(0, 4).join(' ');
}

function loadDatasetPgns(file) {
  const data = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, file), 'utf8'));
  return Object.entries(data.games).map(([key, g]) => ({ source: `${file}#${key}`, pgn: g.pgn }));
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const games = [
    ...loadDatasetPgns('category-breakdowns.json'),
    ...loadDatasetPgns('category-breakdowns_MagnusCarlsen.json'),
  ];
  console.log(`Loaded ${games.length} games`);

  const cache = loadCache();
  let fetched = 0, skippedCached = 0, skippedZero = 0;

  for (let gi = 0; gi < games.length; gi++) {
    const { pgn, source } = games[gi];
    const chess = new Chess();
    try {
      chess.loadPgn(pgn);
    } catch (e) {
      console.error(`[skip] ${source}: ${e.message}`);
      continue;
    }
    const sans = chess.history();
    const replay = new Chess();
    let hitZero = false;

    for (let ply = 0; ply < Math.min(sans.length, PLY_CUTOFF); ply++) {
      replay.move(sans[ply]);
      const key = normalizeFenForOpeningPosition(replay.fen());

      if (key in cache) {
        skippedCached++;
        if (cache[key] === 0) { hitZero = true; break; }
        continue;
      }
      if (hitZero) break;

      try {
        await sleep(DELAY_MS);
        const data = await fetchLichessExplorer(replay.fen(), { moves: 1, recentGames: 0, topGames: 0, retries: 2 });
        const games_ = totalGames(data);
        cache[key] = games_;
        fetched++;
        process.stdout.write(`\r[${gi + 1}/${games.length}] ${source} ply ${ply + 1}: ${games_.toLocaleString()} games  (fetched ${fetched}, cached ${skippedCached})   `);
        if (games_ === 0) { skippedZero++; hitZero = true; }
      } catch (err) {
        console.error(`\n[error] ${source} ply ${ply + 1}: ${err.message}`);
        hitZero = true; // don't hammer on repeated failures for this game
      }
    }
    // Save incrementally so a crash/rate-limit doesn't lose progress.
    saveCache(cache);
  }

  console.log(`\n\nDone. Fetched ${fetched} new positions, ${skippedCached} already cached, ${skippedZero} hit zero games.`);
  console.log(`Cache: ${CACHE_PATH} (${Object.keys(cache).length} positions total)`);
}

main().catch(e => { console.error(e); process.exit(1); });
