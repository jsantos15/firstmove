#!/usr/bin/env node
// Fetches Lichess Explorer game counts for every opening_lines row in Supabase,
// writes popularity_games + popularity_rank back to opening_lines, and aggregates
// to openings_catalog (total games + preview_fen from the main line).
//
// Progress is saved per line (Supabase PATCH after each success). Re-running the
// script automatically skips lines that already have popularity_games set, so it
// always continues from where it left off.
//
// Usage:
//   node scripts/fetch-opening-popularity.cjs
//   node scripts/fetch-opening-popularity.cjs --force          (re-fetch even if data exists)
//   node scripts/fetch-opening-popularity.cjs --opening <slug> (single opening only)
//   node scripts/fetch-opening-popularity.cjs --delay-ms 1200  (slower cadence if desired)

const path = require("path");
const {
  assertLocalPipelineSupabaseUrl,
  loadScriptEnv,
} = require("./lib/local-env.cjs");
const { fetchLichessExplorer } = require("./lib/lichess-explorer.cjs");
const { Chess } = require("./lib/chess-js.cjs");

loadScriptEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in scripts/.env");
  process.exit(1);
}
assertLocalPipelineSupabaseUrl(SUPABASE_URL, "fetch-opening-popularity.cjs");

const DEFAULT_DELAY_MS = 800; // matches generate-opening-candidates.cjs default

function parseArgs() {
  const a = { force: false, onlyOpening: null, delayMs: DEFAULT_DELAY_MS };
  for (let i = 2; i < process.argv.length; i++) {
    const t = process.argv[i];
    if (t === "--force")    { a.force = true; continue; }
    if (t === "--opening")  { a.onlyOpening = process.argv[++i]; continue; }
    if (t === "--delay-ms") { a.delayMs = Number(process.argv[++i]); continue; }
  }
  return a;
}

const args = parseArgs();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

const sbHeaders = {
  "Content-Type": "application/json",
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

async function sbGet(table, params = {}) {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    const res = await fetch(url.toString(), { headers: sbHeaders });
    if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

async function sbPatch(table, col, val, body) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set(col, `eq.${val}`);
  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table}: ${res.status} ${await res.text()}`);
}

async function sbPatchOpeningLine(openingSlug, lineSlug, body) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/opening_lines`);
  url.searchParams.set("opening_slug", `eq.${openingSlug}`);
  url.searchParams.set("slug", `eq.${lineSlug}`);
  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH opening_lines: ${res.status} ${await res.text()}`);
}

// ─── Lichess fetch (custom retry loop) ───────────────────────────────────────
// We bypass the lib's fetchWithRetry so we can distinguish 429/401 (hard stop)
// from transient network errors (retry with backoff).

class LichessStopError extends Error {}

async function fetchGamesForFen(fen) {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      // same backoff formula as the lib (delayMs * attempt)
      await sleep(args.delayMs * attempt);
    }

    try {
      // retries:1 disables the lib's own retry loop — we're controlling it here
      const data = await fetchLichessExplorer(fen, {
        moves: 1,
        recentGames: 0,
        topGames: 0,
        retries: 1,
      });
      return (data.white ?? 0) + (data.draws ?? 0) + (data.black ?? 0);
    } catch (err) {
      const msg = String(err.message ?? "");

      // 429 — rate limited: stop the script immediately, do NOT retry
      if (msg.includes("429")) {
        throw new LichessStopError(
          "Rate limited by Lichess (429). Stopping to protect your account.\n" +
          "All data fetched so far is saved. Run again in a few minutes to continue."
        );
      }

      // 401 — bad/missing token: stop immediately, retrying won't help
      if (msg.includes("401")) {
        throw new LichessStopError(
          "Lichess returned 401 Unauthorized. Check LICHESS_API_TOKEN in scripts/.env."
        );
      }

      // Transient error — retry if we have attempts left
      if (attempt < MAX_RETRIES) {
        console.warn(`    Transient error (attempt ${attempt}/${MAX_RETRIES}): ${msg} — retrying…`);
      } else {
        throw err; // exhausted retries, let caller handle
      }
    }
  }
}

// ─── Chess helpers ────────────────────────────────────────────────────────────

function fenAfterMoves(sans) {
  const chess = new Chess();
  for (const san of sans) {
    if (!chess.move(san)) {
      console.warn(`    Invalid SAN: ${san} — stopping early`);
      break;
    }
  }
  return chess.fen();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.LICHESS_API_TOKEN && !process.env.LICHESS_TOKEN && !process.env.LICHESS_EXPLORER_COOKIE) {
    console.warn("⚠  No LICHESS_API_TOKEN in scripts/.env — unauthenticated requests may hit rate limits.\n");
  }

  let lines = await sbGet("opening_lines", {
    select: "slug,opening_slug,sans,popularity_games,is_main_line",
    order: "opening_slug.asc,is_main_line.desc,sort_order.asc",
  });

  if (args.onlyOpening) {
    lines = lines.filter((l) => l.opening_slug === args.onlyOpening);
    if (!lines.length) {
      console.error(`No lines found for opening: ${args.onlyOpening}`);
      process.exit(1);
    }
  }

  const toFetch = args.force ? lines : lines.filter((l) => l.popularity_games === null);
  const alreadyDone = lines.length - toFetch.length;

  console.log(`${lines.length} total lines  |  ${alreadyDone} already saved (skipping)  |  ${toFetch.length} to fetch`);
  console.log(`Delay: ${args.delayMs}ms between requests  |  Backoff: ${args.delayMs}ms × attempt on retry\n`);

  // Group lines by opening (keep track of all lines per opening, not just the ones to fetch)
  const openingSlugs = [...new Set(lines.map((l) => l.opening_slug))];

  for (const openingSlug of openingSlugs) {
    const openingLines = lines.filter((l) => l.opening_slug === openingSlug);
    const linesToFetch = openingLines.filter((l) => args.force || l.popularity_games === null);

    if (!linesToFetch.length) {
      console.log(`── ${openingSlug} — all ${openingLines.length} lines already saved, skipping`);
      continue;
    }

    console.log(`── ${openingSlug} (${linesToFetch.length} to fetch, ${openingLines.length - linesToFetch.length} already saved)`);

    let mainLineFen = null;
    const gamesMap = {};

    // Seed with already-saved values so ranking uses the full picture
    for (const line of openingLines) {
      if (line.popularity_games !== null) gamesMap[line.slug] = line.popularity_games;
    }

    for (const line of linesToFetch) {
      const fen = fenAfterMoves(line.sans);
      if (line.is_main_line && !mainLineFen) mainLineFen = fen;

      await sleep(args.delayMs); // inter-request pacing

      try {
        const games = await fetchGamesForFen(fen);
        gamesMap[line.slug] = games;
        console.log(`  ✓ ${line.slug}: ${games.toLocaleString()} games`);
        // Save immediately — progress survives a stop
        await sbPatchOpeningLine(line.opening_slug, line.slug, { popularity_games: games });
      } catch (err) {
        if (err instanceof LichessStopError) {
          console.error(`\n⛔ ${err.message}\n`);
          process.exit(0); // clean exit — all saves already committed
        }
        // Skippable error — log and continue; line stays null, will retry next run
        console.error(`  ✗ ${line.slug}: ${err.message}`);
      }
    }

    // Re-rank all lines in this opening using the full gamesMap
    if (mainLineFen === null) {
      const mainLine = openingLines.find((l) => l.is_main_line);
      if (mainLine) mainLineFen = fenAfterMoves(mainLine.sans);
    }

    const ranked = Object.entries(gamesMap)
      .filter(([, g]) => g !== null)
      .sort(([, a], [, b]) => b - a);

    for (let i = 0; i < ranked.length; i++) {
      const line = openingLines.find((candidate) => candidate.slug === ranked[i][0]);
      if (line) {
        await sbPatchOpeningLine(line.opening_slug, line.slug, { popularity_rank: i + 1 });
      }
    }

    const totalGamesSum = Object.values(gamesMap).reduce((s, g) => s + (g ?? 0), 0);
    const catalogUpdate = { popularity_games: totalGamesSum };
    if (mainLineFen) catalogUpdate.preview_fen = mainLineFen;

    await sbPatch("openings_catalog", "slug", openingSlug, catalogUpdate);
    console.log(`  → catalog: ${totalGamesSum.toLocaleString()} total games\n`);
  }

  // Recompute openings_catalog popularity_rank across all openings
  if (!args.onlyOpening) {
    console.log("Recomputing catalog popularity ranks…");
    const catalog = await sbGet("openings_catalog", {
      select: "slug,popularity_games",
      order: "popularity_games.desc.nullslast",
    });

    let rank = 1;
    for (const row of catalog) {
      if (row.popularity_games !== null) {
        await sbPatch("openings_catalog", "slug", row.slug, { popularity_rank: rank++ });
      }
    }
    console.log(`  Ranked ${rank - 1} openings`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
