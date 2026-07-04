#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { loadEnvFile, loadScriptEnv } = require("./lib/local-env.cjs");

const OUTPUT_DIR = path.resolve(__dirname, "output");
const DEFAULT_CLOUD_EVAL_MODE = "authoritative";
const REST_RETRY_ATTEMPTS = 5;
const REST_RETRY_BASE_DELAY_MS = 750;
const NON_STANDALONE_COURSE_NAMES = new Set([
  "queen's gambit accepted",
  "queen's gambit declined",
]);

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseArgs(argv) {
  const args = {
    openings: null,
    nextMissing: null,
    resume: false,
    dryRunImport: false,
    skipReferenceSync: false,
    skipBranchReset: false,
    syncPopularityOnly: false,
    cloudEvalMode: DEFAULT_CLOUD_EVAL_MODE,
    generateArgs: [],
    branchArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--openings") {
      args.openings = String(argv[++index])
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (token === "--next-missing") {
      args.nextMissing = Number(argv[++index]);
    } else if (token === "--resume") {
      args.resume = true;
    } else if (token === "--dry-run-import") {
      args.dryRunImport = true;
    } else if (token === "--skip-reference-sync") {
      args.skipReferenceSync = true;
    } else if (token === "--skip-branch-reset") {
      args.skipBranchReset = true;
    } else if (token === "--sync-popularity-only") {
      args.syncPopularityOnly = true;
    } else if (token === "--cloud-eval-mode") {
      args.cloudEvalMode = String(argv[++index]);
    } else if (token === "--generate-arg") {
      args.generateArgs.push(String(argv[++index]));
    } else if (token === "--branch-arg") {
      args.branchArgs.push(String(argv[++index]));
    }
  }

  if (args.help) return args;
  if (args.syncPopularityOnly) return args;
  if (args.openings?.length && args.nextMissing != null) {
    throw new Error("Pass either --openings or --next-missing, not both.");
  }
  if (!args.openings?.length && args.nextMissing == null) {
    throw new Error("Pass --openings <name-or-slug,...> or --next-missing <count>.");
  }
  if (args.nextMissing != null && (!Number.isInteger(args.nextMissing) || args.nextMissing < 1)) {
    throw new Error("--next-missing must be a positive integer.");
  }

  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/run-opening-course-pipeline.cjs --next-missing 2
  node scripts/run-opening-course-pipeline.cjs --openings "Scandinavian Defense,English Opening"
  node scripts/run-opening-course-pipeline.cjs --openings ruy-lopez --resume

Options:
  --openings <list>          Comma-separated opening names or slugified names from opening_index
  --next-missing <count>     Run the next N opening_index rows where course_slug is null
  --resume                   Resume reference generation and branch generation checkpoints
  --dry-run-import           Prepare payloads but dry-run the branch import
  --skip-reference-sync      Do not prune stale reference rows after reference import
  --skip-branch-reset        Do not delete existing practical branches before branch import
  --sync-popularity-only     Repair openings_catalog popularity fields from opening_index, then exit
  --cloud-eval-mode <mode>   Passed to reference generation (default: ${DEFAULT_CLOUD_EVAL_MODE})
  --generate-arg <value>     Pass one raw extra argument to generate-opening-candidates.cjs
  --branch-arg <value>       Pass one raw extra argument to generate-opening-branches.cjs
`);
}

function getEnv() {
  loadScriptEnv();
  loadEnvFile(path.join(__dirname, "..", "apps", "web", ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return {
    supabaseUrl,
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function describeFetchError(error) {
  const parts = [];
  if (error?.message) parts.push(error.message);
  if (error?.cause?.code) parts.push(`code=${error.cause.code}`);
  if (error?.cause?.message && error.cause.message !== error.message) {
    parts.push(`cause=${error.cause.message}`);
  }
  if (error?.cause?.hostname) parts.push(`host=${error.cause.hostname}`);
  return parts.length ? parts.join("; ") : String(error);
}

async function fetchWithRetry(url, options, label) {
  let lastError = null;
  const urlForLog = `${url.origin}${url.pathname}`;

  for (let attempt = 1; attempt <= REST_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || !isRetryableStatus(response.status) || attempt === REST_RETRY_ATTEMPTS) {
        return response;
      }

      lastError = new Error(`${label} failed with retryable status ${response.status}: ${await response.text()}`);
    } catch (error) {
      lastError = error;
      if (attempt === REST_RETRY_ATTEMPTS) {
        throw new Error(
          `${label} failed after ${REST_RETRY_ATTEMPTS} attempts (${urlForLog}): ${describeFetchError(error)}`,
          { cause: error }
        );
      }
    }

    const delay = REST_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    const reason =
      lastError instanceof Error ? `: ${describeFetchError(lastError)}` : "";
    console.warn(
      `${label} failed${reason}; retrying in ${delay}ms (${attempt}/${REST_RETRY_ATTEMPTS})`
    );
    await sleep(delay);
  }

  throw lastError ?? new Error(`${label} failed.`);
}

async function fetchAll(table, params, env) {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const url = new URL(`${env.supabaseUrl}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const response = await fetchWithRetry(url, { headers: env.headers }, `Fetch ${table}`);
    if (!response.ok) {
      throw new Error(`Fetch ${table} failed (${response.status}): ${await response.text()}`);
    }

    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

async function getOpeningIndex(env) {
  return fetchAll(
    "opening_index",
    {
      select: "name,eco_code,anchor_sans,popularity_games,variation_count,course_slug",
      order: "popularity_games.desc.nullslast,name.asc",
    },
    env
  );
}

function resolveSelectedOpenings(indexRows, args) {
  const courseRows = indexRows.filter(
    (row) => !NON_STANDALONE_COURSE_NAMES.has(String(row.name ?? "").toLowerCase())
  );

  if (args.nextMissing != null) {
    return courseRows.filter((row) => !row.course_slug).slice(0, args.nextMissing);
  }

  const rowsByKey = new Map();
  for (const row of courseRows) {
    rowsByKey.set(row.name.toLowerCase(), row);
    rowsByKey.set(slugify(row.name), row);
  }

  return args.openings.map((input) => {
    const row = rowsByKey.get(input.toLowerCase()) ?? rowsByKey.get(slugify(input));
    if (!row) {
      throw new Error(`Opening not found in opening_index: ${input}`);
    }
    return row;
  });
}

function fileSet(row) {
  const slug = slugify(row.name);
  return {
    slug,
    referenceOutput: path.join(OUTPUT_DIR, `generated-opening-candidates-${slug}-cloud-reference.json`),
    referencePayload: path.join(OUTPUT_DIR, `opening-db-payload-${slug}-cloud-reference.json`),
    branchOutput: path.join(OUTPUT_DIR, `generated-opening-branches-${slug}.json`),
    branchCheckpoint: path.join(OUTPUT_DIR, `generated-opening-branches-${slug}.json.checkpoint.json`),
    branchPayload: path.join(OUTPUT_DIR, `opening-db-payload-${slug}-branches.json`),
  };
}

function runStep(label, scriptName, args) {
  const scriptPath = path.resolve(__dirname, scriptName);
  const command = [scriptPath, ...args];
  console.log(`\n[${label}] node ${command.map((part) => JSON.stringify(part)).join(" ")}`);

  const result = spawnSync(process.execPath, command, {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing ${label}: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertReferencePayload(filePath, label) {
  const payload = readJson(filePath, `${label} reference output`);
  if (payload.status !== "complete") {
    throw new Error(`${label} reference output is not complete (status: ${payload.status ?? "missing"}).`);
  }
  if (!Array.isArray(payload.results) || payload.results.length === 0) {
    throw new Error(`${label} reference output has no result lines.`);
  }
  return payload;
}

function assertDbPayload(filePath, label) {
  const payload = readJson(filePath, `${label} DB payload`);
  const openings = payload.currentSchema?.openingsCatalogRows ?? [];
  const lines = payload.currentSchema?.openingLinesRows ?? [];
  if (!openings.length || !lines.length) {
    throw new Error(`${label} DB payload is empty.`);
  }
  return { payload, openings, lines };
}

function branchOpeningSlugs(branchPayloadPath) {
  const { openings } = assertDbPayload(branchPayloadPath, "branch");
  return openings.map((row) => row.slug).filter(Boolean);
}

function canResumeBranchGeneration(files, label) {
  if (!fs.existsSync(files.branchCheckpoint)) return false;

  try {
    assertReferencePayload(files.referenceOutput, label);
    assertDbPayload(files.referencePayload, `${label} reference`);
    return true;
  } catch (error) {
    console.warn(
      `${label} branch checkpoint exists, but reference artifacts are not reusable: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

async function patchCatalogPopularityFromIndex(env) {
  const rows = await fetchAll(
    "opening_index",
    {
      select: "name,course_slug,popularity_games",
      course_slug: "not.is.null",
      order: "popularity_games.desc.nullslast,name.asc",
    },
    env
  );

  const seen = new Set();
  let rank = 1;
  for (const row of rows) {
    if (!row.course_slug || seen.has(row.course_slug)) continue;
    seen.add(row.course_slug);

    const url = new URL(`${env.supabaseUrl}/rest/v1/openings_catalog`);
    url.searchParams.set("slug", `eq.${row.course_slug}`);
    const response = await fetchWithRetry(
      url,
      {
        method: "PATCH",
        headers: {
          ...env.headers,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          popularity_games: row.popularity_games,
          popularity_rank: rank,
        }),
      },
      `Patch popularity for ${row.course_slug}`
    );

    if (!response.ok) {
      throw new Error(`Patch popularity for ${row.course_slug} failed (${response.status}): ${await response.text()}`);
    }
    rank += 1;
  }
}

async function patchCatalogPopularityFromIndexBestEffort(env) {
  try {
    await patchCatalogPopularityFromIndex(env);
  } catch (error) {
    console.warn(
      `WARNING: catalog popularity sync skipped after import: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    console.warn("Run `node scripts/run-opening-course-pipeline.cjs --sync-popularity-only` to retry it.");
  }
}

function formatSanPrefix(anchorSans) {
  if (!Array.isArray(anchorSans) || anchorSans.length === 0) {
    return null;
  }
  return anchorSans.join(",");
}

async function runCourse(row, args, env) {
  const files = fileSet(row);
  const label = row.name;
  const sanPrefix = formatSanPrefix(row.anchor_sans);

  if (!sanPrefix) {
    throw new Error(`${label} has no anchor_sans in opening_index.`);
  }

  console.log(`\n=== ${label} ===`);
  console.log(`Popularity games: ${row.popularity_games ?? "unknown"}`);
  console.log(`Variation count: ${row.variation_count ?? "unknown"}`);
  console.log(`SAN prefix: ${sanPrefix}`);

  if (args.resume && canResumeBranchGeneration(files, label)) {
    console.log(`${label}: branch checkpoint found; skipping completed reference phase.`);
  } else {
    runStep(`${label} reference generate`, "generate-opening-candidates.cjs", [
      "--starts-with",
      label,
      "--san-prefix",
      sanPrefix,
      "--output",
      files.referenceOutput,
      "--cloud-eval-mode",
      args.cloudEvalMode,
      ...(args.resume ? ["--resume"] : []),
      ...args.generateArgs,
    ]);
    assertReferencePayload(files.referenceOutput, label);

    runStep(`${label} reference dedup`, "dedup-opening-candidates.cjs", [
      "--input",
      files.referenceOutput,
    ]);

    runStep(`${label} reference prepare`, "prepare-opening-db-payload.cjs", [
      "--input",
      files.referenceOutput,
      "--output",
      files.referencePayload,
    ]);
    assertDbPayload(files.referencePayload, `${label} reference`);

    runStep(`${label} reference import`, "import-opening-db-payload.cjs", [
      "--input",
      files.referencePayload,
    ]);

    if (!args.skipReferenceSync) {
      runStep(`${label} reference sync`, "sync-opening-db-payload.cjs", [
        "--input",
        files.referencePayload,
        "--scope-payload-openings",
        "--apply",
      ]);
    }
  }
  const referencePayload = assertDbPayload(files.referencePayload, `${label} reference`);

  runStep(`${label} branch generate`, "generate-opening-branches.cjs", [
    "--input",
    files.referenceOutput,
    "--output",
    files.branchOutput,
    "--checkpoint",
    files.branchCheckpoint,
    ...(args.resume ? [] : ["--no-resume"]),
    ...args.branchArgs,
  ]);
  const branchOutput = readJson(files.branchOutput, `${label} branch output`);
  if (branchOutput.status !== "complete") {
    throw new Error(`${label} branch output is not complete (status: ${branchOutput.status ?? "missing"}).`);
  }

  runStep(`${label} branch dedup`, "dedup-opening-branches.cjs", [
    "--input",
    files.branchOutput,
  ]);

  runStep(`${label} branch prepare`, "prepare-opening-db-payload.cjs", [
    "--input",
    files.branchOutput,
    "--output",
    files.branchPayload,
  ]);
  const branchPayload = assertDbPayload(files.branchPayload, `${label} branch`);

  if (!args.skipBranchReset && !args.dryRunImport) {
    for (const openingSlug of branchOpeningSlugs(files.branchPayload)) {
      runStep(`${label} branch reset ${openingSlug}`, "delete-opening-branches.cjs", [
        "--opening",
        openingSlug,
        "--all-opening-branches",
        "--apply",
      ]);
    }
  }

  runStep(`${label} branch import`, "import-opening-db-payload.cjs", [
    "--input",
    files.branchPayload,
    ...(args.dryRunImport ? ["--dry-run"] : []),
  ]);

  if (!args.dryRunImport) {
    await patchCatalogPopularityFromIndexBestEffort(env);
  }

  return {
    name: label,
    referenceOpenings: referencePayload.openings.length,
    referenceLines: referencePayload.lines.length,
    branchOpenings: branchPayload.openings.length,
    branchLines: branchPayload.lines.length,
    branchMetadata: branchPayload.payload.counts?.branchMetadata ?? null,
    referenceOutput: files.referenceOutput,
    branchOutput: files.branchOutput,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const env = getEnv();
  if (args.syncPopularityOnly) {
    await patchCatalogPopularityFromIndex(env);
    console.log("SUCCESS: catalog popularity fields synced from opening_index.");
    return;
  }

  const indexRows = await getOpeningIndex(env);
  const selected = resolveSelectedOpenings(indexRows, args);

  if (selected.length === 0) {
    console.log("No matching openings to run.");
    return;
  }

  console.log("Opening course pipeline");
  console.log(`Selected openings: ${selected.map((row) => row.name).join(", ")}`);
  console.log(`Cloud eval mode: ${args.cloudEvalMode}`);
  console.log(`Dry-run import: ${args.dryRunImport ? "yes" : "no"}`);

  const summaries = [];
  for (const row of selected) {
    summaries.push(await runCourse(row, args, env));
  }

  console.log("\nSUCCESS: opening course pipeline completed.");
  console.log(JSON.stringify(summaries, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
