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

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    dryRun: false,
    apply: false,
    scopePayloadOpenings: false,
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

    if (token === "--apply") {
      args.apply = true;
      continue;
    }

    if (token === "--scope-payload-openings") {
      args.scopePayloadOpenings = true;
      continue;
    }
  }

  if (!args.apply) {
    args.dryRun = true;
  }

  return args;
}

function readPayload(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing payload file: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getEnv() {
  loadScriptEnv();
  loadEnvFile(path.join(__dirname, "..", "apps", "web", ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  assertLocalPipelineSupabaseUrl(supabaseUrl, "sync-opening-db-payload.cjs");

  return {
    supabaseUrl,
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  };
}

async function fetchAllRows(table, select, headers, supabaseUrl) {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
    url.searchParams.set("select", select);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, {
      headers,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Fetch from ${table} failed (${response.status}): ${body}`);
    }

    const page = await response.json();
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return rows;
}

async function deleteByOrFilters(table, filters, headers, supabaseUrl) {
  if (filters.length === 0) {
    return;
  }

  const chunkSize = 50;
  for (let index = 0; index < filters.length; index += chunkSize) {
    const chunk = filters.slice(index, index + chunkSize);
    const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
    url.searchParams.set("or", `(${chunk.join(",")})`);

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        ...headers,
        Prefer: "return=minimal",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Delete from ${table} failed (${response.status}): ${body}`);
    }
  }
}

function escapeFilterValue(value) {
  return String(value).replace(/"/g, '\\"');
}

function buildStaleRows(payload, remoteOpenings, remoteLines, options = {}) {
  const desiredOpeningSlugs = new Set(
    (payload.currentSchema?.openingsCatalogRows ?? []).map((row) => row.slug)
  );
  const desiredLineKeys = new Set(
    (payload.currentSchema?.openingLinesRows ?? []).map(
      (row) => `${row.opening_slug}::${row.slug}`
    )
  );

  const staleOpenings = options.scopePayloadOpenings
    ? []
    : remoteOpenings.filter((row) => !desiredOpeningSlugs.has(row.slug));
  const staleLines = remoteLines.filter((row) => {
    if (
      options.scopePayloadOpenings &&
      !desiredOpeningSlugs.has(row.opening_slug)
    ) {
      return false;
    }

    return !desiredLineKeys.has(`${row.opening_slug}::${row.slug}`);
  });

  return {
    staleOpenings,
    staleLines,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = readPayload(args.input);
  const { supabaseUrl, headers } = getEnv();

  const [remoteOpenings, remoteLines] = await Promise.all([
    fetchAllRows("openings_catalog", "slug,name", headers, supabaseUrl),
    fetchAllRows("opening_lines", "opening_slug,slug,name", headers, supabaseUrl),
  ]);

  const { staleOpenings, staleLines } = buildStaleRows(
    payload,
    remoteOpenings,
    remoteLines,
    { scopePayloadOpenings: args.scopePayloadOpenings }
  );

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          payloadOpenings: payload.counts?.openings ?? null,
          payloadLines: payload.counts?.lines ?? null,
          remoteOpenings: remoteOpenings.length,
          remoteLines: remoteLines.length,
          staleOpeningCount: staleOpenings.length,
          staleLineCount: staleLines.length,
          scopePayloadOpenings: args.scopePayloadOpenings,
          staleOpeningSample: staleOpenings.slice(0, 20),
          staleLineSample: staleLines.slice(0, 20),
        },
        null,
        2
      )
    );
    return;
  }

  const lineFilters = staleLines.map(
    (row) =>
      `and(opening_slug.eq."${escapeFilterValue(row.opening_slug)}",slug.eq."${escapeFilterValue(row.slug)}")`
  );

  await deleteByOrFilters("opening_lines", lineFilters, headers, supabaseUrl);

  const openingFilters = staleOpenings.map(
    (row) => `slug.eq."${escapeFilterValue(row.slug)}"`
  );

  await deleteByOrFilters(
    "openings_catalog",
    openingFilters,
    headers,
    supabaseUrl
  );

  console.log(
    JSON.stringify(
      {
        pruned: true,
        staleOpeningsRemoved: staleOpenings.length,
        staleLinesRemoved: staleLines.length,
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
