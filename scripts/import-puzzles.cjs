#!/usr/bin/env node
// Import Lichess puzzle CSV into the FirstMove Supabase puzzles table.
//
// Download the source file from: https://database.lichess.org/#puzzles
// Decompress before running: bunzip2 lichess_db_puzzle.csv.bz2
//
// Usage:
//   node scripts/import-puzzles.cjs --input /path/to/lichess_db_puzzle.csv
//   node scripts/import-puzzles.cjs --input ./puzzles.csv --min-rating 800 --max-rating 1600
//   node scripts/import-puzzles.cjs --input ./puzzles.csv --themes fork,pin --limit 50000
//   node scripts/import-puzzles.cjs --input ./puzzles.csv --opening-tags B20,B21 --dry-run
//
// Flags:
//   --input <path>              Path to decompressed Lichess CSV (required)
//   --min-rating <n>            Only import puzzles at or above this rating (default: 0)
//   --max-rating <n>            Only import puzzles below this rating (default: none)
//   --themes <csv>              Comma-separated themes — keep puzzles that include ANY listed theme
//   --opening-tags <csv>        Comma-separated ECO prefixes (e.g. B20,E00) — prefix match on opening_tags
//   --limit <n>                 Stop after importing this many puzzles (default: unlimited)
//   --batch-size <n>            Rows per upsert request (default: 500)
//   --dry-run                   Parse and report counts without writing to Supabase
//   --progress-every <n>        Print a progress line every N rows parsed (default: 10000)

const fs = require("fs");
const readline = require("readline");
const path = require("path");
const { loadScriptEnv, loadEnvFile } = require("./lib/local-env.cjs");

// ─── Difficulty bands ─────────────────────────────────────────────────────────

function deriveDifficulty(rating) {
  if (rating < 1200) return "beginner";
  if (rating < 1600) return "intermediate";
  return "advanced";
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────
// Lichess puzzle CSV uses commas as delimiters with no quoted fields.
// Columns: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags

function parseHeader(line) {
  return line.split(",").map((h) => h.trim());
}

function parsePuzzleRow(line, columnIndex) {
  const parts = line.split(",");

  // OpeningTags (last column) is optional — may be absent or empty
  const puzzleId       = parts[columnIndex.PuzzleId]?.trim();
  const fen            = parts[columnIndex.FEN]?.trim();
  const movesRaw       = parts[columnIndex.Moves]?.trim();
  const ratingRaw      = parts[columnIndex.Rating]?.trim();
  const ratingDevRaw   = parts[columnIndex.RatingDeviation]?.trim();
  const popularityRaw  = parts[columnIndex.Popularity]?.trim();
  const nbPlaysRaw     = parts[columnIndex.NbPlays]?.trim();
  const themesRaw      = parts[columnIndex.Themes]?.trim();
  const gameUrl        = parts[columnIndex.GameUrl]?.trim() || null;
  const openingTagsRaw = parts[columnIndex.OpeningTags]?.trim() || "";

  if (!puzzleId || !fen || !movesRaw || !ratingRaw) return null;

  const rating = parseInt(ratingRaw, 10);
  if (isNaN(rating)) return null;

  return {
    puzzle_id:        puzzleId,
    fen,
    moves:            movesRaw.split(" ").filter(Boolean),
    rating,
    rating_deviation: parseInt(ratingDevRaw, 10) || 0,
    popularity:       parseInt(popularityRaw, 10) || 0,
    nb_plays:         parseInt(nbPlaysRaw, 10) || 0,
    themes:           themesRaw ? themesRaw.split(" ").filter(Boolean) : [],
    game_url:         gameUrl,
    opening_tags:     openingTagsRaw ? openingTagsRaw.split(" ").filter(Boolean) : [],
    difficulty:       deriveDifficulty(rating),
  };
}

// ─── Filtering ────────────────────────────────────────────────────────────────

function buildFilter(args) {
  const themeSet      = args.themes ? new Set(args.themes) : null;
  const openingPrefixes = args.openingTags ?? null;

  return function passes(row) {
    if (row.rating < args.minRating) return false;
    if (args.maxRating !== null && row.rating >= args.maxRating) return false;

    if (themeSet) {
      const hasTheme = row.themes.some((t) => themeSet.has(t));
      if (!hasTheme) return false;
    }

    if (openingPrefixes) {
      const hasTag = openingPrefixes.some((prefix) =>
        row.opening_tags.some((tag) => tag.startsWith(prefix))
      );
      if (!hasTag) return false;
    }

    return true;
  };
}

// ─── Supabase upsert ──────────────────────────────────────────────────────────

async function upsertBatch(rows, headers, supabaseUrl) {
  const response = await fetch(`${supabaseUrl}/rest/v1/puzzles`, {
    method: "POST",
    headers,
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Upsert failed (${response.status}): ${body}`);
  }
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    input:         null,
    minRating:     0,
    maxRating:     null,
    themes:        null,
    openingTags:   null,
    limit:         null,
    batchSize:     500,
    dryRun:        false,
    progressEvery: 10000,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    switch (token) {
      case "--input":         args.input         = path.resolve(argv[++i]); break;
      case "--min-rating":    args.minRating      = parseInt(argv[++i], 10); break;
      case "--max-rating":    args.maxRating      = parseInt(argv[++i], 10); break;
      case "--limit":         args.limit          = parseInt(argv[++i], 10); break;
      case "--batch-size":    args.batchSize      = parseInt(argv[++i], 10); break;
      case "--progress-every":args.progressEvery  = parseInt(argv[++i], 10); break;
      case "--dry-run":       args.dryRun         = true;                    break;
      case "--themes":        args.themes         = argv[++i].split(",").map(s => s.trim()).filter(Boolean); break;
      case "--opening-tags":  args.openingTags    = argv[++i].split(",").map(s => s.trim()).filter(Boolean); break;
    }
  }

  return args;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadScriptEnv();
  loadEnvFile(path.join(__dirname, "..", "apps", "web", ".env.local"));

  if (!args.input) {
    console.error("Error: --input <path> is required.");
    console.error("  Download from: https://database.lichess.org/#puzzles");
    console.error("  Decompress:    bunzip2 lichess_db_puzzle.csv.bz2");
    process.exit(1);
  }

  if (!fs.existsSync(args.input)) {
    console.error(`Error: file not found: ${args.input}`);
    process.exit(1);
  }

  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!args.dryRun && (!supabaseUrl || !serviceRoleKey)) {
    console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const supabaseHeaders = {
    "Content-Type": "application/json",
    apikey:         serviceRoleKey,
    Authorization:  `Bearer ${serviceRoleKey}`,
    Prefer:         "resolution=merge-duplicates",
  };

  const passes = buildFilter(args);

  const rl = readline.createInterface({
    input:     fs.createReadStream(args.input, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let lineNumber      = 0;
  let totalParsed     = 0;
  let totalFiltered   = 0;
  let totalImported   = 0;
  let columnIndex     = null;
  let batch           = [];
  let done            = false;

  const flushBatch = async () => {
    if (batch.length === 0 || args.dryRun) {
      totalImported += batch.length;
      batch = [];
      return;
    }
    await upsertBatch(batch, supabaseHeaders, supabaseUrl);
    totalImported += batch.length;
    batch = [];
  };

  for await (const line of rl) {
    if (done) break;

    lineNumber++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    // First non-empty line is the header
    if (lineNumber === 1) {
      const headers = parseHeader(trimmed);
      columnIndex = Object.fromEntries(headers.map((h, i) => [h, i]));

      const required = ["PuzzleId", "FEN", "Moves", "Rating", "RatingDeviation",
                        "Popularity", "NbPlays", "Themes", "GameUrl"];
      const missing = required.filter((h) => !(h in columnIndex));
      if (missing.length > 0) {
        console.error(`Error: CSV is missing expected columns: ${missing.join(", ")}`);
        process.exit(1);
      }
      // OpeningTags may be absent in older exports — default to empty
      if (!("OpeningTags" in columnIndex)) {
        columnIndex.OpeningTags = -1;
      }
      continue;
    }

    totalParsed++;

    if (totalParsed % args.progressEvery === 0) {
      process.stdout.write(
        `  parsed ${totalParsed.toLocaleString()}  kept ${totalFiltered.toLocaleString()}  imported ${totalImported.toLocaleString()}\r`
      );
    }

    const row = parsePuzzleRow(trimmed, columnIndex);
    if (!row) continue;

    if (!passes(row)) continue;

    totalFiltered++;
    batch.push(row);

    if (batch.length >= args.batchSize) {
      await flushBatch();
    }

    if (args.limit !== null && totalFiltered >= args.limit) {
      done = true;
    }
  }

  // Flush remaining
  await flushBatch();

  process.stdout.write("\n");

  console.log(
    JSON.stringify(
      {
        dryRun:       args.dryRun,
        input:        args.input,
        totalParsed,
        totalFiltered,
        totalImported,
        filters: {
          minRating:    args.minRating,
          maxRating:    args.maxRating,
          themes:       args.themes,
          openingTags:  args.openingTags,
          limit:        args.limit,
        },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
