#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_INPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-branches.json"
);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: null,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") {
      args.input = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--output") {
      args.output = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    }
  }

  args.output = args.output ?? args.input;
  return args;
}

function lineScore(line) {
  return Number(line.branchScore ?? line.generation?.branch?.branchScore ?? -999999);
}

function branchKey(line) {
  return (
    line.generation?.branch?.branchKey ??
    (line.parentLineId && line.lessonStemPly != null && line.triggerMoveUci
      ? `${line.openingId}::${line.parentLineId}::${line.lessonStemPly}::${line.triggerMoveUci}`
      : null)
  );
}

function dedupeLines(lines) {
  const references = lines.filter((line) => line.lineType !== "practical_branch");
  const branches = lines.filter((line) => line.lineType === "practical_branch");
  const grouped = new Map();

  for (const branch of branches) {
    const key = branchKey(branch) ?? branch.generatedSans?.join(" ");
    const current = grouped.get(key);
    if (!current || lineScore(branch) > lineScore(current)) {
      grouped.set(key, branch);
    }
  }

  const bySans = new Map();
  for (const branch of grouped.values()) {
    const key = branch.generatedSans?.join(" ");
    const current = bySans.get(key);
    if (!current || lineScore(branch) > lineScore(current)) {
      bySans.set(key, branch);
    }
  }

  return {
    references,
    branches: Array.from(bySans.values()),
    removed: branches.length - bySans.size,
  };
}

function groupOpenings(payload, results) {
  const grouped = new Map();
  for (const line of results) {
    if (!grouped.has(line.openingId)) {
      const source = (payload.openings ?? []).find((opening) => opening.openingId === line.openingId);
      grouped.set(line.openingId, {
        ...(source ?? {
          openingId: line.openingId,
          openingName: line.openingName,
          ecoCodes: [],
          sourceNames: [],
          openingDifficulty: "beginner",
          openingDifficultyConfidence: "medium",
          openingDifficultySource: "Inherited from generated lines.",
          popularitySource: null,
          popularityScore: null,
          popularityGames: null,
          popularityRank: null,
        }),
        lines: [],
      });
    }

    grouped.get(line.openingId).lines.push(line);
  }

  return Array.from(grouped.values()).map((opening) => ({
    ...opening,
    lineCount: opening.lines.length,
    lines: opening.lines,
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const results = Array.isArray(payload.results) ? payload.results : [];
  const { references, branches, removed } = dedupeLines(results);
  const dedupedResults = [...references, ...branches];
  const output = {
    ...payload,
    generatedAt: new Date().toISOString(),
    count: dedupedResults.length,
    referenceCount: references.length,
    branchCount: branches.length,
    openingCount: new Set(dedupedResults.map((line) => line.openingId)).size,
    openings: groupOpenings(payload, dedupedResults),
    results: dedupedResults,
  };

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          input: args.input,
          references: references.length,
          branchesBefore: results.length - references.length,
          branchesAfter: branches.length,
          removed,
        },
        null,
        2
      )
    );
    return;
  }

  fs.writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Deduped opening branches: removed ${removed}, wrote ${args.output}`);
}

main();
