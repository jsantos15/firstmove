#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const TABLE = "lichess_opening_popularity";
const PAGE_SIZE = 1000;
const UPSERT_CHUNK_SIZE = 500;

function readEnvFile(filePath) {
  const values = {};
  if (!fs.existsSync(filePath)) return values;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function requireLocalTarget() {
  const localUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const localServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!localUrl || !localServiceRoleKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for local Supabase first."
    );
  }

  if (!localUrl.startsWith("http://127.0.0.1:54321")) {
    throw new Error(
      `Refusing to write to non-local Supabase URL: ${localUrl}. Expected http://127.0.0.1:54321.`
    );
  }

  return { localUrl, localServiceRoleKey };
}

function requireCloudSource() {
  const webEnv = readEnvFile(
    path.resolve(__dirname, "..", "apps", "web", ".env.cloud.local")
  );
  const cloudUrl = webEnv.NEXT_PUBLIC_SUPABASE_URL;
  const cloudAnonKey = webEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!cloudUrl || !cloudAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.cloud.local."
    );
  }

  if (cloudUrl.startsWith("http://127.0.0.1:54321")) {
    throw new Error("Cloud source in apps/web/.env.cloud.local points to local Supabase.");
  }

  return { cloudUrl, cloudAnonKey };
}

async function fetchCloudRows(cloudUrl, cloudAnonKey) {
  const rows = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${cloudUrl}/rest/v1/${TABLE}`);
    url.searchParams.set("select", "*");
    url.searchParams.set("order", "id.asc");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      headers: {
        apikey: cloudAnonKey,
        Authorization: `Bearer ${cloudAnonKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Cloud fetch failed (${response.status}): ${await response.text()}`);
    }

    const page = await response.json();
    rows.push(...page);
    console.log(`Fetched ${rows.length} cloud rows...`);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

function stripGeneratedColumns(row) {
  const { id, created_at, ...rest } = row;
  return rest;
}

async function upsertLocalRows(localUrl, localServiceRoleKey, rows) {
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE).map(stripGeneratedColumns);
    const url = new URL(`${localUrl}/rest/v1/${TABLE}`);
    url.searchParams.set("on_conflict", "eco_code,full_name");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: localServiceRoleKey,
        Authorization: `Bearer ${localServiceRoleKey}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(chunk),
    });

    if (!response.ok) {
      throw new Error(`Local upsert failed (${response.status}): ${await response.text()}`);
    }

    console.log(`Upserted ${Math.min(index + chunk.length, rows.length)}/${rows.length} local rows...`);
  }
}

async function main() {
  const { cloudUrl, cloudAnonKey } = requireCloudSource();
  const { localUrl, localServiceRoleKey } = requireLocalTarget();

  console.log(`Copying ${TABLE}`);
  console.log(`  from: ${cloudUrl}`);
  console.log(`  to:   ${localUrl}`);

  const rows = await fetchCloudRows(cloudUrl, cloudAnonKey);
  await upsertLocalRows(localUrl, localServiceRoleKey, rows);

  console.log(JSON.stringify({ copied: true, table: TABLE, rows: rows.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
