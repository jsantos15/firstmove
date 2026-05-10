#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const STAGES = ["generate", "dedup", "prepare", "import", "sync"];

const OPENINGS = {
  "italian-game": {
    label: "Italian Game",
    startsWith: "Italian Game",
    sanPrefix: "e4,e5,Nf3,Nc6,Bc4",
    generatedOutput: path.resolve(
      __dirname,
      "output",
      "generated-opening-candidates-italian-game-cloud-reference.json"
    ),
    diffOutput: path.resolve(
      __dirname,
      "output",
      "opening-reference-diff-italian-game.json"
    ),
    payloadOutput: path.resolve(
      __dirname,
      "output",
      "opening-db-payload-italian-game-cloud-reference.json"
    ),
  },
  "caro-kann": {
    label: "Caro-Kann Defense",
    startsWith: "Caro-Kann",
    sanPrefix: "e4,c6",
    generatedOutput: path.resolve(
      __dirname,
      "output",
      "generated-opening-candidates-caro-kann-cloud-reference.json"
    ),
    diffOutput: path.resolve(
      __dirname,
      "output",
      "opening-reference-diff-caro-kann.json"
    ),
    payloadOutput: path.resolve(
      __dirname,
      "output",
      "opening-db-payload-caro-kann-cloud-reference.json"
    ),
  },
};

function parseArgs(argv) {
  const args = {
    openings: null,
    cloudEvalMode: "authoritative",
    resume: false,
    applySync: false,
    skipSync: false,
    startAt: "generate",
    passthroughGenerateArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

    if (token === "--openings") {
      args.openings = String(argv[index + 1])
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (token === "--all") {
      args.openings = Object.keys(OPENINGS);
      continue;
    }

    if (token === "--cloud-eval-mode") {
      args.cloudEvalMode = String(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--resume") {
      args.resume = true;
      continue;
    }

    if (token === "--apply-sync") {
      args.applySync = true;
      continue;
    }

    if (token === "--skip-sync") {
      args.skipSync = true;
      continue;
    }

    if (token === "--start-at") {
      args.startAt = String(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--generate-arg") {
      args.passthroughGenerateArgs.push(String(argv[index + 1]));
      index += 1;
      continue;
    }
  }

  if (args.help) {
    return args;
  }

  if (!args.openings || args.openings.length === 0) {
    throw new Error(
      `Choose openings with --openings <${Object.keys(OPENINGS).join("|")}> or pass --all.`
    );
  }

  const unknown = args.openings.filter((slug) => !OPENINGS[slug]);
  if (unknown.length > 0) {
    throw new Error(
      `Unknown opening(s): ${unknown.join(", ")}. Known openings: ${Object.keys(OPENINGS).join(", ")}`
    );
  }

  if (!STAGES.includes(args.startAt)) {
    throw new Error(
      `Unsupported --start-at "${args.startAt}". Expected one of: ${STAGES.join(", ")}.`
    );
  }

  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/run-opening-reference-pipeline.cjs --openings italian-game,caro-kann --apply-sync
  node scripts/run-opening-reference-pipeline.cjs --all --apply-sync

Options:
  --openings <list>        Comma-separated known openings: ${Object.keys(OPENINGS).join(", ")}
  --all                   Run all known openings
  --cloud-eval-mode <x>   Passed to generate-opening-candidates.cjs (default: authoritative)
  --resume                Resume interrupted generation
  --start-at <stage>      Start from: ${STAGES.join(", ")} (default: generate)
  --apply-sync            Actually prune stale DB rows during sync
  --skip-sync             Skip sync/prune stage
  --generate-arg <value>  Pass one extra raw argument to the generate step
`);
}

function readJson(filePath, description) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${description}: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalGeneratedSnapshot(opening) {
  if (!fs.existsSync(opening.generatedOutput)) {
    return null;
  }

  const payload = JSON.parse(fs.readFileSync(opening.generatedOutput, "utf8"));
  if (!Array.isArray(payload.results)) {
    return null;
  }

  return payload;
}

function lineKey(line) {
  return line.fullName ?? `${line.openingId ?? ""}::${line.variationId ?? ""}::${line.lineId ?? ""}`;
}

function linePgn(line) {
  return line.fullLinePgn ?? (Array.isArray(line.generatedSans) ? line.generatedSans.join(" ") : "");
}

function buildLineMap(payload) {
  const map = new Map();
  for (const line of payload?.results ?? []) {
    map.set(lineKey(line), line);
  }
  return map;
}

function compareGeneratedSnapshots({ opening, beforePayload, afterPayload }) {
  const before = buildLineMap(beforePayload);
  const after = buildLineMap(afterPayload);
  const changed = [];
  const added = [];
  const removed = [];
  const unchanged = [];

  for (const [key, afterLine] of after) {
    const beforeLine = before.get(key);
    if (!beforeLine) {
      added.push({
        fullName: key,
        currentPgn: linePgn(afterLine),
        currentStopReason: afterLine.stopReason ?? null,
      });
      continue;
    }

    const previousPgn = linePgn(beforeLine);
    const currentPgn = linePgn(afterLine);
    if (previousPgn === currentPgn) {
      unchanged.push(key);
      continue;
    }

    changed.push({
      fullName: key,
      previousPgn,
      currentPgn,
      previousPlies: beforeLine.generatedSans?.length ?? null,
      currentPlies: afterLine.generatedSans?.length ?? null,
      previousStopReason: beforeLine.stopReason ?? null,
      currentStopReason: afterLine.stopReason ?? null,
    });
  }

  for (const [key, beforeLine] of before) {
    if (after.has(key)) {
      continue;
    }

    removed.push({
      fullName: key,
      previousPgn: linePgn(beforeLine),
      previousStopReason: beforeLine.stopReason ?? null,
    });
  }

  const report = {
    opening: opening.label,
    generatedAt: new Date().toISOString(),
    previousGeneratedAt: beforePayload?.generatedAt ?? null,
    currentGeneratedAt: afterPayload?.generatedAt ?? null,
    counts: {
      previous: before.size,
      current: after.size,
      changed: changed.length,
      added: added.length,
      removed: removed.length,
      unchanged: unchanged.length,
    },
    changed,
    added,
    removed,
  };

  fs.mkdirSync(path.dirname(opening.diffOutput), { recursive: true });
  fs.writeFileSync(opening.diffOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function assertGeneratedComplete(opening) {
  const payload = readJson(opening.generatedOutput, "generated candidates file");
  if (payload.status !== "complete") {
    throw new Error(
      `${opening.label} generated candidates are not complete (status: ${payload.status ?? "missing"}). ` +
        `Run generation again, usually with --resume, before continuing.`
    );
  }

  if (!Array.isArray(payload.results) || payload.results.length === 0) {
    throw new Error(`${opening.label} generated candidates file has no results.`);
  }

  return {
    generatedLines: payload.results.length,
    generatedOpeningCount: Array.isArray(payload.openings) ? payload.openings.length : null,
  };
}

function assertPayloadReady(opening) {
  const payload = readJson(opening.payloadOutput, "prepared DB payload file");
  const catalogRows = payload.currentSchema?.openingsCatalogRows;
  const lineRows = payload.currentSchema?.openingLinesRows;

  if (!Array.isArray(catalogRows) || catalogRows.length === 0) {
    throw new Error(`${opening.label} prepared payload has no openings catalog rows.`);
  }

  if (!Array.isArray(lineRows) || lineRows.length === 0) {
    throw new Error(`${opening.label} prepared payload has no opening line rows.`);
  }

  return {
    payloadOpenings: catalogRows.length,
    payloadLines: lineRows.length,
  };
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

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
}

function runOpeningPipeline(opening, args) {
  console.log(`\n=== ${opening.label} ===`);
  let generatedSummary = null;
  let payloadSummary = null;
  const previousGenerated = shouldRunStage(args, "generate")
    ? readOptionalGeneratedSnapshot(opening)
    : null;

  if (shouldRunStage(args, "generate")) {
    runStep(`${opening.label} generate`, "generate-opening-candidates.cjs", [
      "--starts-with",
      opening.startsWith,
      "--san-prefix",
      opening.sanPrefix,
      "--output",
      opening.generatedOutput,
      "--cloud-eval-mode",
      args.cloudEvalMode,
      ...(args.resume ? ["--resume"] : []),
      ...args.passthroughGenerateArgs,
    ]);
  } else {
    console.log(`[${opening.label} generate] skipped by --start-at ${args.startAt}`);
  }

  generatedSummary = assertGeneratedComplete(opening);

  if (shouldRunStage(args, "dedup")) {
    runStep(`${opening.label} dedup`, "dedup-opening-candidates.cjs", [
      "--input",
      opening.generatedOutput,
    ]);
    generatedSummary = assertGeneratedComplete(opening);
  } else {
    console.log(`[${opening.label} dedup] skipped by --start-at ${args.startAt}`);
  }

  let diffReport = null;
  if (previousGenerated) {
    const currentGenerated = readJson(opening.generatedOutput, "generated candidates file");
    diffReport = compareGeneratedSnapshots({
      opening,
      beforePayload: previousGenerated,
      afterPayload: currentGenerated,
    });
    console.log(
      `[${opening.label} diff] changed=${diffReport.counts.changed}, ` +
        `added=${diffReport.counts.added}, removed=${diffReport.counts.removed}, ` +
        `unchanged=${diffReport.counts.unchanged}`
    );
    console.log(`[${opening.label} diff] wrote ${opening.diffOutput}`);

    for (const line of diffReport.changed.slice(0, 8)) {
      console.log(`  changed: ${line.fullName}`);
    }
    if (diffReport.changed.length > 8) {
      console.log(`  ... ${diffReport.changed.length - 8} more changed line(s) in diff report`);
    }
  } else if (shouldRunStage(args, "generate")) {
    console.log(`[${opening.label} diff] no previous generated file found; diff skipped.`);
  }

  if (shouldRunStage(args, "prepare")) {
    runStep(`${opening.label} prepare`, "prepare-opening-db-payload.cjs", [
      "--input",
      opening.generatedOutput,
      "--output",
      opening.payloadOutput,
    ]);
  } else {
    console.log(`[${opening.label} prepare] skipped by --start-at ${args.startAt}`);
  }

  payloadSummary = assertPayloadReady(opening);

  if (shouldRunStage(args, "import")) {
    runStep(`${opening.label} import`, "import-opening-db-payload.cjs", [
      "--input",
      opening.payloadOutput,
    ]);
  } else {
    console.log(`[${opening.label} import] skipped by --start-at ${args.startAt}`);
  }

  if (!args.skipSync) {
    if (shouldRunStage(args, "sync")) {
      runStep(`${opening.label} sync`, "sync-opening-db-payload.cjs", [
        "--input",
        opening.payloadOutput,
        "--scope-payload-openings",
        ...(args.applySync ? ["--apply"] : []),
      ]);
    } else {
      console.log(`[${opening.label} sync] skipped by --start-at ${args.startAt}`);
    }
  }

  console.log(
    `[${opening.label}] completed: ${payloadSummary.payloadLines} DB line rows prepared ` +
      `from ${generatedSummary.generatedLines} generated lines.`
  );

  return {
    label: opening.label,
    generatedLines: generatedSummary.generatedLines,
    payloadOpenings: payloadSummary.payloadOpenings,
    payloadLines: payloadSummary.payloadLines,
    diff: diffReport?.counts ?? null,
    diffOutput: diffReport ? opening.diffOutput : null,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  console.log("Opening reference pipeline");
  console.log(`Openings: ${args.openings.join(", ")}`);
  console.log(`Cloud eval mode: ${args.cloudEvalMode}`);
  console.log(`Generation resume: ${args.resume ? "yes" : "no"}`);
  console.log(`Start at stage: ${args.startAt}`);
  console.log(`Sync mode: ${args.skipSync ? "skipped" : args.applySync ? "apply" : "dry-run"}`);

  const summaries = [];
  for (const slug of args.openings) {
    summaries.push(runOpeningPipeline(OPENINGS[slug], args));
  }

  const totalPayloadLines = summaries.reduce((sum, summary) => sum + summary.payloadLines, 0);
  const totalGeneratedLines = summaries.reduce((sum, summary) => sum + summary.generatedLines, 0);

  console.log("\nSUCCESS: opening reference pipeline completed.");
  console.log(
    `Processed ${summaries.length} opening(s), ${totalGeneratedLines} generated line(s), ` +
      `${totalPayloadLines} DB line row(s).`
  );
  for (const summary of summaries) {
    console.log(
      `- ${summary.label}: ${summary.payloadLines} DB line row(s) from ` +
        `${summary.generatedLines} generated line(s)`
    );
    if (summary.diff) {
      console.log(
        `  diff: ${summary.diff.changed} changed, ${summary.diff.added} added, ` +
          `${summary.diff.removed} removed (${summary.diffOutput})`
      );
    }
  }
  console.log(`Sync mode: ${args.skipSync ? "skipped" : args.applySync ? "applied" : "dry-run"}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
