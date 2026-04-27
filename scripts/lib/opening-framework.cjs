const { normalizeText } = require("./chess-openings-source.cjs");

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferPrimaryCategory({ family, variation, fullName }) {
  const text = normalizeText([family, variation, fullName].filter(Boolean).join(" "));

  if (
    text.includes("trap") ||
    text.includes("countertrap")
  ) {
    return "trap";
  }

  if (
    text.includes("gambit") ||
    text.includes("sacrifice") ||
    text.includes("fried liver") ||
    text.includes("marshall attack")
  ) {
    return "gambit";
  }

  if (
    text.includes("attack") ||
    text.includes("counterattack") ||
    text.includes("counter attack") ||
    text.includes("refutation")
  ) {
    return "punishment";
  }

  if (
    text.includes("accepted") ||
    text.includes("declined") ||
    text.includes("forced") ||
    text.includes("main line")
  ) {
    return "forcing";
  }

  if (
    text.includes("system") ||
    text.includes("setup") ||
    text.includes("london") ||
    text.includes("colle") ||
    text.includes("kings indian attack")
  ) {
    return "setup";
  }

  if (
    text.includes("closed") ||
    text.includes("classical") ||
    text.includes("exchange") ||
    text.includes("fianchetto") ||
    text.includes("variation")
  ) {
    return "strategic";
  }

  return "setup";
}

function buildOpeningIds(sourceEntry) {
  const openingId = slugify(sourceEntry.family || sourceEntry.name);
  const lineBase = sourceEntry.variation || sourceEntry.family || sourceEntry.name;
  const lineId = slugify(
    sourceEntry.variation ? `${sourceEntry.family} ${sourceEntry.variation}` : lineBase
  );

  return {
    openingId,
    lineId,
  };
}

function inferMainLineStatus(sourceEntry) {
  const family = normalizeText(sourceEntry.family || "");
  const variation = normalizeText(sourceEntry.variation || "");

  if (!variation || variation === family) {
    return {
      isMainLine: true,
      mainLineConfidence: "authoritative",
      mainLineSource:
        "The naming source presents this branch as the root opening entry.",
    };
  }

  if (variation.includes("main line")) {
    return {
      isMainLine: true,
      mainLineConfidence: "authoritative",
      mainLineSource:
        "The naming source explicitly labels this branch as a main line.",
    };
  }

  if (
    variation.includes("classical variation") ||
    variation.includes("closed variation") ||
    variation.includes("open variation")
  ) {
    return {
      isMainLine: true,
      mainLineConfidence: "provisional",
      mainLineSource:
        "FirstMove is provisionally treating this canonical branch as the main line for ordering.",
    };
  }

  return {
    isMainLine: false,
    mainLineConfidence: "none",
    mainLineSource: null,
  };
}

function inferLineDifficulty({
  primaryCategory,
  sourceEntry,
  generatedSans,
  addedPlies,
}) {
  const text = normalizeText(
    [sourceEntry.family, sourceEntry.variation, sourceEntry.name]
      .filter(Boolean)
      .join(" ")
  );
  const totalPlies = generatedSans.length;
  const tacticalCount = generatedSans.filter((san) => /[x+#]/.test(san)).length;

  let difficulty = "beginner";
  let confidence = "medium";
  let source =
    "Framework-guided heuristic based on category, move-order sharpness, and tactical complexity.";

  if (
    primaryCategory === "gambit" ||
    primaryCategory === "forcing" ||
    primaryCategory === "punishment" ||
    primaryCategory === "trap"
  ) {
    difficulty = "intermediate";
  }

  if (
    text.includes("frankenstein") ||
    text.includes("dracula") ||
    text.includes("marshall attack") ||
    text.includes("fried liver") ||
    text.includes("traxler") ||
    text.includes("muzio") ||
    text.includes("fajarowicz") ||
    text.includes("stafford") ||
    text.includes("lasker trap")
  ) {
    difficulty = "advanced";
  }

  if (
    primaryCategory === "setup" &&
    totalPlies <= 10 &&
    tacticalCount === 0 &&
    addedPlies <= 3
  ) {
    difficulty = "beginner";
  }

  if (
    primaryCategory === "strategic" &&
    totalPlies >= 12
  ) {
    difficulty = "intermediate";
  }

  if (
    tacticalCount >= 3 ||
    addedPlies >= 5
  ) {
    difficulty = difficulty === "beginner" ? "intermediate" : difficulty;
  }

  if (
    text.includes("najdorf") ||
    text.includes("dragon") ||
    text.includes("grunfeld") ||
    text.includes("nimzo") ||
    text.includes("benoni") ||
    text.includes("king indian defense")
  ) {
    difficulty = difficulty === "advanced" ? "advanced" : "intermediate";
  }

  if (
    text.includes("london") ||
    text.includes("colle") ||
    text.includes("kings indian attack") ||
    text.includes("four knights") ||
    text.includes("italian game")
  ) {
    if (difficulty === "beginner") {
      confidence = "medium";
    }
  }

  return {
    lineDifficulty: difficulty,
    lineDifficultyConfidence: confidence,
    lineDifficultySource: source,
  };
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

function deriveOpeningDifficulty(lines) {
  const sorted = [...lines].sort((left, right) => {
    if (left.isMainLine !== right.isMainLine) {
      return left.isMainLine ? -1 : 1;
    }

    if (left.mainLineConfidence !== right.mainLineConfidence) {
      const confidenceRank = { authoritative: 3, provisional: 2, none: 1 };
      return (
        (confidenceRank[right.mainLineConfidence] ?? 0) -
        (confidenceRank[left.mainLineConfidence] ?? 0)
      );
    }

    return difficultyRank(left.lineDifficulty) - difficultyRank(right.lineDifficulty);
  });

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

module.exports = {
  buildOpeningIds,
  deriveOpeningDifficulty,
  difficultyRank,
  inferMainLineStatus,
  inferLineDifficulty,
  inferPrimaryCategory,
  slugify,
};
