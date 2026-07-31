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
  "opening-position-index.json"
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
    }
  }

  return args;
}

function readPayload(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing opening position index: ${filePath}`);
  }

  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(payload.rows)) {
    throw new Error("Opening position index must contain a rows array.");
  }

  return payload;
}

async function upsertRows(rows, headers, supabaseUrl) {
  const response = await fetch(`${supabaseUrl}/rest/v1/opening_positions`, {
    method: "POST",
    headers,
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Upsert into opening_positions failed (${response.status}): ${body}`
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = readPayload(args.input);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          input: args.input,
          positions: payload.rows.length,
          sample: payload.rows[0] ?? null,
        },
        null,
        2
      )
    );
    return;
  }

  loadScriptEnv();
  loadEnvFile(path.join(__dirname, "..", "apps", "web", ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  assertLocalPipelineSupabaseUrl(supabaseUrl, "import-opening-position-index.cjs");

  const headers = {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: "resolution=merge-duplicates",
  };

  const chunkSize = 500;
  for (let index = 0; index < payload.rows.length; index += chunkSize) {
    await upsertRows(
      payload.rows.slice(index, index + chunkSize),
      headers,
      supabaseUrl
    );
  }

  console.log(
    JSON.stringify(
      {
        imported: true,
        positions: payload.rows.length,
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
