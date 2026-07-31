#!/usr/bin/env node
// Populates lichess_opening_popularity with every named opening and variation
// from the lichess-org/chess-openings dataset, then fetches Lichess Explorer
// game counts at each entry's anchor position.
//
// Two-phase design:
//   Phase 1 — populate: upsert all rows from the dataset (no Lichess API calls).
//   Phase 2 — fetch:    for each row without popularity_games, call Lichess Explorer.
//
// Because Phase 1 is fast and Phase 2 is slow (~800ms/row × ~3500 rows ≈ 47 min),
// you can run them separately or together. Progress is saved per row — re-running
// always skips rows that already have popularity_games set.
//
// Usage:
//   node scripts/fetch-lichess-popularity.cjs                    (populate + fetch all)
//   node scripts/fetch-lichess-popularity.cjs --populate-only    (insert rows, skip fetch)
//   node scripts/fetch-lichess-popularity.cjs --fetch-only       (skip insert, fetch missing)
//   node scripts/fetch-lichess-popularity.cjs --eco-volume c     (one ECO volume: a/b/c/d/e)
//   node scripts/fetch-lichess-popularity.cjs --type opening     (openings only)
//   node scripts/fetch-lichess-popularity.cjs --type variation   (variations only)
//   node scripts/fetch-lichess-popularity.cjs --force            (re-fetch already-populated rows)
//   node scripts/fetch-lichess-popularity.cjs --delay-ms 1200    (slower cadence)

const path = require("path");
const {
  assertLocalPipelineSupabaseUrl,
  loadScriptEnv,
} = require("./lib/local-env.cjs");
const { fetchChessOpeningsDataset, normalizeText } = require("./lib/chess-openings-source.cjs");
const { fetchLichessExplorer } = require("./lib/lichess-explorer.cjs");
const { Chess } = require("./lib/chess-js.cjs");

loadScriptEnv();

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in scripts/.env");
  process.exit(1);
}
assertLocalPipelineSupabaseUrl(SUPABASE_URL, "fetch-lichess-popularity.cjs");

// ─── Args ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const a = {
    populateOnly: false,
    fetchOnly:    false,
    force:        false,
    ecoVolume:    null,   // null = all, or 'a'/'b'/'c'/'d'/'e'
    type:         null,   // null = all, or 'opening'/'variation'
    delayMs:      800,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const t = process.argv[i];
    if (t === "--populate-only") { a.populateOnly = true; continue; }
    if (t === "--fetch-only")    { a.fetchOnly    = true; continue; }
    if (t === "--force")         { a.force        = true; continue; }
    if (t === "--eco-volume")    { a.ecoVolume    = process.argv[++i]?.toLowerCase(); continue; }
    if (t === "--type")          { a.type         = process.argv[++i]?.toLowerCase(); continue; }
    if (t === "--delay-ms")      { a.delayMs      = Number(process.argv[++i]); continue; }
  }
  return a;
}

const args = parseArgs();

// ─── Supabase helpers ─────────────────────────────────────────────────────────

const sbHeaders = {
  "Content-Type": "application/json",
  apikey:          SERVICE_ROLE_KEY,
  Authorization:  `Bearer ${SERVICE_ROLE_KEY}`,
};

async function sbGet(table, params = {}) {
  const PAGE = 1000;
  let offset = 0;
  const all = [];

  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("limit", String(PAGE));
    url.searchParams.set("offset", String(offset));
    const res = await fetch(url.toString(), {
      headers: { ...sbHeaders, Prefer: "count=none" },
    });
    if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    all.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  return all;
}

async function sbUpsertBatch(table, conflictCols, rows) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictCols}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(rows),
    });
  } catch (err) {
    const cause = err.cause?.message ?? err.cause ?? err.message;
    throw new Error(`UPSERT network error (${rows.length} rows): ${cause}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`UPSERT ${table} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
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

// ─── Chess helpers ────────────────────────────────────────────────────────────

function fenAfterMoves(sans) {
  const chess = new Chess();
  for (const san of sans) {
    if (!chess.move(san)) break;
  }
  return chess.fen();
}

function slugify(text) {
  return normalizeText(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Lichess fetch ────────────────────────────────────────────────────────────

class LichessStopError extends Error {}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchGamesForFen(fen) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await sleep(args.delayMs * attempt);
    try {
      const data = await fetchLichessExplorer(fen, {
        moves: 1, recentGames: 0, topGames: 0,
        retries: 1,
      });
      return (data.white ?? 0) + (data.draws ?? 0) + (data.black ?? 0);
    } catch (err) {
      const msg = String(err.message ?? "");
      if (msg.includes("429")) {
        throw new LichessStopError(
          "Rate limited (429) — stopping to protect your account.\n" +
          "All saved data is safe. Run again in a few minutes to continue."
        );
      }
      if (msg.includes("401")) {
        throw new LichessStopError(
          "Unauthorized (401) — check LICHESS_API_TOKEN in scripts/.env."
        );
      }
      if (attempt < 3) {
        console.warn(`    Transient error (attempt ${attempt}/3): ${msg} — retrying…`);
      } else {
        throw err;
      }
    }
  }
}

// ─── Dataset transformation ───────────────────────────────────────────────────
// Builds DB rows from the chess-openings dataset entries.
// Openings:   entries with no variation (name has no ':' or variation === '')
// Variations: entries with a variation component

function buildRows(entries) {
  // Build a map from family_name → eco_code of the opening-type entry
  // so we can attach opening_eco_code to every variation row.
  const openingEcoByFamily = new Map();
  for (const e of entries) {
    if (!e.variation) {
      // This entry IS the opening anchor — record its ECO
      if (!openingEcoByFamily.has(e.family)) {
        openingEcoByFamily.set(e.family, e.eco);
      }
    }
  }

  return entries.map((e) => {
    const isOpening   = !e.variation;
    const type        = isOpening ? "opening" : "variation";
    const anchorFen   = fenAfterMoves(e.sans);

    return {
      eco_code:         e.eco,
      full_name:        e.name,
      family_name:      e.family,
      variation_name:   e.variation || null,
      type,
      opening_eco_code: isOpening ? null : (openingEcoByFamily.get(e.family) ?? null),
      anchor_sans:      e.sans,
      anchor_fen:       anchorFen,
      popularity_games: null,
      fetched_at:       null,
    };
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.LICHESS_API_TOKEN && !process.env.LICHESS_TOKEN) {
    console.warn("⚠  No LICHESS_API_TOKEN in scripts/.env — unauthenticated requests may hit rate limits.\n");
  }

  // ── Phase 1: Populate ────────────────────────────────────────────────────────
  if (!args.fetchOnly) {
    console.log("Phase 1 — loading lichess-org/chess-openings dataset…");
    const entries = await fetchChessOpeningsDataset();

    let filtered = entries;
    if (args.ecoVolume) {
      filtered = filtered.filter((e) => e.eco.toLowerCase().startsWith(args.ecoVolume));
    }
    if (args.type) {
      filtered = filtered.filter((e) => {
        const isOpening = !e.variation;
        return args.type === "opening" ? isOpening : !isOpening;
      });
    }

    console.log(`  ${entries.length} total entries in dataset, ${filtered.length} after filters`);

    const allRows = buildRows(filtered);
    // Deduplicate by (eco_code, full_name) — dataset has some duplicate entries
    const seen = new Set();
    const rows = allRows.filter((r) => {
      const key = `${r.eco_code}||${r.full_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (rows.length < allRows.length) {
      console.log(`  Deduplicated: ${allRows.length} → ${rows.length} rows`);
    }

    // Upsert in batches of 50 — smaller payload per request is safer
    const BATCH = 50;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await sbUpsertBatch("lichess_opening_popularity", "eco_code,full_name", batch);
      inserted += batch.length;
      process.stdout.write(`\r  Upserted ${inserted}/${rows.length}…`);
    }
    console.log(`\n  Done — ${rows.length} rows in lichess_opening_popularity`);
  }

  // ── Phase 2: Fetch Lichess game counts ───────────────────────────────────────
  if (!args.populateOnly) {
    console.log("\nPhase 2 — fetching Lichess Explorer game counts…");

    const params = {
      select: "id,eco_code,full_name,type,anchor_fen,popularity_games",
      order:  "type.asc,eco_code.asc",
    };
    if (args.ecoVolume) params["eco_code"] = `like.${args.ecoVolume.toUpperCase()}*`;
    if (args.type)      params["type"]      = `eq.${args.type}`;

    const allRows = await sbGet("lichess_opening_popularity", params);

    const toFetch = args.force
      ? allRows
      : allRows.filter((r) => r.popularity_games === null);

    console.log(`  ${allRows.length} rows total  |  ${allRows.length - toFetch.length} already fetched  |  ${toFetch.length} to fetch`);
    console.log(`  Delay: ${args.delayMs}ms/request  |  Est. time: ~${Math.ceil(toFetch.length * args.delayMs / 60000)} min\n`);

    let done = 0;
    for (const row of toFetch) {
      await sleep(args.delayMs);

      try {
        const games = await fetchGamesForFen(row.anchor_fen);
        await sbPatch("lichess_opening_popularity", "id", row.id, {
          popularity_games: games,
          fetched_at: new Date().toISOString(),
        });
        done++;
        process.stdout.write(
          `\r  [${done}/${toFetch.length}] ${row.eco_code} ${row.full_name.slice(0, 40).padEnd(40)} ${games.toLocaleString()} games`
        );
      } catch (err) {
        if (err instanceof LichessStopError) {
          console.error(`\n\n⛔ ${err.message}\n`);
          console.error(`   Progress saved — ${done} rows fetched this run. Re-run to continue.\n`);
          process.exit(0);
        }
        console.warn(`\n  ✗ ${row.eco_code} ${row.full_name}: ${err.message}`);
      }
    }

    console.log(`\n\n  Fetched ${done} rows.`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
