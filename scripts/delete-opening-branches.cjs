#!/usr/bin/env node

const path = require("path");
const { loadEnvFile, loadScriptEnv } = require("./lib/local-env.cjs");

function parseArgs(argv) {
  const args = {
    openingSlug: null,
    parentLineSlugs: null,
    allOpeningBranches: false,
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--opening") {
      args.openingSlug = String(argv[index + 1]);
      index += 1;
    } else if (token === "--parent-line-slugs") {
      args.parentLineSlugs = String(argv[index + 1])
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
    } else if (token === "--all-opening-branches") {
      args.allOpeningBranches = true;
    } else if (token === "--apply") {
      args.apply = true;
    }
  }

  if (!args.openingSlug) throw new Error("Pass --opening <opening-slug>.");
  if (args.allOpeningBranches && args.parentLineSlugs?.length) {
    throw new Error("Pass either --all-opening-branches or --parent-line-slugs, not both.");
  }
  if (!args.allOpeningBranches && !args.parentLineSlugs?.length) {
    throw new Error("Pass --parent-line-slugs <slug,slug> or --all-opening-branches.");
  }
  return args;
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

function escapeFilterValue(value) {
  return String(value).replace(/"/g, '\\"');
}

function buildParentFilter(parentLineSlugs) {
  return `(${parentLineSlugs.map((slug) => `parent_line_slug.eq."${escapeFilterValue(slug)}"`).join(",")})`;
}

async function fetchBranchMetadata(args, headers, supabaseUrl) {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const url = new URL(`${supabaseUrl}/rest/v1/opening_line_branch_metadata`);
    url.searchParams.set("select", "opening_slug,line_slug,parent_line_slug,lesson_title");
    url.searchParams.set("opening_slug", `eq.${args.openingSlug}`);
    if (!args.allOpeningBranches) {
      url.searchParams.set("or", buildParentFilter(args.parentLineSlugs));
    }
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Fetch branch metadata failed (${response.status}): ${body}`);
    }

    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

async function deleteBranchRows(branchRows, headers, supabaseUrl) {
  const chunkSize = 50;
  for (let index = 0; index < branchRows.length; index += chunkSize) {
    const chunk = branchRows.slice(index, index + chunkSize);
    const url = new URL(`${supabaseUrl}/rest/v1/opening_lines`);
    url.searchParams.set(
      "or",
      `(${chunk
        .map(
          (row) =>
            `and(opening_slug.eq."${escapeFilterValue(row.opening_slug)}",slug.eq."${escapeFilterValue(row.line_slug)}")`
        )
        .join(",")})`
    );

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        ...headers,
        Prefer: "return=minimal",
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Delete branch rows failed (${response.status}): ${body}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { headers, supabaseUrl } = getEnv();
  const rows = await fetchBranchMetadata(args, headers, supabaseUrl);

  if (!args.apply) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          openingSlug: args.openingSlug,
          allOpeningBranches: args.allOpeningBranches,
          parentLineSlugs: args.parentLineSlugs,
          branchRowsMatched: rows.length,
          sample: rows.slice(0, 20),
        },
        null,
        2
      )
    );
    return;
  }

  await deleteBranchRows(rows, headers, supabaseUrl);
  console.log(
    JSON.stringify(
      {
        deleted: true,
        openingSlug: args.openingSlug,
        allOpeningBranches: args.allOpeningBranches,
        parentLineSlugs: args.parentLineSlugs,
        branchRowsDeleted: rows.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
