#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const {
  fetchChessOpeningsDataset,
  normalizeText,
} = require("./lib/chess-openings-source.cjs");
const { loadOpeningDefinitions } = require("./lib/opening-dataset.cjs");

const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "opening-name-audit.json"
);

const GENERIC_LINE_NAMES = new Set(
  [
    "accepted",
    "declined",
    "main line",
    "main setup",
    "main variation",
    "classical variation",
    "modern variation",
    "exchange variation",
    "closed variation",
    "open variation",
    "main",
  ].map((value) => normalizeText(value))
);

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    opening: null,
    line: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--output") {
      args.output = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--opening") {
      args.opening = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--line") {
      args.line = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function flattenOpenings(openings) {
  return openings.flatMap((opening) => {
    const lines = [opening.mainLine, ...(opening.variations ?? [])];
    return lines.map((line) => ({
      openingId: opening.id,
      openingName: opening.name,
      ecoCode: opening.ecoCode,
      lineId: line.id,
      lineName: line.name,
      description: line.description ?? null,
      sans: line.sans,
    }));
  });
}

function filterEntries(entries, args) {
  return entries.filter((entry) => {
    if (args.opening && entry.openingId !== args.opening) {
      return false;
    }

    if (args.line && entry.lineId !== args.line) {
      return false;
    }

    return true;
  });
}

function isPrefix(prefix, full) {
  if (prefix.length > full.length) {
    return false;
  }

  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] !== full[index]) {
      return false;
    }
  }

  return true;
}

function buildCandidate(entry, source) {
  const currentSans = entry.sans;
  const sourceSans = source.sans;
  const currentFullName = `${entry.openingName}: ${entry.lineName}`;

  const sourcePrefixOfCurrent = isPrefix(sourceSans, currentSans);
  const currentPrefixOfSource = isPrefix(currentSans, sourceSans);

  if (!sourcePrefixOfCurrent && !currentPrefixOfSource) {
    return null;
  }

  const relation = sourcePrefixOfCurrent
    ? sourceSans.length === currentSans.length
      ? "exact"
      : "source-prefix-of-current"
    : "current-prefix-of-source";

  const normalizedCurrentOpening = normalizeText(entry.openingName);
  const normalizedCurrentLine = normalizeText(entry.lineName);
  const normalizedCurrentFullName = normalizeText(currentFullName);

  const openingExact = source.normalizedFamily === normalizedCurrentOpening;
  const lineExact = source.normalizedVariation === normalizedCurrentLine;
  const fullNameExact = source.normalizedName === normalizedCurrentFullName;
  const genericLine = GENERIC_LINE_NAMES.has(normalizedCurrentLine);
  const localStyleLine =
    normalizedCurrentLine.startsWith("vs ") ||
    normalizedCurrentLine.endsWith(" setup") ||
    normalizedCurrentLine.endsWith(" main");

  let score = 0;
  score += Math.min(sourceSans.length, currentSans.length) * 4;
  score += fullNameExact ? 200 : 0;
  score += lineExact ? 120 : 0;
  score += openingExact ? 80 : 0;
  score += relation === "exact" ? 50 : 0;
  score += relation === "source-prefix-of-current" ? 30 : 0;
  score -= genericLine ? 10 : 0;
  score -= localStyleLine ? 10 : 0;

  return {
    score,
    relation,
    openingExact,
    lineExact,
    fullNameExact,
    genericLine,
    localStyleLine,
    source,
  };
}

function classifyMatch(entry, match) {
  if (!match) {
    return {
      status: "manual-review",
      confidence: "low",
      reason: "No named source line matched this SAN sequence by prefix.",
    };
  }

  if (match.fullNameExact && match.relation !== "current-prefix-of-source") {
    return {
      status: "authoritative-match",
      confidence: "high",
      reason: "Current opening and line names match an authoritative named line.",
    };
  }

  if (match.lineExact && match.openingExact) {
    return {
      status: "authoritative-match",
      confidence: match.relation === "current-prefix-of-source" ? "medium" : "high",
      reason:
        match.relation === "current-prefix-of-source"
          ? "Current line name matches an authoritative variation, but the current SAN line stops earlier than the source."
          : "Current line name matches an authoritative variation.",
    };
  }

  if (match.openingExact && (match.genericLine || match.localStyleLine)) {
    return {
      status: "generic-local-label",
      confidence: "medium",
      reason:
        "The moves map to a known opening family, but the current line label is generic or app-specific rather than an authoritative variation name.",
    };
  }

  if (match.openingExact) {
    return {
      status: "rename-recommended",
      confidence: "medium",
      reason:
        "The moves map to a known opening family, but the current line label does not match the strongest named variation match.",
    };
  }

  if (match.lineExact) {
    return {
      status: "rename-recommended",
      confidence: "medium",
      reason:
        "The variation name matches an authoritative source, but it belongs under a different or more specific opening family label.",
    };
  }

  return {
    status: "manual-review",
    confidence: "low",
    reason:
      "A prefix match exists, but it points to a different opening family or unclear transposition label.",
  };
}

function pickBestMatch(entry, sourceEntries) {
  let best = null;

  for (const source of sourceEntries) {
    const candidate = buildCandidate(entry, source);
    if (!candidate) {
      continue;
    }

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

function summarize(results) {
  const summary = {
    total: results.length,
    authoritativeMatch: 0,
    genericLocalLabel: 0,
    renameRecommended: 0,
    manualReview: 0,
  };

  for (const result of results) {
    if (result.status === "authoritative-match") {
      summary.authoritativeMatch += 1;
    } else if (result.status === "generic-local-label") {
      summary.genericLocalLabel += 1;
    } else if (result.status === "rename-recommended") {
      summary.renameRecommended += 1;
    } else {
      summary.manualReview += 1;
    }
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const openingEntries = filterEntries(
    flattenOpenings(loadOpeningDefinitions()),
    args
  );

  if (openingEntries.length === 0) {
    throw new Error("No opening lines matched the provided filters.");
  }

  const sourceEntries = await fetchChessOpeningsDataset();
  const results = openingEntries.map((entry) => {
    const best = pickBestMatch(entry, sourceEntries);
    const classification = classifyMatch(entry, best);

    return {
      openingId: entry.openingId,
      openingName: entry.openingName,
      ecoCode: entry.ecoCode,
      lineId: entry.lineId,
      lineName: entry.lineName,
      sans: entry.sans,
      status: classification.status,
      confidence: classification.confidence,
      reason: classification.reason,
      bestMatch: best
        ? {
            relation: best.relation,
            sourceEco: best.source.eco,
            sourceName: best.source.name,
            sourcePgn: best.source.pgn,
            sourceSans: best.source.sans,
            openingExact: best.openingExact,
            lineExact: best.lineExact,
            fullNameExact: best.fullNameExact,
          }
        : null,
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "lichess-org/chess-openings",
    summary: summarize(results),
    results,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Wrote opening name audit to ${args.output}`);
  console.log(JSON.stringify(payload.summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
