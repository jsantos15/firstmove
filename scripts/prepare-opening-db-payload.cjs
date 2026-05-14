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
  if (line.lineType === "practical_branch") {
    const trace = line.generation?.branch?.continuationTrace ?? line.generation?.extension ?? [];
    const lastTrained = [...trace].reverse().find((step) => step?.side === "trained" && step?.san)?.san;
    const lastOpponent = [...trace].reverse().find((step) => step?.side === "opponent" && step?.san)?.san;
    if (lastTrained && lastOpponent) return `${lastOpponent} ${lastTrained}`;
    if (lastTrained) return `ends ${lastTrained}`;
  }

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
  if (opening.openingId === "italian-game") {
    return "The Italian Game develops quickly with Bc4, aiming at Black's f7 square while building a strong center and preparing to castle. It teaches active piece play, early pressure, and when to turn development into tactics.";
  }

  if (opening.openingId === "caro-kann-defense") {
    return "The Caro-Kann Defense is a solid answer to 1.e4 where Black supports ...d5 with ...c6. It teaches sturdy pawn structures, patient development, and clean counterplay without weakening the king.";
  }

  return `${opening.openingName} is part of your opening study plan. Focus on the main ideas first, then use each line to learn the typical plans and tactical moments.`;
}

function buildOpeningTags(opening, color) {
  const tags = new Set([
    `color:${color}`,
    `difficulty:${opening.openingDifficulty}`,
    "display:pending-popularity",
    "source:regenerated",
    "source:naming:lichess-org-chess-openings",
    "source:continuation:cloud-reference",
  ]);

  if (
    opening.lines.some(
      (line) =>
        line.sourceName?.includes("Lichess cloud") ||
        inferEngineProvider(line) === "lichess" ||
        inferEngineProvider(line) === "mixed"
    )
  ) {
    tags.add("source:engine:lichess-cloud");
  }

  if (
    opening.lines.some(
      (line) =>
        line.sourceName?.includes("Chess-API") ||
        inferEngineProvider(line) === "chess-api"
    )
  ) {
    tags.add("source:engine:chess-api");
  }

  if (
    opening.lines.some(
      (line) =>
        line.sourceName?.includes("Stockfish") ||
        inferEngineProvider(line) === "stockfish" ||
        inferEngineProvider(line) === "mixed"
    )
  ) {
    tags.add("source:engine:fallback-stockfish");
  }

  if (opening.lines.some((line) => line.lineType === "practical_branch")) {
    tags.add("source:branch-generation:lichess-explorer");
  }

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
  if (line.lineType === "practical_branch" && line.triggerMoveSan) {
    return `Practical branch after ${line.triggerMoveSan}: ${line.stopReason ?? "learn the trained-side response to a common deviation."}`;
  }

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

function buildBranchMetadataRow(line) {
  if (line.lineType !== "practical_branch") {
    return null;
  }

  const branch = line.generation?.branch ?? {};
  const parentLineSlug = line.parentLineId ?? branch.parentLineId ?? null;
  const lessonStemPly = line.lessonStemPly ?? branch.lessonStemPly ?? null;
  const lessonStemFen = line.lessonStemFen ?? branch.lessonStemFen ?? null;
  const triggerMoveSan = line.triggerMoveSan ?? branch.triggerMoveSan ?? null;
  const triggerMoveUci = line.triggerMoveUci ?? branch.triggerMoveUci ?? null;

  if (!parentLineSlug || lessonStemPly == null || !lessonStemFen || !triggerMoveSan || !triggerMoveUci) {
    return null;
  }

  return {
    opening_slug: line.openingId,
    line_slug: line.resolvedLineId,
    parent_opening_slug: line.openingId,
    parent_line_slug: parentLineSlug,
    branch_key:
      branch.branchKey ??
      `${line.openingId}::${parentLineSlug}::${lessonStemPly}::${triggerMoveUci}`,
    lesson_title: branch.lessonTitle ?? line.resolvedLineName,
    theme_tags: branch.themeTags ?? [],
    advantage_type: line.advantageTypePrimary ?? null,
    branch_score: line.branchScore ?? branch.branchScore ?? null,
    branch_stem_ply: lessonStemPly,
    branch_stem_fen: lessonStemFen,
    trigger_ply: branch.triggerPly ?? lessonStemPly + 1,
    trigger_move_san: triggerMoveSan,
    trigger_move_uci: triggerMoveUci,
    reference_move_san: line.referenceMoveSan ?? branch.referenceMoveSan ?? null,
    reference_move_uci: line.referenceMoveUci ?? branch.referenceMoveUci ?? null,
    trigger_node_games: line.gamesAtNode ?? branch.gamesAtNode ?? null,
    trigger_move_games: line.gamesForMove ?? branch.gamesForMove ?? null,
    trigger_move_play_rate:
      line.triggerMovePopularity ?? branch.triggerMovePopularity ?? null,
    trigger_cumulative_play_rate: branch.triggerCumulativePlayRate ?? null,
    eval_before_trigger_cp:
      line.evalBeforeTrigger ?? branch.evalBeforeTrigger ?? null,
    eval_after_trigger_cp:
      line.evalAfterTrigger ?? branch.evalAfterTrigger ?? null,
    final_trained_eval_cp:
      line.finalEvalCp ?? branch.finalTrainedEvalCp ?? null,
    eval_gain_cp: line.evalGain ?? branch.evalGain ?? null,
    continuation_trace: branch.continuationTrace ?? line.generation?.extension ?? [],
    selection_metadata: branch.selectionMetadata ?? {},
  };
}

function countExtensionSources(line) {
  const counts = {};
  for (const step of line.generation?.extension ?? []) {
    const source = step?.source ?? "unknown";
    counts[source] = (counts[source] ?? 0) + 1;
  }

  return counts;
}

function inferEngineProvider(line) {
  const sources = Object.keys(countExtensionSources(line));
  const hasLichess = sources.some((source) => source.includes("lichess"));
  const hasChessApi = sources.some((source) => source.includes("chess-api"));
  const hasStockfish = sources.some((source) => source.includes("stockfish"));

  if ((hasLichess || hasChessApi) && hasStockfish) {
    return "mixed";
  }

  if (hasLichess) {
    return "lichess";
  }

  if (hasChessApi) {
    return "chess-api";
  }

  if (hasStockfish) {
    return "stockfish";
  }

  if (line.generation?.engineProvider) {
    return line.generation.engineProvider;
  }

  if (line.sourceName?.includes("Lichess cloud")) {
    return "lichess";
  }

  if (line.sourceName?.includes("Chess-API")) {
    return "chess-api";
  }

  if (line.sourceName?.includes("Stockfish")) {
    return "stockfish";
  }

  return null;
}

function inferAverageEngineDepth(line) {
  if (Number.isFinite(line.generation?.avgExtensionDepth)) {
    return line.generation.avgExtensionDepth;
  }

  if (Number.isFinite(line.stockfish?.depth)) {
    return line.stockfish.depth;
  }

  return null;
}

function buildGenerationMetadata(line) {
  const generation = line.generation ?? {};
  const extensionSourceCounts =
    generation.extensionSourceCounts ?? countExtensionSources(line);

  return {
    sourcePlies: generation.sourcePlies ?? line.sourceSans?.length ?? null,
    addedPlies: generation.addedPlies ?? line.continuationSans?.length ?? null,
    sourceReferenceOnly: generation.sourceReferenceOnly ?? false,
    engineProvider: generation.engineProvider ?? null,
    engineProviderCounts: generation.engineProviderCounts ?? {},
    inferredEngineProvider: inferEngineProvider(line),
    avgExtensionDepth: generation.avgExtensionDepth ?? null,
    finalAnalysisDepth: line.stockfish?.depth ?? null,
    finalAnalysisSource: line.stockfish?.source ?? null,
    extensionSourceCounts,
    stopSignals: generation.stopSignals ?? [],
    lineKind: line.lineKind ?? (line.lineType === "practical_branch" ? "practical_branch" : "reference"),
    lineType: line.lineType ?? null,
    branch:
      generation.branch ??
      (line.lineType === "practical_branch"
        ? {
            parentLineId: line.parentLineId ?? null,
            branchDepth: line.branchDepth ?? null,
            lessonStemPly: line.lessonStemPly ?? null,
            lessonStemFen: line.lessonStemFen ?? null,
            triggerMoveSan: line.triggerMoveSan ?? null,
            triggerMovePopularity: line.triggerMovePopularity ?? null,
            gamesAtNode: line.gamesAtNode ?? null,
            gamesForMove: line.gamesForMove ?? null,
            evalBeforeTrigger: line.evalBeforeTrigger ?? null,
            evalAfterTrigger: line.evalAfterTrigger ?? null,
            evalGain: line.evalGain ?? null,
          }
        : null),
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
    lineType: line.lineType ?? null,
    lineKind: line.lineKind ?? (line.lineType === "practical_branch" ? "practical_branch" : "reference"),
    primaryCategory: line.primaryCategory,
    inclusionOutcome: line.inclusionOutcome,
    lineDifficulty: line.lineDifficulty,
    lineDifficultyConfidence: line.lineDifficultyConfidence,
    isMainLine: line.isMainLine,
    mainLineConfidence: line.mainLineConfidence,
    popularityRankWithinOpening: line.popularityRankWithinOpening,
    popularityScore: line.popularityScore,
    popularityGames: line.popularityGames,
    evalCpByPly: line.evalCpByPly ?? null,
    finalEvalCp: line.finalEvalCp,
    finalEvalPerspective: line.finalEvalPerspective,
    engineChecked: line.engineChecked,
    stopReason: line.stopReason,
    sourceName: line.sourceName,
    sourceConfidence: line.sourceConfidence,
    variationAnchorPly: line.variationAnchorSans?.length ?? null,
    variationAnchorName: line.variationName ?? line.lineName ?? null,
    variationAnchorFen: line.variationAnchorFen ?? null,
    variationAnchorSans: line.variationAnchorSans ?? null,
    engineProvider: inferEngineProvider(line),
    engineModel: line.sourceName ?? null,
    avgEngineDepth: inferAverageEngineDepth(line),
    generationMetadata: buildGenerationMetadata(line),
    parentLineId: line.parentLineId ?? null,
    branchDepth: line.branchDepth ?? null,
    lessonStemPly: line.lessonStemPly ?? null,
    lessonStemFen: line.lessonStemFen ?? null,
    triggerMoveSan: line.triggerMoveSan ?? null,
    triggerMovePopularity: line.triggerMovePopularity ?? null,
    gamesAtNode: line.gamesAtNode ?? null,
    gamesForMove: line.gamesForMove ?? null,
    evalBeforeTrigger: line.evalBeforeTrigger ?? null,
    evalAfterTrigger: line.evalAfterTrigger ?? null,
    evalGain: line.evalGain ?? null,
    branchScore: line.branchScore ?? null,
    triggerMoveUci: line.triggerMoveUci ?? null,
    referenceMoveSan: line.referenceMoveSan ?? null,
    referenceMoveUci: line.referenceMoveUci ?? null,
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
      evalCpByPly: line.evalCpByPly ?? null,
      finalEvalCp: line.finalEvalCp,
      finalEvalPerspective: line.finalEvalPerspective,
      engineChecked: line.engineChecked,
    })),
  };
}

function assignPopularityRanks(lines) {
  // Only fill in ranks that the generator didn't already set.
  // gamesAtNode is a sentinel (Number.MAX_SAFE_INTEGER) in reference-best-play
  // mode and must not be used as a real game count.
  const needsRank = lines.filter(
    (l) => l.popularityRankWithinOpening == null && l.lineType !== "practical_branch"
  );
  if (needsRank.length === 0) return;

  // Fall back to array-position ordering (generator already emits lines in
  // Lichess popularity order, so position is a valid proxy).
  needsRank.forEach((line, i) => {
    line.popularityRankWithinOpening = i + 1;
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const normalized = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const openings = Array.isArray(normalized.openings) ? normalized.openings : [];
  const resolvedOpenings = openings.map((opening) => ({
    ...opening,
    lines: resolveOpeningLines(opening),
  }));

  // Assign popularity ranks within each opening based on Lichess game counts
  for (const opening of resolvedOpenings) {
    assignPopularityRanks(opening.lines);
  }

  const openingsCatalogRows = resolvedOpenings.map(buildCatalogRow);
  const openingLinesRows = resolvedOpenings.flatMap((opening) =>
    opening.lines.map((line, index) => buildLineRow(line, index))
  );
  const openingLineBranchMetadataRows = resolvedOpenings
    .flatMap((opening) => opening.lines.map(buildBranchMetadataRow))
    .filter(Boolean);

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
      branchMetadata: openingLineBranchMetadataRows.length,
    },
    currentSchema: {
      openingsCatalogRows,
      openingLinesRows,
      openingLineBranchMetadataRows,
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
        branchMetadata: openingLineBranchMetadataRows.length,
      },
      null,
      2
    )
  );
}

main();
