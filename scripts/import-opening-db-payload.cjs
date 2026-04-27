#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_INPUT = path.resolve(
  __dirname,
  "output",
  "opening-db-payload.json"
);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--input") {
      args.input = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
  }

  return args;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1].trim();
    const value = match[2].trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readPayload(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing payload file: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildCatalogRows(payload) {
  const metadataBySlug = new Map(
    (payload.futureMetadata?.openingDisplayMetadata ?? []).map((entry) => [
      entry.slug,
      entry,
    ])
  );

  return (payload.currentSchema?.openingsCatalogRows ?? []).map((row) => {
    const metadata = metadataBySlug.get(row.slug);

    return {
      ...row,
      display_tier: metadata?.displayTier ?? null,
      is_featured: metadata?.isFeatured ?? null,
      popularity_rank: metadata?.popularityRank ?? null,
      popularity_score: metadata?.popularityScore ?? null,
      popularity_games: metadata?.popularityGames ?? null,
      has_main_line: metadata?.hasMainLine ?? false,
    };
  });
}

function buildLineRows(payload) {
  const metadataBySlug = new Map(
    (payload.futureMetadata?.lineStudyMetadata ?? []).map((entry) => [
      `${entry.openingSlug}::${entry.slug}`,
      entry,
    ])
  );

  return (payload.currentSchema?.openingLinesRows ?? []).map((row) => {
    const metadata = metadataBySlug.get(`${row.opening_slug}::${row.slug}`);

    return {
      ...row,
      full_name: metadata?.fullName ?? null,
      primary_category: metadata?.primaryCategory ?? null,
      inclusion_outcome: metadata?.inclusionOutcome ?? null,
      line_difficulty: metadata?.lineDifficulty ?? null,
      is_main_line: metadata?.isMainLine ?? false,
      popularity_rank: metadata?.popularityRankWithinOpening ?? null,
      popularity_score: metadata?.popularityScore ?? null,
      popularity_games: metadata?.popularityGames ?? null,
      source_name: metadata?.sourceName ?? null,
      source_confidence: metadata?.sourceConfidence ?? null,
    };
  });
}

async function upsert(table, rows, headers, supabaseUrl) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Upsert into ${table} failed (${response.status}): ${body}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(path.join(__dirname, "..", "apps", "web", ".env.local"));

  const payload = readPayload(args.input);
  const catalogRows = buildCatalogRows(payload);
  const lineRows = buildLineRows(payload);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          input: args.input,
          openings: catalogRows.length,
          lines: lineRows.length,
          sampleOpening: catalogRows[0],
          sampleLine: lineRows[0],
        },
        null,
        2
      )
    );
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  const headers = {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: "resolution=merge-duplicates",
  };

  await upsert("openings_catalog", catalogRows, headers, supabaseUrl);

  const chunkSize = 500;
  for (let index = 0; index < lineRows.length; index += chunkSize) {
    await upsert(
      "opening_lines",
      lineRows.slice(index, index + chunkSize),
      headers,
      supabaseUrl
    );
  }

  console.log(
    JSON.stringify(
      {
        imported: true,
        openings: catalogRows.length,
        lines: lineRows.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
