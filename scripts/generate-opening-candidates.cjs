#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Chess } = require("./lib/chess-js.cjs");

const {
  fetchChessOpeningsDataset,
  normalizeText,
} = require("./lib/chess-openings-source.cjs");
const {
  fetchLichessExplorer,
  totalGames,
} = require("./lib/lichess-explorer.cjs");
const {
  createStockfishEngine,
  parseInfoLine,
} = require("./lib/stockfish.cjs");

const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-candidates.json"
);

const SCORE_MATE_CP = 100000;
const STOCKFISH_CP_CLEAR = 120;
const STOCKFISH_CP_STRONG = 200;
const DEFAULT_MIN_GAMES_AT_NODE = 250;

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    limit: null,
    offset: 0,
    ecoVolume: null,
    startsWith: null,
    delayMs: 800,
    maxAddedPlies: 20,
    maxTotalPlies: 40,
    stockfishDepth: 10,
    stockfishEngine: "lite-single",
    checkpointEvery: 10,
    resume: false,
    minGamesAtNode: DEFAULT_MIN_GAMES_AT_NODE,
    multipvCount: 3,
    shortHorizonPlies: 4,
    shortHorizonMaxPlies: 6,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--output") {
      args.output = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--limit") {
      args.limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--offset") {
      args.offset = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--eco-volume") {
      args.ecoVolume = String(argv[index + 1]).toUpperCase();
      index += 1;
      continue;
    }

    if (token === "--starts-with") {
      args.startsWith = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }

    if (token === "--delay-ms") {
      args.delayMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--max-added-plies") {
      args.maxAddedPlies = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--max-total-plies") {
      args.maxTotalPlies = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--stockfish-depth") {
      args.stockfishDepth = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--stockfish-engine") {
      args.stockfishEngine = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--checkpoint-every") {
      args.checkpointEvery = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--min-games-at-node") {
      args.minGamesAtNode = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--multipv-count") {
      args.multipvCount = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--short-horizon-plies") {
      args.shortHorizonPlies = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--short-horizon-max-plies") {
      args.shortHorizonMaxPlies = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--resume") {
      args.resume = true;
    }
  }

  return args;
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function filterEntries(entries, args) {
  let filtered = dedupeEntries(entries);

  if (args.ecoVolume) {
    filtered = filtered.filter((entry) => entry.eco.startsWith(args.ecoVolume));
  }

  if (args.startsWith) {
    filtered = filtered.filter((entry) =>
      entry.name.toLowerCase().startsWith(args.startsWith.toLowerCase())
    );
  }

  if (Number.isFinite(args.limit) && args.limit > 0) {
    filtered = filtered.slice(args.offset, args.offset + args.limit);
  }

  return filtered;
}

function dedupeEntries(entries) {
  const deduped = new Map();

  for (const entry of entries) {
    const current = deduped.get(entry.name);
    if (!current || entry.sans.length < current.sans.length) {
      deduped.set(entry.name, entry);
    }
  }

  return Array.from(deduped.values()).sort((left, right) => {
    const ecoCompare = left.eco.localeCompare(right.eco);
    if (ecoCompare !== 0) {
      return ecoCompare;
    }

    return left.name.localeCompare(right.name);
  });
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

function splitVariationSegments(entry) {
  const segments = String(entry.variation ?? "")
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);

  return [entry.family, ...segments];
}

function inferPrimaryCategory(entry) {
  const text = normalizeText(
    [entry.family, entry.variation, entry.name].filter(Boolean).join(" ")
  );

  if (
    text.includes("trap") ||
    text.includes("gambit") ||
    text.includes("countergambit") ||
    text.includes("sacrifice") ||
    text.includes("attack") ||
    text.includes("punish") ||
    text.includes("refutation") ||
    text.includes("fried liver") ||
    text.includes("marshall attack")
  ) {
    return "tactical_payoff";
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
    text.includes("king indian attack") ||
    text.includes("stonewall")
  ) {
    return "setup";
  }

  return "strategic";
}

function inferMainLineStatus(entry) {
  const variation = normalizeText(entry.variation || "");
  const family = normalizeText(entry.family || "");

  if (!variation || variation === family) {
    return {
      isMainLine: true,
      mainLineConfidence: "authoritative",
      mainLineSource: "This branch is the root named variation entry.",
    };
  }

  if (variation.includes("main line")) {
    return {
      isMainLine: true,
      mainLineConfidence: "authoritative",
      mainLineSource: "The naming source explicitly labels this branch as a main line.",
    };
  }

  return {
    isMainLine: false,
    mainLineConfidence: "none",
    mainLineSource: null,
  };
}

function isSourceMainLineEntry(entry) {
  return normalizeText(entry.variation || "").includes("main line");
}

function buildLineDifficulty({
  category,
  generatedSans,
  addedPlies,
}) {
  const tacticalCount = generatedSans.filter((san) => /[x+#]/.test(san)).length;

  if (category === "tactical_payoff" || category === "forcing") {
    if (tacticalCount >= 4 || addedPlies >= 8) {
      return {
        lineDifficulty: "advanced",
        lineDifficultyConfidence: "medium",
        lineDifficultySource: "Derived from tactical density and extension length.",
      };
    }

    return {
      lineDifficulty: "intermediate",
      lineDifficultyConfidence: "medium",
      lineDifficultySource: "Derived from tactical/forcing character.",
    };
  }

  if (category === "strategic" && (tacticalCount >= 2 || addedPlies >= 6)) {
    return {
      lineDifficulty: "intermediate",
      lineDifficultyConfidence: "medium",
      lineDifficultySource: "Derived from strategic complexity and added plies.",
    };
  }

  return {
    lineDifficulty: "beginner",
    lineDifficultyConfidence: "medium",
    lineDifficultySource: "Derived from quiet structure and low tactical density.",
  };
}

function difficultyRank(value) {
  return { beginner: 1, intermediate: 2, advanced: 3 }[value] ?? 0;
}

function deriveOpeningDifficulty(lines) {
  const representative = [...lines].sort(compareLinesForDisplay)[0];

  return {
    openingDifficulty: representative?.lineDifficulty ?? "beginner",
    openingDifficultyConfidence:
      representative?.lineDifficultyConfidence ?? "low",
    openingDifficultySource: representative
      ? `Derived from representative line "${representative.lineName}".`
      : "No representative line available.",
  };
}

function buildOpeningIds(entry) {
  return {
    openingId: slugify(entry.family),
    variationId: slugify(entry.name),
    lineId: slugify(entry.name),
  };
}

function sansToPgn(sans, initialSans = []) {
  const chess = new Chess();
  const moves = [];

  for (const san of initialSans) {
    chess.move(san);
  }

  for (const san of sans) {
    const moveNumber = chess.moveNumber();
    if (chess.turn() === "w") {
      moves.push(`${moveNumber}. ${san}`);
    } else if (moves.length === 0) {
      moves.push(`${moveNumber}... ${san}`);
    } else {
      moves[moves.length - 1] = `${moves[moves.length - 1]} ${san}`;
    }

    chess.move(san);
  }

  return moves.join(" ").trim();
}

function computeMaterialEdge(chess, openingColor) {
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let white = 0;
  let black = 0;

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) {
        continue;
      }

      const value = values[piece.type] ?? 0;
      if (piece.color === "w") {
        white += value;
      } else {
        black += value;
      }
    }
  }

  return openingColor === "white" ? white - black : black - white;
}

function countDevelopedMinorPieces(chess, colorCode) {
  const startingSquares =
    colorCode === "w"
      ? new Set(["b1", "g1", "c1", "f1"])
      : new Set(["b8", "g8", "c8", "f8"]);
  let developed = 0;

  const board = chess.board();
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank][file];
      if (!piece || piece.color !== colorCode) {
        continue;
      }

      if (piece.type !== "n" && piece.type !== "b") {
        continue;
      }

      const square = `${String.fromCharCode(97 + file)}${8 - rank}`;
      if (!startingSquares.has(square)) {
        developed += 1;
      }
    }
  }

  return developed;
}

function hasCastled(chess, colorCode) {
  const kingside = colorCode === "w" ? "g1" : "g8";
  const queenside = colorCode === "w" ? "c1" : "c8";
  const kingsideKing = chess.get(kingside);
  const queensideKing = chess.get(queenside);

  return (
    (kingsideKing && kingsideKing.type === "k" && kingsideKing.color === colorCode) ||
    (queensideKing &&
      queensideKing.type === "k" &&
      queensideKing.color === colorCode)
  );
}

function uciToMoveObject(uci) {
  let normalizedUci = uci;

  if (uci === "e1h1") {
    normalizedUci = "e1g1";
  } else if (uci === "e1a1") {
    normalizedUci = "e1c1";
  } else if (uci === "e8h8") {
    normalizedUci = "e8g8";
  } else if (uci === "e8a8") {
    normalizedUci = "e8c8";
  }

  return {
    from: normalizedUci.slice(0, 2),
    to: normalizedUci.slice(2, 4),
    promotion: normalizedUci.slice(4) || undefined,
  };
}

function scoreToCp(score) {
  if (!score) {
    return null;
  }

  if (score.type === "cp") {
    return score.value;
  }

  if (score.type === "mate") {
    return score.value > 0 ? SCORE_MATE_CP : -SCORE_MATE_CP;
  }

  return null;
}

function perspectiveEvalCp(score, turnColor, targetColor) {
  const cp = scoreToCp(score);
  if (!Number.isFinite(cp)) {
    return null;
  }

  return turnColor === targetColor ? cp : -cp;
}

function evalStabilityCp(history) {
  if (history.length === 0) {
    return 0;
  }

  const current = history[history.length - 1];
  const samples = [];

  if (history.length >= 3) {
    samples.push(Math.abs(current - history[history.length - 3]));
  }

  if (history.length >= 5) {
    samples.push(Math.abs(current - history[history.length - 5]));
  }

  if (samples.length === 0) {
    return 0;
  }

  return Math.max(...samples);
}

function moveDescriptorFromUci(chess, uci) {
  if (!uci || uci === "(none)") {
    return null;
  }

  const clone = new Chess(chess.fen());
  const move = clone.move(uciToMoveObject(uci));
  if (!move) {
    return null;
  }

  return {
    san: move.san,
    givesCheck: clone.inCheck(),
    isCapture: move.san.includes("x"),
  };
}

function bandTopMoveGap(topMoveGapCp, category) {
  if (!Number.isFinite(topMoveGapCp)) {
    return "unknown";
  }

  if (category === "tactical_payoff" || category === "forcing") {
    if (topMoveGapCp <= 80) {
      return "comfortable";
    }

    if (topMoveGapCp <= 120) {
      return "acceptable";
    }

    if (topMoveGapCp <= 200) {
      return "narrow";
    }

    return "critical";
  }

  if (topMoveGapCp <= 40) {
    return "comfortable";
  }

  if (topMoveGapCp <= 80) {
    return "acceptable";
  }

  if (topMoveGapCp <= 150) {
    return "narrow";
  }

  return "critical";
}

function tacticalVolatilityBand(score) {
  if (score >= 4) {
    return "high";
  }

  if (score >= 2) {
    return "medium";
  }

  return "low";
}

function buildCompensationVisibility({
  currentEvalCp,
  materialEdgePawns,
  trainedDeveloped,
  opponentDeveloped,
  opponentKingSafety,
  trainedCastled,
  tacticalVolatility,
}) {
  if (materialEdgePawns >= 1) {
    return "clear";
  }

  const developmentLead = trainedDeveloped > opponentDeveloped;
  const opponentKingCompromised =
    opponentKingSafety === "exposed" || opponentKingSafety === "critical";
  const persistentInitiative =
    tacticalVolatility >= 2 && Number.isFinite(currentEvalCp) && currentEvalCp >= STOCKFISH_CP_CLEAR;

  if (
    Number.isFinite(currentEvalCp) &&
    currentEvalCp >= 180 &&
    [developmentLead || trainedCastled, opponentKingCompromised, persistentInitiative].filter(Boolean)
      .length >= 2
  ) {
    return "clear";
  }

  if (
    Number.isFinite(currentEvalCp) &&
    currentEvalCp >= STOCKFISH_CP_CLEAR &&
    (developmentLead || opponentKingCompromised || persistentInitiative)
  ) {
    return "partial";
  }

  return "none";
}

function buildKingSafetyState({
  chess,
  colorCode,
  opponentBestMoveDescriptor,
  recentSans,
}) {
  const inCheck = chess.turn() === colorCode && chess.inCheck();
  if (inCheck) {
    return "critical";
  }

  if (opponentBestMoveDescriptor?.givesCheck) {
    return "critical";
  }

  const castled = hasCastled(chess, colorCode);
  const recentChecks = recentSans.filter((san) => san.includes("+") || san.includes("#")).length;

  if (!castled && recentChecks > 0) {
    return "exposed";
  }

  if (!castled) {
    return "softly_exposed";
  }

  return "safe";
}

function inferPayoffSignals({
  currentEvalCp,
  materialEdgePawns,
  compensationVisibility,
  opponentKingSafety,
  tacticalVolatilityBandValue,
}) {
  return {
    clearMaterial: materialEdgePawns >= 1,
    strongMaterial: materialEdgePawns >= 2,
    clearEval: Number.isFinite(currentEvalCp) && currentEvalCp >= STOCKFISH_CP_CLEAR,
    strongEval: Number.isFinite(currentEvalCp) && currentEvalCp >= STOCKFISH_CP_STRONG,
    clearCompensation: compensationVisibility === "clear",
    partialCompensation: compensationVisibility === "partial",
    opponentKingExposed:
      opponentKingSafety === "exposed" || opponentKingSafety === "critical",
    tacticalCooling: tacticalVolatilityBandValue !== "high",
  };
}

function computeRawSignals({
  chess,
  openingColor,
  category,
  generatedSans,
  sourcePlies,
  analysis,
  explorer,
  evalHistory,
}) {
  const turnColor = chess.turn() === "w" ? "white" : "black";
  const trainedColorCode = openingColor === "white" ? "w" : "b";
  const opponentColorCode = openingColor === "white" ? "b" : "w";
  const bestLine = analysis.lines[0] ?? null;
  const secondLine = analysis.lines[1] ?? null;
  const currentEval = perspectiveEvalCp(bestLine?.score ?? null, turnColor, openingColor);
  const recentSans = generatedSans.slice(-4);
  const bestMoveDescriptor = moveDescriptorFromUci(chess, bestLine?.uci ?? null);
  const opponentBestMoveDescriptor = turnColor === openingColor ? null : bestMoveDescriptor;
  const trainedBestMoveDescriptor = turnColor === openingColor ? bestMoveDescriptor : null;

  const tacticalVolatilityScore =
    recentSans.filter((san) => /[x+#]/.test(san)).length +
    (bestMoveDescriptor?.givesCheck ? 1 : 0) +
    (bestMoveDescriptor?.isCapture ? 1 : 0) +
    (evalHistory.length >= 2 &&
    Math.abs(evalHistory[evalHistory.length - 1] - evalHistory[evalHistory.length - 2]) > 100
      ? 1
      : 0);

  const topMoveGapCp =
    bestLine && secondLine
      ? Math.abs(scoreToCp(bestLine.score) - scoreToCp(secondLine.score))
      : 0;
  const playableWindowCp =
    category === "tactical_payoff" || category === "forcing" ? 50 : 75;
  const playableMoveCount = analysis.lines.filter((line) => {
    if (!bestLine) {
      return false;
    }

    return Math.abs(scoreToCp(bestLine.score) - scoreToCp(line.score)) <= playableWindowCp;
  }).length;
  const gapBand = bandTopMoveGap(topMoveGapCp, category);
  const onlyMovePressure = playableMoveCount <= 1 || gapBand === "critical";
  const trainedDeveloped = countDevelopedMinorPieces(chess, trainedColorCode);
  const opponentDeveloped = countDevelopedMinorPieces(chess, opponentColorCode);
  const trainedCastled = hasCastled(chess, trainedColorCode);
  const materialEdgePawns = computeMaterialEdge(chess, openingColor);
  const trainedKingSafety = buildKingSafetyState({
    chess,
    colorCode: trainedColorCode,
    opponentBestMoveDescriptor,
    recentSans,
  });
  const opponentKingSafety = buildKingSafetyState({
    chess,
    colorCode: opponentColorCode,
    opponentBestMoveDescriptor: trainedBestMoveDescriptor,
    recentSans,
  });
  const compensationVisibility = buildCompensationVisibility({
    currentEvalCp: currentEval,
    materialEdgePawns,
    trainedDeveloped,
    opponentDeveloped,
    opponentKingSafety,
    trainedCastled,
    tacticalVolatility: tacticalVolatilityScore,
  });

  return {
    currentEvalCp: currentEval,
    evalStabilityCp: evalStabilityCp(evalHistory),
    topMoveGapCp,
    topMoveGapBand: gapBand,
    playableMoveCount,
    onlyMovePressure,
    tacticalVolatility: tacticalVolatilityScore,
    tacticalVolatilityBand: tacticalVolatilityBand(tacticalVolatilityScore),
    materialEdgePawns,
    developmentScore: trainedDeveloped + (trainedCastled ? 2 : 0),
    trainedDeveloped,
    opponentDeveloped,
    trainedCastled,
    trainedKingSafety,
    opponentKingSafety,
    compensationVisibility,
    nodeSampleGames: explorer.totalGamesAtNode,
    sourcePlies,
    totalPlies: generatedSans.length,
    addedPlies: Math.max(generatedSans.length - sourcePlies, 0),
    payoffSignals: inferPayoffSignals({
      currentEvalCp: currentEval,
      materialEdgePawns,
      compensationVisibility,
      opponentKingSafety,
      tacticalVolatilityBandValue: tacticalVolatilityBand(tacticalVolatilityScore),
    }),
  };
}

function coreSafetyPasses(signals, args) {
  const nodeConfidencePass =
    signals.nodeSampleGames >= args.minGamesAtNode ||
    signals.payoffSignals.strongMaterial ||
    signals.payoffSignals.clearCompensation ||
    (signals.payoffSignals.clearMaterial && signals.payoffSignals.clearEval);

  return (
    signals.tacticalVolatilityBand !== "high" &&
    !signals.onlyMovePressure &&
    signals.topMoveGapBand !== "critical" &&
    signals.topMoveGapBand !== "narrow" &&
    signals.evalStabilityCp <= 40 &&
    signals.trainedKingSafety !== "critical" &&
    nodeConfidencePass
  );
}

function categoryCompletion(signals, category) {
  if (category === "setup") {
    const pass =
      signals.developmentScore >= 4 &&
      (signals.trainedCastled || signals.totalPlies >= signals.sourcePlies + 2);

    return {
      pass,
      summary: pass
        ? "The intended setup and development pattern are visible."
        : "The setup still needs more development to feel complete.",
      primary: pass ? "setup_completion" : null,
      secondary: pass ? ["development"] : [],
    };
  }

  if (category === "strategic") {
    const planVisible =
      signals.currentEvalCp >= 40 ||
      signals.materialEdgePawns >= 1 ||
      signals.compensationVisibility !== "none" ||
      signals.trainedCastled;
    const pass = signals.developmentScore >= 3 && planVisible;

    return {
      pass,
      summary: pass
        ? "The line now shows the intended strategic plan, pressure, or structure."
        : "The strategic point is not visible enough yet.",
      primary: pass
        ? signals.materialEdgePawns >= 1
          ? "material"
          : signals.compensationVisibility !== "none"
            ? "pressure"
            : "structure"
        : null,
      secondary: pass ? ["development"] : [],
    };
  }

  if (category === "forcing") {
    const pass =
      signals.tacticalVolatilityBand !== "high" &&
      !signals.onlyMovePressure &&
      (signals.currentEvalCp >= 40 || signals.payoffSignals.clearMaterial);

    return {
      pass,
      summary: pass
        ? "The forcing sequence has resolved into an understandable resulting position."
        : "The forcing phase is still too narrow to stop.",
      primary: pass
        ? signals.payoffSignals.clearMaterial
          ? "material"
          : "initiative"
        : null,
      secondary: pass ? ["pressure"] : [],
    };
  }

  const pass =
    signals.payoffSignals.clearMaterial ||
    signals.payoffSignals.clearCompensation ||
    (signals.payoffSignals.opponentKingExposed && signals.payoffSignals.clearEval) ||
    signals.payoffSignals.strongEval;

  return {
    pass,
    summary: pass
      ? "The tactical payoff is visible and the consequence is understandable."
      : "The tactical payoff is not visible enough yet.",
    primary: pass
      ? signals.payoffSignals.clearMaterial
        ? "material"
        : signals.payoffSignals.clearCompensation
          ? "compensation"
          : "attack"
      : null,
    secondary: pass
      ? signals.payoffSignals.opponentKingExposed
        ? ["king_safety", "initiative"]
        : ["initiative"]
      : [],
  };
}

function endpointQualityScore(signals, category, completion) {
  let score = 0;

  if (coreSafetyPasses(signals, { minGamesAtNode: DEFAULT_MIN_GAMES_AT_NODE })) {
    score += 2;
  }

  if (completion.pass) {
    score += 2;
  }

  if (signals.trainedCastled) {
    score += 1;
  }

  if (signals.topMoveGapBand === "comfortable") {
    score += 1;
  }

  if (signals.materialEdgePawns >= 1) {
    score += 3;
  }

  if (signals.compensationVisibility === "clear") {
    score += 2;
  } else if (signals.compensationVisibility === "partial") {
    score += 1;
  }

  if (signals.opponentKingSafety === "critical") {
    score += 2;
  } else if (signals.opponentKingSafety === "exposed") {
    score += 1;
  }

  if (Number.isFinite(signals.currentEvalCp) && signals.currentEvalCp >= STOCKFISH_CP_STRONG) {
    score += 2;
  } else if (Number.isFinite(signals.currentEvalCp) && signals.currentEvalCp >= STOCKFISH_CP_CLEAR) {
    score += 1;
  }

  if (category === "setup" && signals.developmentScore >= 6) {
    score += 1;
  }

  return score;
}

function meaningfulUpgrade(currentSignals, candidateSignals, category, currentCompletion, candidateCompletion) {
  const currentScore = endpointQualityScore(currentSignals, category, currentCompletion);
  const candidateScore = endpointQualityScore(candidateSignals, category, candidateCompletion);

  if (candidateScore >= currentScore + 2) {
    return true;
  }

  if (
    (category === "setup" || category === "strategic") &&
    !currentSignals.trainedCastled &&
    candidateSignals.trainedCastled
  ) {
    return true;
  }

  if (candidateSignals.materialEdgePawns >= currentSignals.materialEdgePawns + 1) {
    return true;
  }

  const compensationRank = { none: 0, partial: 1, clear: 2 };
  if (
    compensationRank[candidateSignals.compensationVisibility] >
    compensationRank[currentSignals.compensationVisibility]
  ) {
    return true;
  }

  const gapRank = { critical: 0, narrow: 1, acceptable: 2, comfortable: 3, unknown: 0 };
  if (gapRank[candidateSignals.topMoveGapBand] > gapRank[currentSignals.topMoveGapBand]) {
    return true;
  }

  if (!currentCompletion.pass && candidateCompletion.pass) {
    return true;
  }

  return false;
}

async function analyzeFen({ fen, depth, multipvCount, engineFlavor }) {
  return new Promise((resolve, reject) => {
    const engine = createStockfishEngine({ flavor: engineFlavor });
    const latestInfos = new Map();

    const cleanup = () => {
      try {
        engine.quit();
      } catch (_error) {
        // ignore teardown errors
      }
    };

    try {
      engine.send("uci", () => {
        engine.send("setoption name MultiPV value " + multipvCount);
        engine.send("isready", () => {
          engine.send("ucinewgame");
          engine.send(`position fen ${fen}`);
          engine.send(
            `go depth ${depth}`,
            (bestmoveLine) => {
              const bestmoveMatch = bestmoveLine.match(
                /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/
              );
              const turnColor = fen.split(" ")[1] === "w" ? "white" : "black";
              const lines = Array.from(latestInfos.values())
                .sort((left, right) => (left.multipv ?? 1) - (right.multipv ?? 1))
                .map((info) => ({
                  multipv: info.multipv ?? 1,
                  depth: info.depth ?? null,
                  score: info.score ?? null,
                  pv: info.pv ?? [],
                  uci: info.pv?.[0] ?? null,
                  nodes: info.nodes ?? null,
                  nps: info.nps ?? null,
                }));

              cleanup();
              resolve({
                fen,
                turnColor,
                depth,
                engineFlavor,
                bestMove: bestmoveMatch ? bestmoveMatch[1] : null,
                ponder: bestmoveMatch ? bestmoveMatch[2] ?? null : null,
                lines,
              });
            },
            (line) => {
              const info = parseInfoLine(line);
              if (!info || !info.score) {
                return;
              }

              const key = info.multipv ?? 1;
              const current = latestInfos.get(key);
              if (!current || (info.depth ?? 0) >= (current.depth ?? 0)) {
                latestInfos.set(key, info);
              }
            }
          );
        });
      });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function fetchExplorerNode(fen, args, cache) {
  if (cache.has(fen)) {
    return cache.get(fen);
  }

  const explorer = await fetchLichessExplorer(fen, {
    moves: 12,
    delayMs: args.delayMs,
  });

  const topMoves = (explorer.moves ?? [])
    .map((move) => ({
      ...move,
      totalGames: totalGames(move),
    }))
    .sort((left, right) => right.totalGames - left.totalGames);

  const result = {
    opening: explorer.opening ?? null,
    totalGamesAtNode: topMoves.reduce((sum, move) => sum + (move.totalGames ?? 0), 0),
    topMoves,
  };

  cache.set(fen, result);
  return result;
}

async function analyzePosition(fen, args, cache) {
  const key = `${fen}::${args.stockfishDepth}::${args.stockfishEngine}::${args.multipvCount}`;
  if (cache.has(key)) {
    return cache.get(key);
  }

  const result = await analyzeFen({
    fen,
    depth: args.stockfishDepth,
    multipvCount: args.multipvCount,
    engineFlavor: args.stockfishEngine,
  });

  cache.set(key, result);
  return result;
}

async function chooseContinuationMove({
  chess,
  openingColor,
  analysis,
  explorer,
  args,
}) {
  const sideToMove = chess.turn() === "w" ? "white" : "black";
  const isTrainedSideTurn = sideToMove === openingColor;

  if (isTrainedSideTurn) {
    if (!analysis.bestMove || analysis.bestMove === "(none)") {
      return null;
    }

    return {
      side: "trained",
      source: "stockfish-best-move",
      uci: analysis.bestMove,
      popularityRatio: null,
      popularityGames: null,
      nodeGames: explorer.totalGamesAtNode,
    };
  }

  if (!explorer.topMoves.length) {
    return null;
  }

  if (explorer.totalGamesAtNode < args.minGamesAtNode) {
    return {
      stopBecauseThinSample: true,
      nodeGames: explorer.totalGamesAtNode,
    };
  }

  const move = explorer.topMoves[0];

  return {
    side: "opponent",
    source: "lichess-most-popular",
    uci: move.uci,
    popularityRatio:
      explorer.totalGamesAtNode > 0
        ? Number((move.totalGames / explorer.totalGamesAtNode).toFixed(4))
        : null,
    popularityGames: move.totalGames,
    nodeGames: explorer.totalGamesAtNode,
  };
}

function stopPayload(reason, summary, primary, secondary, signals) {
  return {
    stop: true,
    reason,
    finalPositionSummary: summary,
    advantageTypePrimary: primary,
    advantageTypeSecondary: secondary,
    signals,
  };
}

function continuePayload(reason, signals) {
  return {
    stop: false,
    reason,
    finalPositionSummary: null,
    advantageTypePrimary: null,
    advantageTypeSecondary: [],
    signals,
  };
}

async function shouldExtendForShortHorizon({
  chess,
  openingColor,
  category,
  args,
  currentSignals,
  currentCompletion,
  generatedSans,
  sourcePlies,
  evalHistory,
  analysisCache,
  explorerCache,
}) {
  const limit = Math.min(args.shortHorizonPlies, args.shortHorizonMaxPlies);
  const simChess = new Chess(chess.fen());
  const simSans = [...generatedSans];
  const simHistory = [...evalHistory];
  let latestSignals = currentSignals;
  let latestCompletion = currentCompletion;

  for (let ply = 1; ply <= limit; ply += 1) {
    if (simSans.length >= args.maxTotalPlies) {
      break;
    }

    const analysis = await analyzePosition(simChess.fen(), args, analysisCache);
    const explorer = await fetchExplorerNode(simChess.fen(), args, explorerCache);
    const continuation = await chooseContinuationMove({
      chess: simChess,
      openingColor,
      analysis,
      explorer,
      args,
    });

    if (!continuation || continuation.stopBecauseThinSample) {
      break;
    }

    const applied = simChess.move(uciToMoveObject(continuation.uci));
    if (!applied) {
      break;
    }

    simSans.push(applied.san);
    const nextAnalysis = await analyzePosition(simChess.fen(), args, analysisCache);
    const nextExplorer = await fetchExplorerNode(simChess.fen(), args, explorerCache);
    const nextEval = perspectiveEvalCp(
      nextAnalysis.lines[0]?.score ?? null,
      nextAnalysis.turnColor,
      openingColor
    );
    if (Number.isFinite(nextEval)) {
      simHistory.push(nextEval);
    }

    const candidateSignals = computeRawSignals({
      chess: simChess,
      openingColor,
      category,
      generatedSans: simSans,
      sourcePlies,
      analysis: nextAnalysis,
      explorer: nextExplorer,
      evalHistory: simHistory,
    });
    const candidateCompletion = categoryCompletion(candidateSignals, category);

    if (
      coreSafetyPasses(candidateSignals, args) &&
      candidateCompletion.pass &&
      meaningfulUpgrade(
        latestSignals,
        candidateSignals,
        category,
        latestCompletion,
        candidateCompletion
      )
    ) {
      return true;
    }

    latestSignals = candidateSignals;
    latestCompletion = candidateCompletion;
  }

  return false;
}

async function evaluateStop({
  chess,
  openingColor,
  category,
  args,
  generatedSans,
  sourcePlies,
  evalHistory,
  analysis,
  explorer,
  analysisCache,
  explorerCache,
}) {
  const signals = computeRawSignals({
    chess,
    openingColor,
    category,
    generatedSans,
    sourcePlies,
    analysis,
    explorer,
    evalHistory,
  });

  const corePass = coreSafetyPasses(signals, args);
  const completion = categoryCompletion(signals, category);

  if (!corePass) {
    if (
      signals.nodeSampleGames < args.minGamesAtNode &&
      signals.addedPlies > 0
    ) {
      return stopPayload(
        "Stopped because the Lichess node sample became too thin to trust further continuation.",
        "This line is ending as a reference continuation because the practical continuation sample is now too small.",
        "reference",
        [],
        signals
      );
    }

    return continuePayload("Core safety is not satisfied yet.", signals);
  }

  if (!completion.pass) {
    return continuePayload("The line has not completed its teaching goal yet.", signals);
  }

  const shouldUpgrade = await shouldExtendForShortHorizon({
    chess,
    openingColor,
    category,
    args,
    currentSignals: signals,
    currentCompletion: completion,
    generatedSans,
    sourcePlies,
    evalHistory,
    analysisCache,
    explorerCache,
  });

  if (shouldUpgrade) {
    return continuePayload(
      "A clearly better endpoint is reachable within the short-horizon continuation window.",
      signals
    );
  }

  return stopPayload(
    "Stopped at the earliest position where the instructional payoff was visible without unnecessary continuation.",
    completion.summary,
    completion.primary,
    completion.secondary,
    signals
  );
}

async function extendMainVariationLine(entry, args, caches) {
  const chess = new Chess();
  for (const san of entry.sans) {
    chess.move(san);
  }

  const sourcePlies = entry.sans.length;
  const generatedSans = [...entry.sans];
  const variationAnchorFen = chess.fen();
  const continuationSteps = [];
  const openingColor = inferOpeningColor(entry.family);
  const category = inferPrimaryCategory(entry);
  const evalHistory = [];
  let finalStop = {
    reason: "Reached the variation anchor only; no continuation was needed.",
    finalPositionSummary: null,
    advantageTypePrimary: null,
    advantageTypeSecondary: [],
    signals: null,
  };

  if (isSourceMainLineEntry(entry)) {
    const finalAnalysis = await analyzePosition(chess.fen(), args, caches.analysis);

    return {
      openingColor,
      primaryCategory: category,
      sourcePlies,
      variationAnchorFen,
      generatedSans,
      continuationSans: [],
      stopReason:
        "Stored as the source main-line reference; practical continuation is generated from the parent named variation node.",
      finalPositionSummary:
        "This line preserves the naming-source main line as reference theory.",
      advantageTypePrimary: "reference",
      advantageTypeSecondary: [],
      stopSignals: null,
      extension: [],
      finalFen: chess.fen(),
      stockfish: finalAnalysis,
      sourceReferenceOnly: true,
    };
  }

  for (let addedPlies = 0; addedPlies <= args.maxAddedPlies; addedPlies += 1) {
    if (generatedSans.length >= args.maxTotalPlies) {
      finalStop = {
        reason: "Stopped at the current total-ply safety cap.",
        finalPositionSummary: "The line hit the current total-length cap before a cleaner stopping point appeared.",
        advantageTypePrimary: "reference",
        advantageTypeSecondary: [],
        signals: finalStop.signals,
      };
      break;
    }

    const analysis = await analyzePosition(chess.fen(), args, caches.analysis);
    const explorer = await fetchExplorerNode(chess.fen(), args, caches.explorer);
    const currentEval = perspectiveEvalCp(
      analysis.lines[0]?.score ?? null,
      analysis.turnColor,
      openingColor
    );
    if (Number.isFinite(currentEval)) {
      evalHistory.push(currentEval);
    }

    const stopState = await evaluateStop({
      chess,
      openingColor,
      category,
      args,
      generatedSans,
      sourcePlies,
      evalHistory,
      analysis,
      explorer,
      analysisCache: caches.analysis,
      explorerCache: caches.explorer,
    });

    if (stopState.stop) {
      finalStop = stopState;
      break;
    }

    if (addedPlies === args.maxAddedPlies) {
      finalStop = {
        reason: "Stopped at the current added-ply cap for the generated continuation.",
        finalPositionSummary: "The line hit the current continuation cap before a cleaner endpoint appeared.",
        advantageTypePrimary: "reference",
        advantageTypeSecondary: [],
        signals: stopState.signals,
      };
      break;
    }

    const continuation = await chooseContinuationMove({
      chess,
      openingColor,
      analysis,
      explorer,
      args,
    });

    if (!continuation) {
      finalStop = {
        reason: "No valid continuation move was available from the current position.",
        finalPositionSummary: "The generator could not continue the line from this position.",
        advantageTypePrimary: "reference",
        advantageTypeSecondary: [],
        signals: stopState.signals,
      };
      break;
    }

    if (continuation.stopBecauseThinSample) {
      finalStop = {
        reason: "Stopped because the Lichess node sample is too thin to trust further continuation.",
        finalPositionSummary: "The line is ending as a reference continuation because the practical continuation sample is too small.",
        advantageTypePrimary: "reference",
        advantageTypeSecondary: [],
        signals: stopState.signals,
      };
      break;
    }

    const applied = chess.move(uciToMoveObject(continuation.uci));
    if (!applied) {
      finalStop = {
        reason: `Generated continuation move was illegal (${continuation.uci}).`,
        finalPositionSummary: "The generator stopped because the selected continuation was illegal.",
        advantageTypePrimary: "reference",
        advantageTypeSecondary: [],
        signals: stopState.signals,
      };
      break;
    }

    generatedSans.push(applied.san);
    continuationSteps.push({
      ply: generatedSans.length,
      san: applied.san,
      uci: continuation.uci,
      side: continuation.side,
      source: continuation.source,
      popularityRatio: continuation.popularityRatio,
      popularityGames: continuation.popularityGames,
      nodeGames: continuation.nodeGames,
    });
  }

  const finalAnalysis = await analyzePosition(chess.fen(), args, caches.analysis);

  return {
    openingColor,
    primaryCategory: category,
    sourcePlies,
    variationAnchorFen,
    generatedSans,
    continuationSans: generatedSans.slice(sourcePlies),
    stopReason: finalStop.reason,
    finalPositionSummary: finalStop.finalPositionSummary,
    advantageTypePrimary: finalStop.advantageTypePrimary,
    advantageTypeSecondary: finalStop.advantageTypeSecondary,
    stopSignals: finalStop.signals,
    extension: continuationSteps,
    finalFen: chess.fen(),
    stockfish: finalAnalysis,
  };
}

function buildCandidateRecord(entry, generated) {
  const ids = buildOpeningIds(entry);
  const mainLine = inferMainLineStatus(entry);
  const variationPath = splitVariationSegments(entry);
  const sourceMainLine = isSourceMainLineEntry(entry);
  const difficulty = buildLineDifficulty({
    category: generated.primaryCategory,
    generatedSans: generated.generatedSans,
    addedPlies: Math.max(generated.generatedSans.length - generated.sourcePlies, 0),
  });

  return {
    openingId: ids.openingId,
    variationId: ids.variationId,
    lineId: ids.lineId,
    openingName: entry.family,
    lineName: entry.variation || entry.family,
    fullName: entry.name,
    lineDisplayName: entry.name,
    lineType: sourceMainLine ? "main_line_reference" : "main_variation_line",
    variationName: entry.variation || entry.family,
    variationDepth: variationPath.length - 1,
      variationPath,
      variationAnchorPgn: entry.pgn,
      variationAnchorFen: generated.variationAnchorFen,
      variationAnchorSans: entry.sans,
      continuationPgn: sansToPgn(generated.continuationSans, entry.sans),
      fullLinePgn: sansToPgn(generated.generatedSans),
      sourceSans: entry.sans,
      continuationSans: generated.continuationSans,
      generatedSans: generated.generatedSans,
    ecoCode: entry.eco,
    primaryCategory: generated.primaryCategory,
    openingColor: generated.openingColor,
    isMainVariationLine: !sourceMainLine,
    isTeachingLine: !sourceMainLine && generated.continuationSans.length > 0,
    isCustomVariation: false,
    transposesToVariationId: null,
    branchDepth: 0,
    parentLineId: null,
    lessonStemPly: null,
    lessonStemFen: null,
    triggerMoveSan: null,
    triggerMovePopularity: null,
    gamesAtNode: generated.stopSignals?.nodeSampleGames ?? null,
    gamesForMove: null,
    evalBeforeTrigger: null,
    evalAfterTrigger: null,
    evalGain: null,
    inclusionOutcome: "include-authoritative",
    sourceType: "hybrid",
    sourceName: "lichess-org/chess-openings + Lichess Explorer + Stockfish",
    sourceConfidence: "medium",
    stopReason: generated.stopReason,
    finalFen: generated.finalFen,
    finalEvalCp: perspectiveEvalCp(
      generated.stockfish.lines[0]?.score ?? null,
      generated.stockfish.turnColor,
      generated.openingColor
    ),
    finalEvalPerspective: generated.openingColor,
    finalPositionSummary: generated.finalPositionSummary,
    advantageTypePrimary: generated.advantageTypePrimary,
    advantageTypeSecondary: generated.advantageTypeSecondary,
    engineChecked: true,
    isMainLine: mainLine.isMainLine,
    mainLineConfidence: mainLine.mainLineConfidence,
    mainLineSource: mainLine.mainLineSource,
    lineDifficulty: difficulty.lineDifficulty,
    lineDifficultyConfidence: difficulty.lineDifficultyConfidence,
    lineDifficultySource: difficulty.lineDifficultySource,
    popularitySource: "lichess-explorer",
    popularityScore: null,
    popularityGames: null,
    popularityRankWithinOpening: null,
    generation: {
      sourcePlies: generated.sourcePlies,
      addedPlies: Math.max(generated.generatedSans.length - generated.sourcePlies, 0),
      sourceReferenceOnly: generated.sourceReferenceOnly ?? false,
      extension: generated.extension,
      stopSignals: generated.stopSignals,
    },
    stockfish: generated.stockfish,
  };
}

function collapseDuplicateLines(results) {
  const grouped = new Map();

  for (const result of results) {
    const key = result.fullLinePgn;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(result);
  }

  const deduped = [];

  for (const candidates of grouped.values()) {
    candidates.sort((left, right) => {
      if (left.variationDepth !== right.variationDepth) {
        return right.variationDepth - left.variationDepth;
      }

      return (right.variationAnchorSans?.length ?? 0) - (left.variationAnchorSans?.length ?? 0);
    });

    deduped.push(candidates[0]);
  }

  return deduped.sort((left, right) => {
    const ecoCompare = left.ecoCode.localeCompare(right.ecoCode);
    if (ecoCompare !== 0) {
      return ecoCompare;
    }

    return left.fullName.localeCompare(right.fullName);
  });
}

function compareLinesForDisplay(left, right) {
  if (left.isMainLine !== right.isMainLine) {
    return left.isMainLine ? -1 : 1;
  }

  const confidenceRank = { authoritative: 3, provisional: 2, none: 1 };
  const confidenceDiff =
    (confidenceRank[right.mainLineConfidence] ?? 0) -
    (confidenceRank[left.mainLineConfidence] ?? 0);
  if (confidenceDiff !== 0) {
    return confidenceDiff;
  }

  const difficultyDiff =
    difficultyRank(left.lineDifficulty) - difficultyRank(right.lineDifficulty);
  if (difficultyDiff !== 0) {
    return difficultyDiff;
  }

  return left.lineName.localeCompare(right.lineName);
}

function groupOpenings(results) {
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

  return Array.from(grouped.values())
    .map((opening) => {
      const lines = [...opening.lines].sort(compareLinesForDisplay).map((line, index) => ({
        ...line,
        popularityRankWithinOpening: index + 1,
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
}

function loadResumeState(outputPath) {
  if (!fs.existsSync(outputPath)) {
    return {
      processed: new Set(),
      results: [],
    };
  }

  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const results = Array.isArray(payload.results) ? payload.results : [];

  return {
    processed: new Set(results.map((entry) => entry.fullName)),
    results,
  };
}

function writePayload({
  output,
  args,
  results,
  totalEntries,
  status,
}) {
  const dedupedResults = collapseDuplicateLines(results);
  const openings = groupOpenings(dedupedResults);
  const payload = {
    generatedAt: new Date().toISOString(),
    status,
    source: {
      naming: "lichess-org/chess-openings",
      opponentModel: "Lichess Explorer",
      trainedSideModel: "Stockfish",
    },
    config: {
      limit: args.limit,
      offset: args.offset,
      ecoVolume: args.ecoVolume,
      startsWith: args.startsWith,
      delayMs: args.delayMs,
      minGamesAtNode: args.minGamesAtNode,
      maxAddedPlies: args.maxAddedPlies,
      maxTotalPlies: args.maxTotalPlies,
      stockfishDepth: args.stockfishDepth,
      stockfishEngine: args.stockfishEngine,
      checkpointEvery: args.checkpointEvery,
      multipvCount: args.multipvCount,
      shortHorizonPlies: args.shortHorizonPlies,
      shortHorizonMaxPlies: args.shortHorizonMaxPlies,
    },
    count: dedupedResults.length,
    totalEntries,
    progressPercent:
      totalEntries > 0
        ? Number(((dedupedResults.length / totalEntries) * 100).toFixed(2))
        : 0,
    openingCount: openings.length,
    openings,
    results: dedupedResults,
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceEntries = filterEntries(await fetchChessOpeningsDataset(), args);

  if (!sourceEntries.length) {
    throw new Error("No source entries matched the provided filters.");
  }

  const resumeState = args.resume
    ? loadResumeState(args.output)
    : { processed: new Set(), results: [] };
  const results = [...resumeState.results];
  const totalEntries = sourceEntries.length;
  const caches = {
    analysis: new Map(),
    explorer: new Map(),
  };

  if (resumeState.results.length > 0) {
    console.log(
      `Resuming from ${resumeState.results.length} saved candidates (${formatPercent(
        (resumeState.results.length / totalEntries) * 100
      )}).`
    );
  }

  let processedCount = resumeState.results.length;

  for (const entry of sourceEntries) {
    if (resumeState.processed.has(entry.name)) {
      continue;
    }

    const generated = await extendMainVariationLine(entry, args, caches);
    const record = buildCandidateRecord(entry, generated);
    results.push(record);
    resumeState.processed.add(entry.name);
    processedCount += 1;

    const percent = totalEntries > 0 ? (processedCount / totalEntries) * 100 : 100;
    console.log(
      `[${processedCount}/${totalEntries}] ${formatPercent(percent)} - ${record.fullName}`
    );

    if (
      Number.isFinite(args.checkpointEvery) &&
      args.checkpointEvery > 0 &&
      processedCount % args.checkpointEvery === 0
    ) {
      writePayload({
        output: args.output,
        args,
        results,
        totalEntries,
        status: "partial",
      });
      console.log(`Checkpoint saved at ${formatPercent(percent)}.`);
    }
  }

  const payload = writePayload({
    output: args.output,
    args,
    results,
    totalEntries,
    status: "complete",
  });

  console.log(`Wrote generated opening candidates to ${args.output}`);
  console.log(
    JSON.stringify(
      {
        count: payload.count,
        totalEntries,
        progressPercent: payload.progressPercent,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
