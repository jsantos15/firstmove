#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { loadOpeningDefinitions } = require("./lib/opening-dataset.cjs");

const DEFAULT_OUTPUT_ROOT = path.resolve(
  __dirname,
  "output",
  "backups",
  "opening-library"
);

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function flattenOpenings(openings) {
  return openings.flatMap((opening) => {
    const lines = [opening.mainLine, ...(opening.variations ?? [])];

    return lines.map((line, index) => ({
      openingId: opening.id,
      openingName: opening.name,
      ecoCode: opening.ecoCode,
      color: opening.color,
      difficulty: opening.difficulty,
      openingDescription: opening.description,
      lineId: line.id,
      lineName: line.name,
      lineDescription: line.description ?? null,
      isMainLine: index === 0,
      sans: line.sans,
      tags: opening.tags ?? [],
    }));
  });
}

function buildSummary(openings, lines) {
  const countsByColor = {};
  const countsByDifficulty = {};

  for (const opening of openings) {
    countsByColor[opening.color] = (countsByColor[opening.color] ?? 0) + 1;
    countsByDifficulty[opening.difficulty] =
      (countsByDifficulty[opening.difficulty] ?? 0) + 1;
  }

  return {
    openings: openings.length,
    lines: lines.length,
    mainLines: openings.length,
    variations: Math.max(lines.length - openings.length, 0),
    countsByColor,
    countsByDifficulty,
  };
}

function main() {
  const openings = loadOpeningDefinitions();
  const lines = flattenOpenings(openings);
  const generatedAt = new Date().toISOString();
  const backupDir = path.join(DEFAULT_OUTPUT_ROOT, timestampSlug(new Date()));

  fs.mkdirSync(backupDir, { recursive: true });

  const openingPayload = {
    generatedAt,
    source: "packages/core/src/openings/data.ts",
    summary: buildSummary(openings, lines),
    openings,
  };

  const linePayload = {
    generatedAt,
    source: "packages/core/src/openings/data.ts",
    summary: buildSummary(openings, lines),
    lines,
  };

  fs.writeFileSync(
    path.join(backupDir, "openings.json"),
    `${JSON.stringify(openingPayload, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(backupDir, "lines.json"),
    `${JSON.stringify(linePayload, null, 2)}\n`,
    "utf8"
  );

  console.log(`Wrote opening library backup to ${backupDir}`);
  console.log(JSON.stringify(openingPayload.summary, null, 2));
}

main();
