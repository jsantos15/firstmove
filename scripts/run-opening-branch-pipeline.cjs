#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const STAGES = ["generate", "dedup", "prepare", "import"];

const OPENINGS = {
  "italian-game": {
    label: "Italian Game",
    referenceInput: path.resolve(
      __dirname,
      "output",
      "generated-opening-candidates-italian-game-cloud-reference.json"
    ),
    branchOutput: path.resolve(
      __dirname,
      "output",
      "generated-opening-branches-italian-game.json"
    ),
    payloadOutput: path.resolve(
      __dirname,
      "output",
      "opening-db-payload-italian-game-branches.json"
    ),
  },
  "caro-kann": {
    label: "Caro-Kann Defense",
    referenceInput: path.resolve(
      __dirname,
      "output",
      "generated-opening-candidates-caro-kann-cloud-reference.json"
    ),
    branchOutput: path.resolve(
      __dirname,
      "output",
      "generated-opening-branches-caro-kann.json"
    ),
    payloadOutput: path.resolve(
      __dirname,
      "output",
      "opening-db-payload-caro-kann-branches.json"
    ),
  },
};

function parseArgs(argv) {
  const args = {
    openings: null,
    startAt: "generate",
    dryRunImport: false,
    passthroughGenerateArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") args.help = true;
    else if (token === "--openings") {
      args.openings = String(argv[index + 1]).split(",").map((value) => value.trim()).filter(Boolean);
      index += 1;
    } else if (token === "--all") {
      args.openings = Object.keys(OPENINGS);
    } else if (token === "--start-at") {
      args.startAt = String(argv[index + 1]);
      index += 1;
    } else if (token === "--dry-run-import") {
      args.dryRunImport = true;
    } else if (token === "--generate-arg") {
      args.passthroughGenerateArgs.push(String(argv[index + 1]));
      index += 1;
    }
  }

  if (args.help) return args;
  if (!args.openings?.length) {
    throw new Error(`Choose openings with --openings <${Object.keys(OPENINGS).join("|")}> or pass --all.`);
  }
  const unknown = args.openings.filter((slug) => !OPENINGS[slug]);
  if (unknown.length > 0) {
    throw new Error(`Unknown opening(s): ${unknown.join(", ")}.`);
  }
  if (!STAGES.includes(args.startAt)) {
    throw new Error(`Unsupported --start-at "${args.startAt}".`);
  }
  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/run-opening-branch-pipeline.cjs --openings italian-game,caro-kann
  node scripts/run-opening-branch-pipeline.cjs --all --dry-run-import

Options:
  --openings <list>       Comma-separated known openings: ${Object.keys(OPENINGS).join(", ")}
  --all                  Run all known openings
  --start-at <stage>     Start from: ${STAGES.join(", ")} (default: generate)
  --dry-run-import       Run import stage as a dry-run
  --generate-arg <value> Pass one raw argument to generate-opening-branches.cjs

Examples:
  node scripts/run-opening-branch-pipeline.cjs --openings italian-game --dry-run-import --generate-arg --only-under-branch-count --generate-arg 5
  node scripts/run-opening-branch-pipeline.cjs --openings italian-game --dry-run-import --generate-arg --target-branches-per-variation --generate-arg 5 --generate-arg --max-new-branches-per-variation --generate-arg 2
`);
}

function shouldRunStage(args, stage) {
  return STAGES.indexOf(stage) >= STAGES.indexOf(args.startAt);
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

function readJson(filePath, description) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing ${description}: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertBranchOutput(opening) {
  const payload = readJson(opening.branchOutput, "branch output");
  if (payload.status !== "complete") {
    throw new Error(`${opening.label} branch output is not complete.`);
  }
  return {
    references: payload.referenceCount ?? 0,
    branches: payload.branchCount ?? 0,
  };
}

function assertPayload(opening) {
  const payload = readJson(opening.payloadOutput, "prepared branch payload");
  return {
    openings: payload.counts?.openings ?? 0,
    lines: payload.counts?.lines ?? 0,
    branchMetadata: payload.counts?.branchMetadata ?? 0,
  };
}

function runOpening(opening, args) {
  console.log(`\n=== ${opening.label} branches ===`);
  if (shouldRunStage(args, "generate")) {
    runStep(`${opening.label} branch generate`, "generate-opening-branches.cjs", [
      "--input",
      opening.referenceInput,
      "--output",
      opening.branchOutput,
      ...args.passthroughGenerateArgs,
    ]);
  }

  if (shouldRunStage(args, "dedup")) {
    runStep(`${opening.label} branch dedup`, "dedup-opening-branches.cjs", [
      "--input",
      opening.branchOutput,
    ]);
  }
  const branchSummary = assertBranchOutput(opening);

  if (shouldRunStage(args, "prepare")) {
    runStep(`${opening.label} branch prepare`, "prepare-opening-db-payload.cjs", [
      "--input",
      opening.branchOutput,
      "--output",
      opening.payloadOutput,
    ]);
  }
  const payloadSummary = assertPayload(opening);

  if (shouldRunStage(args, "import")) {
    runStep(`${opening.label} branch import`, "import-opening-db-payload.cjs", [
      "--input",
      opening.payloadOutput,
      ...(args.dryRunImport ? ["--dry-run"] : []),
    ]);
  }

  return {
    label: opening.label,
    ...branchSummary,
    ...payloadSummary,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  console.log("Opening branch pipeline");
  console.log(`Openings: ${args.openings.join(", ")}`);
  console.log(`Start at stage: ${args.startAt}`);
  console.log(`Import mode: ${args.dryRunImport ? "dry-run" : "apply"}`);

  const summaries = args.openings.map((slug) => runOpening(OPENINGS[slug], args));
  console.log("\nSUCCESS: opening branch pipeline completed.");
  for (const summary of summaries) {
    console.log(
      `- ${summary.label}: ${summary.branches} branch row(s), ` +
        `${summary.branchMetadata} branch metadata row(s), ${summary.lines} total payload line(s)`
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
