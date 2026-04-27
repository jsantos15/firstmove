#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const {
  fetchChessOpeningsDataset,
} = require("./lib/chess-openings-source.cjs");
const {
  fetchLichessExplorer,
  totalGames,
} = require("./lib/lichess-explorer.cjs");
const {
  createStockfishEngine,
  parseInfoLine,
} = require("./lib/stockfish.cjs");
const {
  buildOpeningIds,
  deriveOpeningDifficulty,
  difficultyRank,
  inferLineDifficulty,
  inferMainLineStatus,
  inferPrimaryCategory,
} = require("./lib/opening-framework.cjs");

const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-candidates.json"
);

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    limit: null,
    offset: 0,
    ecoVolume: null,
    startsWith: null,
    delayMs: 800,
    maxLinesPerOpening: null,
    maxAddedPlies: 20,
    maxTotalPlies: 40,
    stockfishDepth: 10,
    stockfishEngine: "lite-single",
    checkpointEvery: 10,
    resume: false,
    minGamesAtNode: 500,
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

    if (token === "--max-lines-per-opening") {
      args.maxLinesPerOpening = Number(argv[index + 1]);
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

    if (token === "--resume") {
      args.resume = true;
      continue;
    }
  }

  return args;
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
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

  if (Number.isFinite(args.maxLinesPerOpening) && args.maxLinesPerOpening > 0) {
    filtered = limitPerOpening(filtered, args.maxLinesPerOpening);
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

function limitPerOpening(entries, maxLinesPerOpening) {
  const counts = new Map();
  const limited = [];

  for (const entry of entries) {
    const openingKey = entry.family || entry.name;
    const currentCount = counts.get(openingKey) ?? 0;

    if (currentCount >= maxLinesPerOpening) {
      continue;
    }

    limited.push(entry);
    counts.set(openingKey, currentCount + 1);
  }

  return limited;
}

function inferOpeningColor(openingName) {
  const text = String(openingName ?? "").toLowerCase();

  if (
    /\b(defense|defence|countergambit|counterattack|accepted|declined)\b/u.test(
      text
    )
  ) {
    return "black";
  }

  return "white";
}

function computePerspectiveMaterial(chess, openingColor) {
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

function countDevelopedMinorPieces(chess, color) {
  const startingSquares =
    color === "w"
      ? new Set(["b1", "g1", "c1", "f1"])
      : new Set(["b8", "g8", "c8", "f8"]);

  let developed = 0;
  const board = chess.board();

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank][file];
      if (!piece || piece.color !== color) {
        continue;
      }

      if (piece.type !== "n" && piece.type !== "b") {
        continue;
      }

      const square = String.fromCharCode(97 + file) + (8 - rank);
      if (!startingSquares.has(square)) {
        developed += 1;
      }
    }
  }

  return developed;
}

function hasCastled(chess, color) {
  const king =
    color === "w" ? chess.get("g1") || chess.get("c1") : chess.get("g8") || chess.get("c8");
  return king?.type === "k" && king?.color === color;
}

function isTacticalSan(san) {
  return /[x+#]/.test(san);
}

function uciToMoveObject(uci) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.slice(4) || undefined,
  };
}

function perspectiveEvalFromInfo(info, openingColor) {
  if (!info?.score) {
    return null;
  }

  const sideToMove = info.turn === "white" ? "white" : "black";
  const sign = sideToMove === openingColor ? 1 : -1;

  if (info.score.type === "cp") {
    return sign * info.score.value;
  }

  if (info.score.type === "mate") {
    return sign * info.score.value * 10_000;
  }

  return null;
}

function analyzeFen({ fen, depth, engineFlavor }) {
  return new Promise((resolve, reject) => {
    const engine = createStockfishEngine({ flavor: engineFlavor });
    let latestInfo = null;

    const cleanup = () => {
      try {
        engine.quit();
      } catch (_error) {
        // ignore teardown errors
      }
    };

    try {
      engine.send("uci", () => {
        engine.send("isready", () => {
          engine.send("ucinewgame");
          engine.send(`position fen ${fen}`);
          engine.send(
            `go depth ${depth}`,
            (bestmoveLine) => {
              const bestmoveMatch = bestmoveLine.match(
                /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/
              );

              cleanup();
              resolve({
                fen,
                turn: fen.split(" ")[1] === "w" ? "white" : "black",
                depth,
                engineFlavor,
                bestMove: bestmoveMatch ? bestmoveMatch[1] : null,
                ponder: bestmoveMatch ? bestmoveMatch[2] ?? null : null,
                evaluation: latestInfo
                  ? {
                      perspective: "side-to-move",
                      depth: latestInfo.depth,
                      seldepth: latestInfo.seldepth,
                      score: latestInfo.score,
                      nodes: latestInfo.nodes,
                      nps: latestInfo.nps,
                      pv: latestInfo.pv,
                    }
                  : null,
              });
            },
            (line) => {
              const info = parseInfoLine(line);
              if (!info || info.multipv !== 1 || !info.score) {
                return;
              }

              if (!latestInfo || (info.depth ?? 0) >= (latestInfo.depth ?? 0)) {
                latestInfo = info;
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

async function selectMostPopularOpponentMove(fen, args) {
  const explorer = await fetchLichessExplorer(fen, {
    moves: 12,
    delayMs: args.delayMs,
  });

  const rankedMoves = (explorer.moves ?? [])
    .map((move) => ({
      ...move,
      totalGames: totalGames(move),
    }))
    .sort((left, right) => right.totalGames - left.totalGames);

  return {
    move: rankedMoves[0] ?? null,
    totalGamesAtNode: rankedMoves.reduce(
      (sum, move) => sum + (move.totalGames ?? 0),
      0
    ),
    topMoves: rankedMoves,
    opening: explorer.opening ?? null,
  };
}

function shouldStopMainLine({
  category,
  chess,
  generatedSans,
  sourcePlies,
  addedPlies,
  openingColor,
  currentEvalCp,
}) {
  if (addedPlies <= 0) {
    return {
      stop: false,
      reason: "Reached the variation anchor only so far.",
      finalPositionSummary: null,
      advantageTypePrimary: null,
      advantageTypeSecondary: [],
    };
  }

  const lastFour = generatedSans.slice(-4);
  const lastTwo = generatedSans.slice(-2);
  const quietTail = lastTwo.length === 2 && lastTwo.every((move) => !isTacticalSan(move));
  const tacticalTailCount = lastFour.filter(isTacticalSan).length;
  const materialEdge = computePerspectiveMaterial(chess, openingColor);
  const trainedColorCode = openingColor === "white" ? "w" : "b";
  const opponentColorCode = openingColor === "white" ? "b" : "w";
  const trainedDeveloped = countDevelopedMinorPieces(chess, trainedColorCode);
  const opponentDeveloped = countDevelopedMinorPieces(chess, opponentColorCode);
  const trainedCastled = hasCastled(chess, trainedColorCode);
  const opponentCastled = hasCastled(chess, opponentColorCode);
  const fullmoveCount = generatedSans.length;
  const setupVisible =
    trainedDeveloped >= 2 &&
    opponentDeveloped >= 2 &&
    (trainedCastled || opponentCastled || fullmoveCount >= sourcePlies + 4);
  const smallEvalEdge = Number.isFinite(currentEvalCp) && currentEvalCp >= 40;
  const clearEvalEdge = Number.isFinite(currentEvalCp) && currentEvalCp >= 120;
  const bigEvalEdge = Number.isFinite(currentEvalCp) && currentEvalCp >= 220;
  const smallMaterialEdge = materialEdge >= 1;
  const bigMaterialEdge = materialEdge >= 2;
  const tacticalPhaseOccurred = tacticalTailCount >= 2;
  const tacticalPayoffVisible =
    (bigMaterialEdge || bigEvalEdge || (clearEvalEdge && tacticalPhaseOccurred)) &&
    (quietTail || tacticalPhaseOccurred);
  const strategicPayoffVisible =
    setupVisible &&
    quietTail &&
    (smallEvalEdge || smallMaterialEdge || trainedCastled || fullmoveCount >= sourcePlies + 6);
  const equalizedDefenseVisible =
    quietTail &&
    setupVisible &&
    Number.isFinite(currentEvalCp) &&
    currentEvalCp >= -40 &&
    currentEvalCp <= 60;

  function stop(reason, summary, primary, secondary = []) {
    return {
      stop: true,
      reason,
      finalPositionSummary: summary,
      advantageTypePrimary: primary,
      advantageTypeSecondary: secondary,
    };
  }

  function continueLine(reason) {
    return {
      stop: false,
      reason,
      finalPositionSummary: null,
      advantageTypePrimary: null,
      advantageTypeSecondary: [],
    };
  }

  if (category === "setup") {
    if (strategicPayoffVisible || equalizedDefenseVisible) {
      return stop(
        "Stopped once the target setup was complete and the learner could see the resulting structure or safe position.",
        trainedCastled
          ? "The intended setup is complete and the trained side has reached a stable playable position."
          : "The intended setup and piece placement are visible enough to hand the learner off to normal play.",
        trainedCastled ? "setup_completion" : "development",
        equalizedDefenseVisible ? ["equalization", "defensive_setup"] : ["structure"]
      );
    }

    return continueLine("The setup is not visible enough yet.");
  }

  if (category === "strategic") {
    if (strategicPayoffVisible) {
      return stop(
        "Stopped once the strategic setup and resulting pressure or structure were visible.",
        clearEvalEdge
          ? "The line now shows a real strategic edge for the trained side."
          : "The line now shows the intended strategic setup, pressure, or structural goal.",
        clearEvalEdge ? "pressure" : "structure",
        trainedCastled ? ["development"] : []
      );
    }

    if (equalizedDefenseVisible) {
      return stop(
        "Stopped once the defensive setup had solved the opening problems and the next moves became normal strategic play.",
        "The line now shows a healthy defensive structure or practical equalization.",
        "defensive_setup",
        ["equalization", "structure"]
      );
    }

    return continueLine("The strategic payoff is not visible enough yet.");
  }

  if (category === "trap" || category === "punishment" || category === "forcing") {
    if (tacticalPayoffVisible) {
      return stop(
        "Stopped once the tactical punishment had resolved into a visible payoff.",
        bigMaterialEdge
          ? "The punishment has converted into visible material gain."
          : "The punishment has produced a clearly favorable tactical outcome.",
        bigMaterialEdge ? "material" : "initiative",
        clearEvalEdge ? ["attack"] : []
      );
    }

    return continueLine("The punishment or forcing sequence has not resolved enough yet.");
  }

  if (category === "gambit") {
    const compensationVisible =
      quietTail &&
      (bigMaterialEdge ||
        clearEvalEdge ||
        (trainedCastled && (smallEvalEdge || setupVisible)) ||
        (tacticalPhaseOccurred && (smallEvalEdge || smallMaterialEdge)));

    if (compensationVisible) {
      return stop(
        "Stopped once the gambit compensation or resulting edge was visible.",
        bigMaterialEdge
          ? "The gambit has recovered or over-converted material."
          : "The gambit now shows concrete compensation through initiative, attack, or development.",
        bigMaterialEdge ? "material" : "compensation",
        trainedCastled ? ["development"] : tacticalPhaseOccurred ? ["attack"] : ["initiative"]
      );
    }

    return continueLine("The gambit compensation is not visible enough yet.");
  }

  if (quietTail && (clearEvalEdge || strategicPayoffVisible || bigMaterialEdge || equalizedDefenseVisible)) {
    return stop(
      "Stopped once the line payoff was visible and the next moves looked like normal chess.",
      bigMaterialEdge
        ? "The resulting position gives the trained side a visible material edge."
        : clearEvalEdge
          ? "The resulting position gives the trained side a visible practical edge."
          : "The resulting position completes the opening's instructional goal.",
      bigMaterialEdge ? "material" : clearEvalEdge ? "initiative" : "setup_completion",
      strategicPayoffVisible ? ["structure"] : equalizedDefenseVisible ? ["equalization"] : []
    );
  }

  return continueLine("The line still needs more moves before the payoff is visible.");
}

async function extendMainVariationLine(sourceEntry, args) {
  const chess = new Chess();
  for (const san of sourceEntry.sans) {
    chess.move(san);
  }

  const openingColor = inferOpeningColor(sourceEntry.family || sourceEntry.name);
  const primaryCategory = inferPrimaryCategory(sourceEntry);
  const sourcePlies = sourceEntry.sans.length;
  const generatedSans = [...sourceEntry.sans];
  const extension = [];
  let stopReason = "Reached the variation anchor only; no continuation was needed.";
  let hitCap = false;
  let latestPerspectiveEval = null;
  let finalPositionSummary = null;
  let advantageTypePrimary = null;
  let advantageTypeSecondary = [];

  for (let addedPlies = 0; addedPlies < args.maxAddedPlies; addedPlies += 1) {
    if (generatedSans.length >= args.maxTotalPlies) {
      stopReason = "Stopped at the current safety cap for generated line length.";
      break;
    }

    const currentAnalysis = await analyzeFen({
      fen: chess.fen(),
      depth: args.stockfishDepth,
      engineFlavor: args.stockfishEngine,
    });
    latestPerspectiveEval = perspectiveEvalFromInfo(
      currentAnalysis,
      openingColor
    );

    const decision = shouldStopMainLine({
      category: primaryCategory,
      chess,
      generatedSans,
      sourcePlies,
      addedPlies,
      openingColor,
      currentEvalCp: latestPerspectiveEval,
    });

    if (decision.stop) {
      stopReason = decision.reason;
      finalPositionSummary = decision.finalPositionSummary;
      advantageTypePrimary = decision.advantageTypePrimary;
      advantageTypeSecondary = decision.advantageTypeSecondary;
      break;
    }

    const sideToMove = chess.turn() === "w" ? "white" : "black";
    const isTrainedSideTurn = sideToMove === openingColor;

    if (isTrainedSideTurn) {
      if (!currentAnalysis.bestMove || currentAnalysis.bestMove === "(none)") {
        stopReason = "Stockfish had no usable best move for the trained side.";
        break;
      }

      const applied = chess.move(uciToMoveObject(currentAnalysis.bestMove));
      if (!applied) {
        stopReason = `Stockfish returned an illegal UCI continuation (${currentAnalysis.bestMove}).`;
        break;
      }

      generatedSans.push(applied.san);
      extension.push({
        san: applied.san,
        source: "stockfish-best-move",
        uci: currentAnalysis.bestMove,
        evaluation: currentAnalysis.evaluation ?? null,
        perspectiveEvalCp: latestPerspectiveEval,
      });
    } else {
      const popular = await selectMostPopularOpponentMove(chess.fen(), args);

      if (!popular.move) {
        stopReason = "Lichess Explorer had no continuation for the opponent side.";
        break;
      }

      if (
        Number.isFinite(args.minGamesAtNode) &&
        args.minGamesAtNode > 0 &&
        popular.totalGamesAtNode < args.minGamesAtNode
      ) {
        stopReason =
          "Stopped because the node sample in Lichess Explorer is too small to trust further.";
        break;
      }

      const applied = chess.move(uciToMoveObject(popular.move.uci));
      if (!applied) {
        stopReason = `Lichess Explorer returned an illegal UCI continuation (${popular.move.uci}).`;
        break;
      }

      generatedSans.push(applied.san);
      extension.push({
        san: applied.san,
        source: "lichess-most-popular",
        uci: popular.move.uci,
        popularityGames: popular.move.totalGames ?? null,
        popularityRatio:
          popular.totalGamesAtNode > 0
            ? Number(
                ((popular.move.totalGames ?? 0) / popular.totalGamesAtNode).toFixed(
                  4
                )
              )
            : null,
        nodeGames: popular.totalGamesAtNode,
        averageRating: popular.move.averageRating ?? null,
        explorerOpening: popular.opening?.name ?? null,
      });
    }

    if (addedPlies === args.maxAddedPlies - 1) {
      hitCap = true;
    }
  }

  if (hitCap) {
    stopReason =
      "Stopped after reaching the current continuation-generation cap for this staged pass.";
  }

  const finalAnalysis = await analyzeFen({
    fen: chess.fen(),
    depth: args.stockfishDepth,
    engineFlavor: args.stockfishEngine,
  });

  return {
    openingColor,
    primaryCategory,
    sourcePlies,
    generatedSans,
    stopReason,
    finalPositionSummary,
    advantageTypePrimary,
    advantageTypeSecondary,
    extension,
    finalFen: chess.fen(),
    stockfish: finalAnalysis,
  };
}

function buildCandidateRecord(sourceEntry, generated) {
  const ids = buildOpeningIds(sourceEntry);
  const mainLine = inferMainLineStatus(sourceEntry);
  const difficulty = inferLineDifficulty({
    primaryCategory: generated.primaryCategory,
    sourceEntry,
    generatedSans: generated.generatedSans,
    addedPlies: Math.max(generated.generatedSans.length - generated.sourcePlies, 0),
  });
  const lineName = sourceEntry.variation || sourceEntry.family || sourceEntry.name;

  return {
    openingId: ids.openingId,
    lineId: ids.lineId,
    openingName: sourceEntry.family || sourceEntry.name,
    lineName,
    fullName: sourceEntry.name,
    lineType: "main_variation_line",
    variationName: sourceEntry.variation || sourceEntry.family || sourceEntry.name,
    variationAnchorPgn: sourceEntry.pgn,
    variationAnchorSans: sourceEntry.sans,
    variationDepth: sourceEntry.variation ? sourceEntry.variation.split(":").length : 0,
    variationPath: [
      sourceEntry.family || sourceEntry.name,
      ...(sourceEntry.variation
        ? sourceEntry.variation
            .split(":")
            .map((part) => part.trim())
            .filter(Boolean)
        : []),
    ],
    ecoCode: sourceEntry.eco,
    pgn: sourceEntry.pgn,
    sourceSans: sourceEntry.sans,
    generatedSans: generated.generatedSans,
    primaryCategory: generated.primaryCategory,
    inclusionOutcome: "include-authoritative",
    sourceType: "hybrid",
    sourceName: "lichess-org/chess-openings + Lichess Explorer + Stockfish",
    sourceConfidence: "medium",
    stopReason: generated.stopReason,
    engineChecked: Boolean(generated.stockfish),
    openingColor: generated.openingColor,
    isMainVariationLine: true,
    isTeachingLine: false,
    isMainLine: mainLine.isMainLine,
    mainLineConfidence: mainLine.mainLineConfidence,
    mainLineSource: mainLine.mainLineSource,
    branchDepth: 0,
    parentLineId: null,
    finalFen: generated.finalFen,
    finalEvalCp:
      generated.stockfish?.evaluation?.score?.type === "cp"
        ? perspectiveEvalFromInfo(generated.stockfish, generated.openingColor)
        : null,
    finalEvalPerspective: generated.openingColor,
    finalEvalSummary: generated.stockfish
      ? `Stockfish checked the final position at depth ${generated.stockfish.depth} from the trained side's perspective.`
      : null,
    finalPositionSummary: generated.finalPositionSummary,
    advantageTypePrimary: generated.advantageTypePrimary,
    advantageTypeSecondary: generated.advantageTypeSecondary,
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
      extension: generated.extension,
    },
    stockfish: generated.stockfish ?? null,
  };
}

function compareLinesForDisplay(left, right) {
  if (left.isMainLine !== right.isMainLine) {
    return left.isMainLine ? -1 : 1;
  }

  const confidenceRank = { authoritative: 3, provisional: 2, none: 1 };
  const mainConfidenceDiff =
    (confidenceRank[right.mainLineConfidence] ?? 0) -
    (confidenceRank[left.mainLineConfidence] ?? 0);
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
      const lines = [...opening.lines].sort(compareLinesForDisplay).map(
        (line, index) => ({
          ...line,
          popularityRankWithinOpening:
            line.popularityRankWithinOpening ?? index + 1,
        })
      );
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
  const openings = groupOpenings(results);
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
      maxLinesPerOpening: args.maxLinesPerOpening,
      delayMs: args.delayMs,
      minGamesAtNode: args.minGamesAtNode,
      maxAddedPlies: args.maxAddedPlies,
      maxTotalPlies: args.maxTotalPlies,
      stockfishDepth: args.stockfishDepth,
      stockfishEngine: args.stockfishEngine,
      checkpointEvery: args.checkpointEvery,
    },
    count: results.length,
    totalEntries,
    progressPercent:
      totalEntries > 0 ? Number(((results.length / totalEntries) * 100).toFixed(2)) : 0,
    openingCount: openings.length,
    openings,
    results,
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceEntries = filterEntries(await fetchChessOpeningsDataset(), args);

  if (sourceEntries.length === 0) {
    throw new Error("No source entries matched the provided filters.");
  }

  const resumeState = args.resume
    ? loadResumeState(args.output)
    : {
        processed: new Set(),
        results: [],
      };
  const results = [...resumeState.results];
  const totalEntries = sourceEntries.length;

  if (resumeState.results.length > 0) {
    console.log(
      `Resuming from ${resumeState.results.length} saved candidates (${formatPercent(
        (resumeState.results.length / totalEntries) * 100
      )}).`
    );
  }

  let processedCount = results.length;

  for (const entry of sourceEntries) {
    if (resumeState.processed.has(entry.name)) {
      continue;
    }

    const generated = await extendMainVariationLine(entry, args);
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
        count: results.length,
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
