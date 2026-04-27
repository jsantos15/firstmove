#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-candidates-merged.json"
);

const DEFAULT_INPUTS = [
  path.resolve(__dirname, "output", "generated-opening-candidates-A.json"),
  path.resolve(__dirname, "output", "generated-opening-candidates-B.json"),
  path.resolve(__dirname, "output", "generated-opening-candidates-C.json"),
  path.resolve(__dirname, "output", "generated-opening-candidates-D.json"),
  path.resolve(__dirname, "output", "generated-opening-candidates-E.json"),
];

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    inputs: [...DEFAULT_INPUTS],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--output") {
      args.output = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--input") {
      args.inputs.push(path.resolve(argv[index + 1]));
      index += 1;
      continue;
    }
  }

  return args;
}

function readChunk(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing chunk file: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function confidenceRank(value) {
  return { authoritative: 3, provisional: 2, none: 1 }[value] ?? 0;
}

function difficultyRank(value) {
  return { beginner: 1, intermediate: 2, advanced: 3 }[value] ?? 0;
}

function compareLines(left, right) {
  if (left.isMainLine !== right.isMainLine) {
    return left.isMainLine ? -1 : 1;
  }

  const confidenceDiff =
    confidenceRank(right.mainLineConfidence) -
    confidenceRank(left.mainLineConfidence);
  if (confidenceDiff !== 0) {
    return confidenceDiff;
  }

  const leftPopularity = left.popularityScore ?? Number.NEGATIVE_INFINITY;
  const rightPopularity = right.popularityScore ?? Number.NEGATIVE_INFINITY;
  if (leftPopularity !== rightPopularity) {
    return rightPopularity - leftPopularity;
  }

  const difficultyDiff =
    difficultyRank(left.lineDifficulty) - difficultyRank(right.lineDifficulty);
  if (difficultyDiff !== 0) {
    return difficultyDiff;
  }

  return left.lineName.localeCompare(right.lineName);
}

function deriveOpeningDifficulty(lines) {
  const sorted = [...lines].sort(compareLines);
  const representative = sorted[0];

  return {
    openingDifficulty: representative?.lineDifficulty ?? "beginner",
    openingDifficultyConfidence:
      representative?.lineDifficultyConfidence ?? "low",
    openingDifficultySource: representative
      ? `Derived from representative line "${representative.lineName}".`
      : "No representative line available.",
  };
}

function mergePayloads(payloads) {
  const mergedResults = [];
  const seenFullNames = new Set();
  const duplicates = [];

  for (const payload of payloads) {
    for (const result of payload.results ?? []) {
      if (seenFullNames.has(result.fullName)) {
        duplicates.push(result.fullName);
        continue;
      }

      seenFullNames.add(result.fullName);
      mergedResults.push(result);
    }
  }

  const grouped = new Map();

  for (const result of mergedResults) {
    if (!grouped.has(result.openingId)) {
      grouped.set(result.openingId, {
        openingId: result.openingId,
        openingName: result.openingName,
        ecoCodes: new Set(),
        sourceNames: new Set(),
        lines: [],
      });
    }

    const opening = grouped.get(result.openingId);
    opening.ecoCodes.add(result.ecoCode);
    opening.sourceNames.add(result.sourceName);
    opening.lines.push(result);
  }

  const openings = Array.from(grouped.values())
    .map((opening) => {
      const lines = [...opening.lines].sort(compareLines).map((line, index) => ({
        ...line,
        popularityRankWithinOpening: line.popularityRankWithinOpening ?? index + 1,
      }));
      const difficulty = deriveOpeningDifficulty(lines);

      return {
        openingId: opening.openingId,
        openingName: opening.openingName,
        ecoCodes: Array.from(opening.ecoCodes).sort(),
        sourceNames: Array.from(opening.sourceNames).sort(),
        openingDifficulty: difficulty.openingDifficulty,
        openingDifficultyConfidence: difficulty.openingDifficultyConfidence,
        openingDifficultySource: difficulty.openingDifficultySource,
        popularitySource: null,
        popularityScore: null,
        popularityGames: null,
        popularityRank: null,
        lineCount: lines.length,
        lines,
      };
    })
    .sort((left, right) => left.openingName.localeCompare(right.openingName));

  return {
    mergedResults,
    openings,
    duplicates,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payloads = args.inputs.map(readChunk);
  const { mergedResults, openings, duplicates } = mergePayloads(payloads);

  const payload = {
    generatedAt: new Date().toISOString(),
    status: "complete",
    source: {
      naming: "lichess-org/chess-openings",
      continuation: "ChessDB",
      chunks: args.inputs.map((filePath) => path.basename(filePath)),
    },
    count: mergedResults.length,
    openingCount: openings.length,
    duplicateCount: duplicates.length,
    duplicates,
    openings,
    results: mergedResults,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Wrote merged opening candidates to ${args.output}`);
  console.log(
    JSON.stringify(
      {
        count: mergedResults.length,
        openingCount: openings.length,
        duplicateCount: duplicates.length,
      },
      null,
      2
    )
  );
}

main();
