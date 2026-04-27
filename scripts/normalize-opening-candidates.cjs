#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_INPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-candidates-merged.json"
);

const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-candidates-normalized.json"
);

const GENERIC_SEGMENTS = new Set([
  "accepted",
  "advance variation",
  "alekhine variation",
  "approved defense",
  "classical defense",
  "classical variation",
  "closed variation",
  "counterthrust variation",
  "declined",
  "exchange variation",
  "fianchetto defense",
  "forced line",
  "irish gambit",
  "knights variation",
  "kramnik's line",
  "lundin variation",
  "lutikov variation",
  "main line",
  "modern defense",
  "modern exchange variation",
  "open variation",
  "pawn grab line",
  "pawn push variation",
  "polish variation",
  "pseudo-samisch",
  "quiet line",
  "randspringer variation",
  "reshevsky gambit",
  "russian variation",
  "shropshire defense",
  "standard defense",
  "standard line",
  "stockholm variation",
  "three knights variation",
  "with nc3",
  "with nf3",
]);

const PROMOTION_RULES = {
  "queen-pawn-game": [
    [/^Accelerated London System\b/u, "Accelerated London System"],
    [/^Anglo-Slav Opening\b/u, "Anglo-Slav Opening"],
    [/^Anti-Torre\b/u, "Anti-Torre"],
    [/^Barry Attack\b/u, "Barry Attack"],
    [/^Chandler Gambit\b/u, "Chandler Gambit"],
    [/^Hübsch Gambit\b/u, "Hübsch Gambit"],
    [/^Levitsky Attack\b/u, "Levitsky Attack"],
    [/^Liedmann Gambit\b/u, "Liedmann Gambit"],
    [/^Mason Attack\b/u, "Mason Attack"],
    [/^Stonewall Attack\b/u, "Stonewall Attack"],
    [/^Torre Attack\b/u, "Torre Attack"],
    [/^Veresov(?: Attack)?\b/u, "Veresov Attack"],
    [/^Zurich Gambit\b/u, "Zurich Gambit"],
  ],
  "indian-defense": [
    [/^Accelerated London System\b/u, "Accelerated London System"],
    [/^Anti-Grünfeld\b/u, "Anti-Grünfeld"],
    [/^Anti-Nimzo-Indian\b/u, "Anti-Nimzo-Indian"],
    [/^Czech-Indian\b/u, "Czech-Indian"],
    [/^Devin Gambit\b/u, "Devin Gambit"],
    [/^Döry Indian\b/u, "Döry Indian"],
    [/^Dzindzi-Indian Defense\b/u, "Dzindzi-Indian Defense"],
    [/^Gedult Attack\b/u, "Gedult Attack"],
    [/^Gibbins-Weidenhagen Gambit\b/u, "Gibbins-Weidenhagen Gambit"],
    [/^Lazard Gambit\b/u, "Lazard Gambit"],
    [/^Maddigan Gambit\b/u, "Maddigan Gambit"],
    [/^Omega Gambit\b/u, "Omega Gambit"],
    [/^Paleface Attack\b/u, "Paleface Attack"],
    [/^Pseudo-Benko\b/u, "Pseudo-Benko"],
    [/^Reversed Chigorin Defense\b/u, "Reversed Chigorin Defense"],
    [/^Seirawan Attack\b/u, "Seirawan Attack"],
    [/^Tartakower Attack\b/u, "Tartakower Attack"],
    [/^West Indian Defense\b/u, "West Indian Defense"],
  ],
  "modern-defense": [
    [/^Anti-Modern\b/u, "Anti-Modern"],
    [/^Averbakh System\b/u, "Averbakh System"],
    [/^Bishop Attack\b/u, "Bishop Attack"],
    [/^Fianchetto Gambit\b/u, "Fianchetto Gambit"],
    [/^Gurgenidze Defense\b/u, "Gurgenidze Defense"],
    [/^Lizard Defense\b/u, "Lizard Defense"],
    [/^Masur Gambit\b/u, "Masur Gambit"],
    [/^Modern Pterodactyl\b/u, "Modern Pterodactyl"],
    [/^Mongredien Defense\b/u, "Mongredien Defense"],
    [/^Neo-Modern Defense\b/u, "Neo-Modern Defense"],
    [/^Norwegian Defense\b/u, "Norwegian Defense"],
    [/^Pseudo-Austrian Attack\b/u, "Pseudo-Austrian Attack"],
    [/^Three Pawns Attack\b/u, "Three Pawns Attack"],
  ],
  "king-pawn-game": [
    [/^Alapin Opening\b/u, "Alapin Opening"],
    [/^Bavarian Gambit\b/u, "Bavarian Gambit"],
    [/^Beyer Gambit\b/u, "Beyer Gambit"],
    [/^Busch-Gass Gambit\b/u, "Busch-Gass Gambit"],
    [/^King's Head Opening\b/u, "King's Head Opening"],
    [/^MacLeod Attack\b/u, "MacLeod Attack"],
    [/^Maróczy Defense\b/u, "Maróczy Defense"],
    [/^Mengarini's Opening\b/u, "Mengarini's Opening"],
    [/^Napoleon Attack\b/u, "Napoleon Attack"],
    [/^Philidor Gambit\b/u, "Philidor Gambit"],
    [/^Tortoise Opening\b/u, "Tortoise Opening"],
    [/^Wayward Queen Attack\b/u, "Wayward Queen Attack"],
    [/^Weber Gambit\b/u, "Weber Gambit"],
  ],
};

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

function difficultyRank(value) {
  if (value === "advanced") {
    return 3;
  }

  if (value === "intermediate") {
    return 2;
  }

  return 1;
}

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    maxLinesPerOpening: 20,
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

    if (token === "--max-lines-per-opening") {
      args.maxLinesPerOpening = Number(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return args;
}

function confidenceRank(value) {
  return { authoritative: 3, provisional: 2, none: 1 }[value] ?? 0;
}

function compareLines(left, right) {
  if (left.isMainLine !== right.isMainLine) {
    return left.isMainLine ? -1 : 1;
  }

  const mainConfidenceDiff =
    confidenceRank(right.mainLineConfidence) -
    confidenceRank(left.mainLineConfidence);
  if (mainConfidenceDiff !== 0) {
    return mainConfidenceDiff;
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

function extractVariationSegments(fullName) {
  const parts = fullName.split(":");
  if (parts.length < 2) {
    return [];
  }

  return parts
    .slice(1)
    .join(":")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSegment(value) {
  return normalizeText(value);
}

function resolvePromotedOpening(line) {
  const rules = PROMOTION_RULES[line.openingId];
  if (!rules || rules.length === 0) {
    return null;
  }

  for (const [pattern, openingName] of rules) {
    if (pattern.test(line.fullName)) {
      return openingName;
    }
  }

  const [firstSegment] = extractVariationSegments(line.fullName);
  if (!firstSegment) {
    return null;
  }

  const normalized = normalizeSegment(firstSegment);
  if (GENERIC_SEGMENTS.has(normalized)) {
    return null;
  }

  if (
    /\b(attack|gambit|opening|system|defense|defence)\b/ui.test(firstSegment) ||
    /^Anti-/u.test(firstSegment) ||
    /Indian\b/u.test(firstSegment)
  ) {
    return firstSegment;
  }

  return null;
}

function rebuildLineIdentity(line, openingName) {
  const openingId = slugify(openingName);
  const lineId =
    normalizeSegment(line.lineName) === normalizeSegment(openingName)
      ? slugify(openingName)
      : slugify(`${openingName} ${line.lineName}`);

  const isMainLine =
    normalizeSegment(line.lineName) === normalizeSegment(openingName) ||
    normalizeSegment(line.fullName).endsWith("main line");

  return {
    ...line,
    openingId,
    openingName,
    lineId,
    isMainLine,
    mainLineConfidence: isMainLine
      ? "authoritative"
      : line.mainLineConfidence ?? "none",
    mainLineSource: isMainLine
      ? "Opening-family normalization promoted this branch to the opening root line."
      : line.mainLineSource ?? null,
  };
}

function regroupResults(results) {
  const promoted = [];

  const normalizedResults = results.map((line) => {
    const promotedOpening = resolvePromotedOpening(line);
    if (!promotedOpening || promotedOpening === line.openingName) {
      return line;
    }

    promoted.push({
      fullName: line.fullName,
      fromOpeningId: line.openingId,
      fromOpeningName: line.openingName,
      toOpeningId: slugify(promotedOpening),
      toOpeningName: promotedOpening,
    });

    return rebuildLineIdentity(line, promotedOpening);
  });

  return {
    normalizedResults,
    promoted,
  };
}

function buildOpenings(results, maxLinesPerOpening) {
  const grouped = new Map();

  for (const result of results) {
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

  const trimmed = [];

  const openings = Array.from(grouped.values())
    .map((opening) => {
      const sortedLines = [...opening.lines].sort(compareLines);
      const keptLines = sortedLines.slice(0, maxLinesPerOpening).map((line, index) => ({
        ...line,
        popularityRankWithinOpening:
          line.popularityRankWithinOpening ?? index + 1,
      }));

      const removedLines = sortedLines.slice(maxLinesPerOpening);
      for (const removedLine of removedLines) {
        trimmed.push({
          fullName: removedLine.fullName,
          openingId: opening.openingId,
          openingName: opening.openingName,
          reason: `Exceeded the final ${maxLinesPerOpening}-line cap for this normalized opening family.`,
        });
      }

      const difficulty = deriveOpeningDifficulty(keptLines);

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
        lineCount: keptLines.length,
        lines: keptLines,
      };
    })
    .sort((left, right) => left.openingName.localeCompare(right.openingName));

  const keptResults = openings.flatMap((opening) => opening.lines);

  return {
    openings,
    keptResults,
    trimmed,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const originalResults = Array.isArray(payload.results) ? payload.results : [];

  const { normalizedResults, promoted } = regroupResults(originalResults);
  const { openings, keptResults, trimmed } = buildOpenings(
    normalizedResults,
    args.maxLinesPerOpening
  );

  const normalizedPayload = {
    generatedAt: new Date().toISOString(),
    status: "complete",
    source: {
      ...payload.source,
      normalizedFrom: path.basename(args.input),
    },
    config: {
      maxLinesPerOpening: args.maxLinesPerOpening,
    },
    count: keptResults.length,
    openingCount: openings.length,
    promotedCount: promoted.length,
    trimmedCount: trimmed.length,
    promoted,
    trimmed,
    openings,
    results: keptResults,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(
    args.output,
    `${JSON.stringify(normalizedPayload, null, 2)}\n`,
    "utf8"
  );

  const overCap = openings
    .filter((opening) => opening.lineCount > args.maxLinesPerOpening)
    .map((opening) => ({
      openingId: opening.openingId,
      openingName: opening.openingName,
      lineCount: opening.lineCount,
    }));

  console.log(`Wrote normalized opening candidates to ${args.output}`);
  console.log(
    JSON.stringify(
      {
        originalCount: originalResults.length,
        promotedCount: promoted.length,
        trimmedCount: trimmed.length,
        count: keptResults.length,
        openingCount: openings.length,
        overCapCount: overCap.length,
      },
      null,
      2
    )
  );
}

main();
