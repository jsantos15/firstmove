#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  assertLocalPipelineSupabaseUrl,
  loadEnvFile,
  loadScriptEnv,
} = require("./lib/local-env.cjs");

const DEFAULT_INPUT = path.resolve(
  __dirname,
  "output",
  "opening-db-payload.json"
);
const DEFAULT_BEST_EVAL_CACHE = path.resolve(
  __dirname,
  "output",
  "best-known-eval-cache.json"
);
const DEFAULT_CHUNK_SIZE = 500;
const POSITION_EVAL_CHUNK_SIZE = 100;
const MIN_POSITION_EVAL_CHUNK_SIZE = 25;
const MAX_UPSERT_ATTEMPTS = 4;

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    bestEvalCache: DEFAULT_BEST_EVAL_CACHE,
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

    if (token === "--best-eval-cache") {
      args.bestEvalCache = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return args;
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

function buildLineRows(payload, options = {}) {
  const metadataBySlug = new Map(
    (payload.futureMetadata?.lineStudyMetadata ?? []).map((entry) => [
      `${entry.openingSlug}::${entry.slug}`,
      entry,
    ])
  );
  const includeEngineEval = options.includeEngineEval ?? true;
  const includeEvalByPly = options.includeEvalByPly ?? true;
  const includeLineKind = options.includeLineKind ?? false;

  return (payload.currentSchema?.openingLinesRows ?? []).map((row) => {
    const metadata = metadataBySlug.get(`${row.opening_slug}::${row.slug}`);

    const lineRow = {
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
      variation_path: metadata?.variationPath ?? null,
      variation_depth: metadata?.variationDepth ?? null,
      variation_anchor_ply: metadata?.variationAnchorPly ?? null,
      variation_anchor_name: metadata?.variationAnchorName ?? null,
      variation_anchor_fen: metadata?.variationAnchorFen ?? null,
      variation_anchor_sans: metadata?.variationAnchorSans ?? null,
    };

    if (includeEngineEval) {
      lineRow.final_eval_cp = metadata?.finalEvalCp ?? null;
      lineRow.final_eval_perspective = metadata?.finalEvalPerspective ?? null;
      lineRow.engine_checked = metadata?.engineChecked ?? false;
    }

    if (includeEvalByPly) {
      lineRow.eval_cp_by_ply = metadata?.evalCpByPly ?? null;
    }

    if (options.includeGenerationMetadata) {
      lineRow.engine_provider = metadata?.engineProvider ?? null;
      lineRow.engine_model = metadata?.engineModel ?? null;
      lineRow.avg_engine_depth = metadata?.avgEngineDepth ?? null;
      lineRow.generation_metadata = metadata?.generationMetadata ?? {};
    }

    if (includeLineKind) {
      lineRow.line_kind = metadata?.lineKind ?? "reference";
    }

    return lineRow;
  });
}

function buildBranchMetadataRows(payload) {
  return payload.currentSchema?.openingLineBranchMetadataRows ?? [];
}

function normalizedPositionKey(fen) {
  return String(fen).split(/\s+/).slice(0, 4).join(" ");
}

function providerFromSource(source) {
  if (source === "lichess-cloud-eval") {
    return "lichess";
  }

  if (source === "chess-api") {
    return "chess-api";
  }

  if (source === "stockfish") {
    return "stockfish";
  }

  return source ?? "unknown";
}

function buildPositionEvalRows(cachePath) {
  if (!cachePath || !fs.existsSync(cachePath)) {
    return [];
  }

  const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  return Object.entries(cache)
    .map(([key, entry]) => {
      const result = entry?.result;
      if (!result?.fen || !result?.bestMove || result.bestMove === "(none)") {
        return null;
      }

      const bestLine = Array.isArray(result.lines) ? result.lines[0] : null;
      const score = bestLine?.score ?? null;
      const whiteScore = bestLine?.whiteScore ?? null;

      return {
        position_key: normalizedPositionKey(result.fen) || key,
        fen: result.fen,
        provider: entry.provider ?? providerFromSource(result.source),
        source: result.source ?? entry.source ?? "unknown",
        engine_model: result.engineFlavor ?? null,
        depth: Number.isFinite(result.depth) ? result.depth : null,
        multipv: Array.isArray(result.lines) ? result.lines.length : 0,
        best_move_uci: result.bestMove,
        ponder_uci: result.ponder ?? null,
        score_type: score?.type ?? null,
        score_value: Number.isFinite(score?.value) ? score.value : null,
        white_score_value: Number.isFinite(whiteScore?.value) ? whiteScore.value : null,
        line_count: Array.isArray(result.lines) ? result.lines.length : 0,
        quality: entry.quality ?? {},
        lines: result.lines ?? [],
        raw_eval: result,
      };
    })
    .filter(Boolean);
}

async function hasOpeningPositionEvalsTable(headers, supabaseUrl) {
  const url = new URL(`${supabaseUrl}/rest/v1/opening_position_evals`);
  url.searchParams.set("select", "position_key");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers,
  });

  return response.ok;
}

async function hasOpeningLineBranchMetadataTable(headers, supabaseUrl) {
  const url = new URL(`${supabaseUrl}/rest/v1/opening_line_branch_metadata`);
  url.searchParams.set("select", "opening_slug,line_slug");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers,
  });

  return response.ok;
}

async function hasOpeningLineKindColumn(headers, supabaseUrl) {
  const url = new URL(`${supabaseUrl}/rest/v1/opening_lines`);
  url.searchParams.set("select", "line_kind");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers,
  });

  return response.ok;
}

async function hasOpeningLineEngineEvalColumns(headers, supabaseUrl) {
  const url = new URL(`${supabaseUrl}/rest/v1/opening_lines`);
  url.searchParams.set(
    "select",
    "final_eval_cp,final_eval_perspective,engine_checked"
  );
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers,
  });

  return response.ok;
}

async function hasOpeningLineEvalByPlyColumn(headers, supabaseUrl) {
  const url = new URL(`${supabaseUrl}/rest/v1/opening_lines`);
  url.searchParams.set("select", "eval_cp_by_ply");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers,
  });

  return response.ok;
}

async function hasOpeningLineGenerationMetadataColumns(headers, supabaseUrl) {
  const url = new URL(`${supabaseUrl}/rest/v1/opening_lines`);
  url.searchParams.set(
    "select",
    "engine_provider,engine_model,avg_engine_depth,generation_metadata"
  );
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers,
  });

  return response.ok;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableUpsertFailure(error) {
  if (!error) return false;
  if (error.status === 429 || error.status === 408) return true;
  if (typeof error.status === "number" && error.status >= 500) return true;
  return /57014|timeout|temporarily|connection|fetch failed|network|ECONNRESET|ETIMEDOUT|UND_ERR|terminated/i.test(
    error.body ?? error.cause?.message ?? error.message ?? ""
  );
}

async function upsert(table, rows, headers, supabaseUrl) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(
      `Upsert into ${table} failed (${response.status}): ${body}`
    );
    error.status = response.status;
    error.body = body;
    throw error;
  }
}

async function upsertWithRetry(table, rows, headers, supabaseUrl, options = {}) {
  const maxAttempts = options.maxAttempts ?? MAX_UPSERT_ATTEMPTS;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await upsert(table, rows, headers, supabaseUrl);
      return;
    } catch (error) {
      const shouldRetry = attempt < maxAttempts && isRetryableUpsertFailure(error);
      if (!shouldRetry) throw error;

      const delayMs = 750 * 2 ** (attempt - 1);
      console.warn(
        `Retrying ${table} upsert chunk (${rows.length} rows) after attempt ${attempt}/${maxAttempts}: ${
          error.message
        }`
      );
      await sleep(delayMs);
    }
  }
}

async function upsertResilientChunk(table, rows, headers, supabaseUrl, options = {}) {
  const minChunkSize = options.minChunkSize ?? rows.length;
  try {
    await upsertWithRetry(table, rows, headers, supabaseUrl, options);
    return rows.length;
  } catch (error) {
    if (rows.length <= minChunkSize || !isRetryableUpsertFailure(error)) {
      throw error;
    }

    const midpoint = Math.ceil(rows.length / 2);
    console.warn(
      `Splitting ${table} upsert chunk from ${rows.length} to ${midpoint}/${rows.length - midpoint} rows after retryable failure.`
    );
    const first = await upsertResilientChunk(
      table,
      rows.slice(0, midpoint),
      headers,
      supabaseUrl,
      options
    );
    const second = await upsertResilientChunk(
      table,
      rows.slice(midpoint),
      headers,
      supabaseUrl,
      options
    );
    return first + second;
  }
}

async function upsertInChunks(table, rows, headers, supabaseUrl, options = {}) {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const progressEvery = options.progressEvery ?? 25;
  let imported = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    imported += await upsertResilientChunk(
      table,
      rows.slice(index, index + chunkSize),
      headers,
      supabaseUrl,
      options
    );

    const chunkNumber = Math.ceil(index / chunkSize) + 1;
    if (
      rows.length > chunkSize &&
      (chunkNumber === 1 ||
        imported === rows.length ||
        chunkNumber % progressEvery === 0)
    ) {
      console.log(`${table}: imported ${imported}/${rows.length} rows`);
    }
  }

  return imported;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadScriptEnv();
  loadEnvFile(path.join(__dirname, "..", "apps", "web", ".env.local"));

  const payload = readPayload(args.input);
  const catalogRows = buildCatalogRows(payload);
  const positionEvalRows = buildPositionEvalRows(args.bestEvalCache);
  const branchMetadataRows = buildBranchMetadataRows(payload);

  if (args.dryRun) {
    const lineRows = buildLineRows(payload, {
      includeGenerationMetadata: true,
      includeLineKind: true,
    });
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          input: args.input,
          openings: catalogRows.length,
          lines: lineRows.length,
          branchMetadata: branchMetadataRows.length,
          positionEvals: positionEvalRows.length,
          sampleOpening: catalogRows[0],
          sampleLine: lineRows[0],
          sampleBranchMetadata: branchMetadataRows[0],
          samplePositionEval: positionEvalRows[0],
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
  assertLocalPipelineSupabaseUrl(supabaseUrl, "import-opening-db-payload.cjs");

  const headers = {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: "resolution=merge-duplicates",
  };

  const [
    includeEngineEval,
    includeEvalByPly,
    includeGenerationMetadata,
    includePositionEvals,
    includeLineKind,
    includeBranchMetadata,
  ] =
    await Promise.all([
      hasOpeningLineEngineEvalColumns(headers, supabaseUrl),
      hasOpeningLineEvalByPlyColumn(headers, supabaseUrl),
      hasOpeningLineGenerationMetadataColumns(headers, supabaseUrl),
      hasOpeningPositionEvalsTable(headers, supabaseUrl),
      hasOpeningLineKindColumn(headers, supabaseUrl),
      hasOpeningLineBranchMetadataTable(headers, supabaseUrl),
    ]);
  const lineRows = buildLineRows(payload, {
    includeEngineEval,
    includeEvalByPly,
    includeGenerationMetadata,
    includeLineKind,
  });

  await upsert("openings_catalog", catalogRows, headers, supabaseUrl);

  await upsertInChunks("opening_lines", lineRows, headers, supabaseUrl);

  if (includeBranchMetadata) {
    await upsertInChunks(
      "opening_line_branch_metadata",
      branchMetadataRows,
      headers,
      supabaseUrl
    );
  }

  if (includePositionEvals) {
    await upsertInChunks(
      "opening_position_evals",
      positionEvalRows,
      headers,
      supabaseUrl,
      {
        chunkSize: POSITION_EVAL_CHUNK_SIZE,
        minChunkSize: MIN_POSITION_EVAL_CHUNK_SIZE,
        maxAttempts: MAX_UPSERT_ATTEMPTS,
        progressEvery: 50,
      }
    );
  }

  console.log(
    JSON.stringify(
      {
        imported: true,
        openings: catalogRows.length,
        lines: lineRows.length,
        branchMetadata: branchMetadataRows.length,
        positionEvals: positionEvalRows.length,
        engineEvalImported: includeEngineEval,
        evalByPlyImported: includeEvalByPly,
        generationMetadataImported: includeGenerationMetadata,
        positionEvalsImported: includePositionEvals,
        lineKindImported: includeLineKind,
        branchMetadataImported: includeBranchMetadata,
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
