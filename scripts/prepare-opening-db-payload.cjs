#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_INPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-candidates-normalized.json"
);

const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "opening-db-payload.json"
);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--input") {
      args.input = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--output") {
      args.output = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return args;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferOpeningColor(openingName) {
  const text = normalizeText(openingName);

  if (
    /\b(defense|defence|countergambit|counterattack|accepted|declined)\b/u.test(
      text
    )
  ) {
    return "black";
  }

  return "white";
}

function sourceFamilyFromFullName(fullName) {
  const parts = String(fullName ?? "").split(":");
  return parts[0]?.trim() ?? "";
}

function buildNameSuffix(line) {
  const sourceFamily = sourceFamilyFromFullName(line.fullName);
  if (sourceFamily && normalizeText(sourceFamily) !== normalizeText(line.openingName)) {
    return `${sourceFamily} move order`;
  }

  if (line.ecoCode) {
    return line.ecoCode;
  }

  return "alternate line";
}

function resolveOpeningLines(opening) {
  const lines = opening.lines.map((line) => ({
    ...line,
    resolvedLineId: line.lineId,
    resolvedLineName: line.lineName,
  }));

  const exactNameCounts = new Map();
  for (const line of lines) {
    const key = normalizeText(line.resolvedLineName);
    exactNameCounts.set(key, (exactNameCounts.get(key) ?? 0) + 1);
  }

  for (const line of lines) {
    const key = normalizeText(line.resolvedLineName);
    if ((exactNameCounts.get(key) ?? 0) > 1) {
      line.resolvedLineName = `${line.lineName} (${buildNameSuffix(line)})`;
    }
  }

  const slugCounts = new Map();
  for (const line of lines) {
    const baseSlug = slugify(
      normalizeText(line.resolvedLineName) === normalizeText(opening.openingName)
        ? opening.openingName
        : `${opening.openingName} ${line.resolvedLineName}`
    );

    const currentCount = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, currentCount + 1);

    line.resolvedLineId =
      currentCount === 0 ? baseSlug : `${baseSlug}-${currentCount + 1}`;
  }

  return lines;
}

function buildOpeningDescription(opening) {
  const lineCount = opening.lineCount;
  const mainLine = opening.lines.find((line) => line.isMainLine);

  if (mainLine) {
    return `${opening.openingName} regenerated from authoritative naming and continuation sources. Includes ${lineCount} line${lineCount === 1 ? "" : "s"} staged for study, anchored by the main line ${mainLine.lineName}.`;
  }

  return `${opening.openingName} regenerated from authoritative naming and continuation sources. Includes ${lineCount} line${lineCount === 1 ? "" : "s"} staged for study.`;
}

function buildOpeningTags(opening, color) {
  const tags = new Set([
    `color:${color}`,
    `difficulty:${opening.openingDifficulty}`,
    "display:pending-popularity",
    "source:regenerated",
    "source:naming:lichess-org-chess-openings",
    "source:continuation:chessdb",
  ]);

  if (opening.lines.some((line) => line.isMainLine)) {
    tags.add("main-line:present");
  }

  if (opening.lineCount >= 10) {
    tags.add("library:deep");
  }

  return Array.from(tags).sort();
}

function inferOpeningTier(opening) {
  if (opening.popularityRank != null && opening.popularityRank <= 50) {
    return "core";
  }

  if (opening.popularityRank != null) {
    return "extended";
  }

  return null;
}

function inferFeaturedFlag(opening) {
  if (opening.popularityRank != null) {
    return opening.popularityRank <= 50;
  }

  return null;
}

function buildCatalogRow(opening) {
  const color = inferOpeningColor(opening.openingName);

  return {
    slug: opening.openingId,
    eco_code: opening.ecoCodes[0] ?? "A00",
    name: opening.openingName,
    color,
    difficulty: opening.openingDifficulty,
    description: buildOpeningDescription(opening),
    tags: buildOpeningTags(opening, color),
  };
}

function buildLineDescription(line) {
  return line.stopReason ?? null;
}

function buildLineRow(line, sortOrder) {
  return {
    slug: line.resolvedLineId,
    opening_slug: line.openingId,
    name: line.resolvedLineName,
    description: buildLineDescription(line),
    sans: line.generatedSans,
    sort_order: sortOrder,
  };
}

function buildOpeningMetadata(opening) {
  return {
    slug: opening.openingId,
    displayTier: inferOpeningTier(opening),
    displayTierSource:
      opening.popularityRank == null ? "pending-popularity" : "popularity",
    isFeatured: inferFeaturedFlag(opening),
    featuredSource:
      opening.popularityRank == null ? "pending-popularity" : "popularity",
    popularityRank: opening.popularityRank ?? null,
    popularityScore: opening.popularityScore ?? null,
    popularityGames: opening.popularityGames ?? null,
    hasMainLine: opening.lines.some((line) => line.isMainLine),
    openingDifficulty: opening.openingDifficulty,
    openingDifficultyConfidence: opening.openingDifficultyConfidence,
    lineCount: opening.lineCount,
    notes:
      "Keep all regenerated openings in the database. Choose core/extended/other after a real popularity pass.",
  };
}

function buildLineMetadata(line) {
  return {
    slug: line.resolvedLineId,
    openingSlug: line.openingId,
    fullName: line.fullName,
    primaryCategory: line.primaryCategory,
    inclusionOutcome: line.inclusionOutcome,
    lineDifficulty: line.lineDifficulty,
    lineDifficultyConfidence: line.lineDifficultyConfidence,
    isMainLine: line.isMainLine,
    mainLineConfidence: line.mainLineConfidence,
    popularityRankWithinOpening: line.popularityRankWithinOpening,
    popularityScore: line.popularityScore,
    popularityGames: line.popularityGames,
    stopReason: line.stopReason,
    sourceName: line.sourceName,
    sourceConfidence: line.sourceConfidence,
  };
}

function buildSeedOpening(opening) {
  const color = inferOpeningColor(opening.openingName);
  const resolvedLines = resolveOpeningLines(opening);

  return {
    id: opening.openingId,
    ecoCode: opening.ecoCodes[0] ?? "A00",
    name: opening.openingName,
    color,
    difficulty: opening.openingDifficulty,
    description: buildOpeningDescription(opening),
    tags: buildOpeningTags(opening, color),
    lines: resolvedLines.map((line) => ({
      id: line.resolvedLineId,
      name: line.resolvedLineName,
      description: buildLineDescription(line),
      sans: line.generatedSans,
      sortOrder: line.popularityRankWithinOpening ?? null,
    })),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const normalized = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const openings = Array.isArray(normalized.openings) ? normalized.openings : [];
  const resolvedOpenings = openings.map((opening) => ({
    ...opening,
    lines: resolveOpeningLines(opening),
  }));

  const openingsCatalogRows = resolvedOpenings.map(buildCatalogRow);
  const openingLinesRows = resolvedOpenings.flatMap((opening) =>
    opening.lines.map((line, index) => buildLineRow(line, index))
  );

  const openingDisplayMetadata = resolvedOpenings.map(buildOpeningMetadata);
  const lineStudyMetadata = resolvedOpenings.flatMap((opening) =>
    opening.lines.map(buildLineMetadata)
  );

  const seedPayload = resolvedOpenings.map(buildSeedOpening);

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceArtifact: path.basename(args.input),
    compatibility: {
      openingsCatalogTable: "public.openings_catalog",
      openingLinesTable: "public.opening_lines",
      note:
        "Current schema rows are exported alongside richer metadata. Apply migration 005 before using the importer so the richer opening-library fields can be stored directly.",
    },
    counts: {
      openings: openingsCatalogRows.length,
      lines: openingLinesRows.length,
    },
    currentSchema: {
      openingsCatalogRows,
      openingLinesRows,
    },
    futureMetadata: {
      openingDisplayMetadata,
      lineStudyMetadata,
    },
    seedPayload,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Wrote opening DB payload to ${args.output}`);
  console.log(
    JSON.stringify(
      {
        openings: openingsCatalogRows.length,
        lines: openingLinesRows.length,
      },
      null,
      2
    )
  );
}

main();
