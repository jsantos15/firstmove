#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const {
  createStockfishEngine,
  parseInfoLine,
} = require("./lib/stockfish.cjs");
const { loadOpeningDefinitions } = require("./lib/opening-dataset.cjs");

const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "opening-line-audit.json"
);

const PIECE_VALUES = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function parseArgs(argv) {
  const args = {
    depth: 8,
    engine: "lite-single",
    output: DEFAULT_OUTPUT,
    opening: null,
    line: null,
    limit: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--depth") {
      args.depth = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (token === "--engine") {
      args.engine = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === "--output") {
      args.output = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }

    if (token === "--opening") {
      args.opening = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === "--line") {
      args.line = argv[i + 1];
      i += 1;
      continue;
    }

    if (token === "--limit") {
      args.limit = Number(argv[i + 1]);
      i += 1;
      continue;
    }
  }

  return args;
}

function inferCategory(name, description) {
  const text = `${name} ${description ?? ""}`.toLowerCase();

  if (/\b(refut|punish|incorrect|mistake|anti-)\b/.test(text)) {
    return "punishment";
  }

  if (/\btrap\b/.test(text)) {
    return "trap";
  }

  if (/\b(gambit|sacrifice|sacrifices|offers a piece|offering a piece)\b/.test(text)) {
    return "gambit";
  }

  if (/\b(counter-attack|counterattacks|forced|forcing|wild|complications)\b/.test(text)) {
    return "forcing";
  }

  if (/\b(slow|maneuver|positional|structure|long-term|solid)\b/.test(text)) {
    return "strategic";
  }

  return "setup";
}

function buildLineEntries(openings) {
  const entries = [];

  for (const opening of openings) {
    const lines = [opening.mainLine, ...opening.variations];
    for (const line of lines) {
      entries.push({
        openingId: opening.id,
        openingName: opening.name,
        openingColor: opening.color,
        ecoCode: opening.ecoCode,
        lineId: line.id,
        lineName: line.name,
        description: line.description ?? "",
        sans: line.sans,
        category: inferCategory(line.name, line.description),
        isMainLine: line.id === opening.mainLine.id,
      });
    }
  }

  return entries;
}

function buildPositionFromSan(sanMoves) {
  const chess = new Chess();
  const uciMoves = [];

  for (const san of sanMoves) {
    const move = chess.move(san);
    if (!move) {
      throw new Error(`Illegal SAN move: ${san}`);
    }
    const promotion = move.promotion ?? "";
    uciMoves.push(`${move.from}${move.to}${promotion}`);
  }

  return {
    chess,
    finalFen: chess.fen(),
    turn: chess.turn() === "w" ? "white" : "black",
    uciMoves,
  };
}

function materialBalance(chess) {
  const balance = {
    white: 0,
    black: 0,
  };

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      balance[piece.color === "w" ? "white" : "black"] += PIECE_VALUES[piece.type];
    }
  }

  return {
    white: balance.white,
    black: balance.black,
    imbalance: balance.white - balance.black,
    absoluteImbalance: Math.abs(balance.white - balance.black),
  };
}

function perspectiveScore(score, turn, openingColor) {
  if (!score) {
    return null;
  }

  const sideToMove = turn;
  const sign = sideToMove === openingColor ? 1 : -1;

  return {
    type: score.type,
    value: sign * score.value,
    perspective: openingColor,
  };
}

function buildHeuristic(entry, analysis, positionData) {
  const reasons = [];
  const plies = entry.sans.length;
  const lastSan = entry.sans[plies - 1] ?? "";
  const tacticalTailCount = entry.sans
    .slice(Math.max(0, plies - 4))
    .filter((san) => /[x+#]/.test(san)).length;
  const material = materialBalance(positionData.chess);
  const openingPerspective = perspectiveScore(
    analysis?.score ?? null,
    positionData.turn,
    entry.openingColor
  );
  const openingEval = openingPerspective?.value ?? null;

  let decision = "keep";
  let confidence = "medium";

  if (
    ["gambit", "trap", "punishment", "forcing"].includes(entry.category) &&
    (/[x+#]/.test(lastSan) ||
      tacticalTailCount >= 2 ||
      material.absoluteImbalance >= 2 ||
      (analysis?.pv?.length ?? 0) >= 4)
  ) {
    decision = "extend";
    confidence = "high";
    reasons.push("Line ends while tactical or forcing consequences still appear active.");
  }

  if (
    decision === "keep" &&
    ["setup", "strategic"].includes(entry.category) &&
    plies >= 16 &&
    tacticalTailCount === 0 &&
    !/[x+#]/.test(lastSan) &&
    openingEval !== null &&
    Math.abs(openingEval) <= 50
  ) {
    decision = "shorten";
    confidence = "medium";
    reasons.push("Line may continue past the opening lesson into lower-value normal play.");
  }

  if (decision === "keep") {
    reasons.push("No obvious sign that the line ends too early or extends too deep.");
  }

  if (entry.category === "gambit" && material.absoluteImbalance >= 1) {
    reasons.push("Material remains imbalanced at the stopping point.");
  }

  if (/[+#]/.test(lastSan)) {
    reasons.push("Last move contains check or mate notation.");
  } else if (/x/.test(lastSan)) {
    reasons.push("Last move is a capture.");
  }

  return {
    decision,
    confidence,
    reasons,
    metrics: {
      plies,
      fullMoves: Math.ceil(plies / 2),
      lastSan,
      tacticalTailCount,
      openingEval,
      material,
    },
  };
}

function buildPositionCommand(uciMoves) {
  return uciMoves.length
    ? `position startpos moves ${uciMoves.join(" ")}`
    : "position startpos";
}

function applyUciMove(chess, uciMove) {
  const from = uciMove.slice(0, 2);
  const to = uciMove.slice(2, 4);
  const promotion = uciMove.slice(4) || undefined;
  const move = chess.move({ from, to, promotion });

  if (!move) {
    throw new Error(`Illegal UCI move from engine: ${uciMove}`);
  }

  return move.san;
}

function analyzePosition(engine, positionCommand, depth) {
  return new Promise((resolve) => {
    let latestInfo = null;

    engine.send("isready", () => {
      engine.send("ucinewgame");
      engine.send(positionCommand);
      engine.send(
        `go depth ${depth}`,
        (bestmoveLine) => {
          const bestmoveMatch = bestmoveLine.match(
            /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/
          );

          resolve({
            bestMove: bestmoveMatch ? bestmoveMatch[1] : null,
            ponder: bestmoveMatch ? bestmoveMatch[2] ?? null : null,
            ...(latestInfo
              ? {
                  depth: latestInfo.depth,
                  seldepth: latestInfo.seldepth,
                  nodes: latestInfo.nodes,
                  nps: latestInfo.nps,
                  score: latestInfo.score,
                  pv: latestInfo.pv,
                }
              : {
                  depth: null,
                  seldepth: null,
                  nodes: null,
                  nps: null,
                  score: null,
                  pv: [],
                }),
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
}

async function analyzeSanSequence(engine, entry, sanMoves, depth) {
  const positionData = buildPositionFromSan(sanMoves);
  const analysis = await analyzePosition(
    engine,
    buildPositionCommand(positionData.uciMoves),
    depth
  );
  const heuristic = buildHeuristic(
    { ...entry, sans: sanMoves },
    analysis,
    positionData
  );

  return {
    sanMoves,
    positionData,
    analysis,
    heuristic,
  };
}

async function proposeShorten(engine, entry, depth, currentAnalysis) {
  if (!["setup", "strategic"].includes(entry.category)) {
    return null;
  }

  const finalEval = currentAnalysis.audit.metrics.openingEval;
  let bestCandidate = null;

  for (let cutoff = 6; cutoff < entry.sans.length; cutoff += 1) {
    const candidateSans = entry.sans.slice(0, cutoff);
    const candidate = await analyzeSanSequence(engine, entry, candidateSans, depth);
    const evalGap =
      finalEval === null || candidate.heuristic.metrics.openingEval === null
        ? null
        : Math.abs(finalEval - candidate.heuristic.metrics.openingEval);

    const quietEnough =
      candidate.heuristic.metrics.tacticalTailCount === 0 &&
      !/[x+#]/.test(candidate.heuristic.metrics.lastSan);
    const balancedEnough =
      candidate.heuristic.metrics.openingEval !== null &&
      Math.abs(candidate.heuristic.metrics.openingEval) <= 70;
    const closeToFinal =
      evalGap === null ? true : evalGap <= 45;

    if (!quietEnough || !balancedEnough || !closeToFinal) {
      continue;
    }

    bestCandidate = {
      cutoffPly: cutoff,
      removedPlies: entry.sans.length - cutoff,
      candidateSans,
      finalFen: candidate.positionData.finalFen,
      stockfish: candidate.analysis,
      audit: candidate.heuristic,
      reason:
        "This earlier cutoff already looks quiet and balanced enough to hand the learner off to normal play.",
    };
    break;
  }

  return bestCandidate;
}

async function proposeExtend(engine, entry, depth, currentAnalysis) {
  if (!["gambit", "trap", "punishment", "forcing"].includes(entry.category)) {
    return null;
  }

  const chess = new Chess();
  for (const san of entry.sans) {
    chess.move(san);
  }

  const addedSans = [];
  let latestAnalysis = currentAnalysis.stockfish;
  let latestPositionData = currentAnalysis.positionData;
  let latestHeuristic = currentAnalysis.audit;

  for (let step = 0; step < 6; step += 1) {
    const bestMove = latestAnalysis.bestMove;
    if (!bestMove || bestMove === "(none)") {
      break;
    }

    const san = applyUciMove(chess, bestMove);
    addedSans.push(san);

    const extendedSans = [...entry.sans, ...addedSans];
    const candidate = await analyzeSanSequence(engine, entry, extendedSans, depth);

    latestAnalysis = candidate.analysis;
    latestPositionData = candidate.positionData;
    latestHeuristic = candidate.heuristic;

    if (latestHeuristic.decision !== "extend" && addedSans.length >= 2) {
      return {
        addedPlies: addedSans.length,
        addedSans,
        finalFen: latestPositionData.finalFen,
        stockfish: latestAnalysis,
        audit: latestHeuristic,
        reason:
          "This candidate tail carries the line past the unresolved tactical phase into a calmer, more complete teaching position.",
      };
    }
  }

  if (addedSans.length === 0) {
    return null;
  }

  return {
    addedPlies: addedSans.length,
    addedSans,
    finalFen: latestPositionData.finalFen,
    stockfish: latestAnalysis,
    audit: latestHeuristic,
    reason:
      "This is the longest engine-guided continuation tried before the audit stopped finding a clearer resolution point.",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const openings = loadOpeningDefinitions();
  let entries = buildLineEntries(openings);

  if (args.opening) {
    entries = entries.filter((entry) => entry.openingId === args.opening);
  }

  if (args.line) {
    entries = entries.filter((entry) => entry.lineId === args.line);
  }

  if (Number.isFinite(args.limit) && args.limit > 0) {
    entries = entries.slice(0, args.limit);
  }

  if (entries.length === 0) {
    throw new Error("No opening lines matched the provided filters.");
  }

  const engine = createStockfishEngine({ flavor: args.engine });
  const results = [];

  try {
    await new Promise((resolve) => engine.send("uci", resolve));

    for (const entry of entries) {
      const {
        positionData,
        analysis,
        heuristic,
      } = await analyzeSanSequence(engine, entry, entry.sans, args.depth);

      const currentAnalysis = {
        positionData,
        stockfish: analysis,
        audit: heuristic,
      };

      const proposal =
        heuristic.decision === "shorten"
          ? await proposeShorten(engine, entry, args.depth, currentAnalysis)
          : heuristic.decision === "extend"
            ? await proposeExtend(engine, entry, args.depth, currentAnalysis)
            : null;

      results.push({
        ...entry,
        finalFen: positionData.finalFen,
        turn: positionData.turn,
        stockfish: analysis,
        audit: heuristic,
        proposal,
      });
    }
  } finally {
    engine.quit();
  }

  const summary = results.reduce(
    (acc, result) => {
      acc.total += 1;
      acc[result.audit.decision] += 1;
      return acc;
    },
    { total: 0, keep: 0, extend: 0, shorten: 0 }
  );

  const report = {
    generatedAt: new Date().toISOString(),
    engine: args.engine,
    depth: args.depth,
    filters: {
      opening: args.opening,
      line: args.line,
      limit: args.limit,
    },
    summary,
    results,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote opening audit report to ${args.output}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
