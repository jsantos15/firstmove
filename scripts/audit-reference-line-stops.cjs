#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Chess } = require("./lib/chess-js.cjs");

const DEFAULT_INPUT = path.resolve(
  __dirname,
  "output",
  "opening-db-payload-italian-caro-cloud-reference.json"
);
const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "reference-line-stop-audit.json"
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
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    top: 20,
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

    if (token === "--top") {
      args.top = Number(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return args;
}

function readPayload(input) {
  if (!fs.existsSync(input)) {
    throw new Error(`Missing input file: ${input}`);
  }

  return JSON.parse(fs.readFileSync(input, "utf8"));
}

function openingColor(openingSlug) {
  return openingSlug === "caro-kann-defense" ? "black" : "white";
}

function turnColor(chess) {
  return chess.turn() === "w" ? "white" : "black";
}

function materialBalance(chess) {
  let white = 0;
  let black = 0;

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const value = PIECE_VALUES[piece.type] ?? 0;
      if (piece.color === "w") {
        white += value;
      } else {
        black += value;
      }
    }
  }

  return white - black;
}

function legalMoveStats(chess) {
  const moves = chess.moves({ verbose: true });
  const captures = moves.filter((move) => move.san.includes("x"));
  const checks = moves.filter((move) => /[+#]/.test(move.san));
  const promotions = moves.filter((move) => move.flags.includes("p"));
  const forcing = moves.filter(
    (move) => move.san.includes("x") || /[+#]/.test(move.san) || move.flags.includes("p")
  );

  return {
    legalCount: moves.length,
    captureCount: captures.length,
    checkCount: checks.length,
    promotionCount: promotions.length,
    forcingCount: forcing.length,
    captureSans: captures.slice(0, 8).map((move) => move.san),
    checkSans: checks.slice(0, 8).map((move) => move.san),
    forcingSans: forcing.slice(0, 10).map((move) => move.san),
  };
}

function analyzeLine(row, metadata) {
  const chess = new Chess();
  for (const san of row.sans) {
    chess.move(san);
  }

  const trainedSide = openingColor(row.opening_slug);
  const sideToMove = turnColor(chess);
  const trainedToMove = sideToMove === trainedSide;
  const stats = legalMoveStats(chess);
  const materialWhite = materialBalance(chess);
  const materialForTrained =
    trainedSide === "white" ? materialWhite : -materialWhite;
  const stopReason = metadata?.stopReason ?? row.description ?? "";
  const stopSignals = metadata?.generationMetadata?.stopSignals ?? {};
  const reasons = [];
  let score = 0;

  if (chess.inCheck()) {
    reasons.push("side to move is in check");
    score += 8;
  }

  if (trainedToMove && stats.forcingCount > 0) {
    reasons.push("trained side still has immediate forcing replies");
    score += 5;
  }

  if (trainedToMove && stats.captureCount >= 2) {
    reasons.push("trained side has multiple capture choices");
    score += 4;
  } else if (trainedToMove && stats.captureCount === 1) {
    reasons.push("trained side has an immediate capture to resolve");
    score += 2;
  }

  if (trainedToMove && stats.checkCount > 0) {
    reasons.push("trained side has an immediate check candidate");
    score += 3;
  }

  if (Math.abs(materialForTrained) >= 3 && stats.forcingCount >= 2) {
    reasons.push("material imbalance plus forcing moves remains");
    score += 3;
  }

  if (/hard cap|added-ply cap|total-ply safety cap/i.test(stopReason)) {
    reasons.push("cap-driven stop");
    score += 2;
  }

  if (stopSignals.tacticalVolatilityBand === "medium") {
    reasons.push("medium tactical volatility");
    score += 2;
  } else if (stopSignals.tacticalVolatilityBand === "high") {
    reasons.push("high tactical volatility");
    score += 5;
  }

  if (stopSignals.onlyMovePressure) {
    reasons.push("only-move pressure remains");
    score += 4;
  }

  if (stats.forcingCount >= 5) {
    reasons.push("many legal forcing moves remain");
    score += 2;
  }

  return {
    openingSlug: row.opening_slug,
    slug: row.slug,
    name: row.name,
    plies: row.sans.length,
    finalPgn: row.sans.join(" "),
    sideToMove,
    trainedSide,
    trainedToMove,
    materialForTrained,
    stopReason,
    engineProvider: metadata?.engineProvider ?? null,
    avgEngineDepth: metadata?.avgEngineDepth ?? null,
    score,
    reasons,
    legalMoveStats: stats,
    stopSignals: {
      currentEvalCp: stopSignals.currentEvalCp ?? null,
      evalStabilityCp: stopSignals.evalStabilityCp ?? null,
      topMoveGapCp: stopSignals.topMoveGapCp ?? null,
      topMoveGapBand: stopSignals.topMoveGapBand ?? null,
      playableMoveCount: stopSignals.playableMoveCount ?? null,
      tacticalVolatilityBand: stopSignals.tacticalVolatilityBand ?? null,
      onlyMovePressure: stopSignals.onlyMovePressure ?? null,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = readPayload(args.input);
  const metadataByKey = new Map(
    (payload.futureMetadata?.lineStudyMetadata ?? []).map((entry) => [
      `${entry.openingSlug}::${entry.slug}`,
      entry,
    ])
  );
  const rows = payload.currentSchema?.openingLinesRows ?? [];
  const auditRows = rows
    .map((row) =>
      analyzeLine(row, metadataByKey.get(`${row.opening_slug}::${row.slug}`))
    )
    .sort((left, right) => right.score - left.score || right.plies - left.plies);
  const flagged = auditRows.filter((row) => row.score > 0);

  const payloadOut = {
    generatedAt: new Date().toISOString(),
    input: path.basename(args.input),
    counts: {
      lines: auditRows.length,
      flagged: flagged.length,
    },
    rows: auditRows,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(payloadOut, null, 2)}\n`, "utf8");

  console.log(`Wrote reference line stop audit to ${args.output}`);
  console.log(
    JSON.stringify(
      {
        lines: auditRows.length,
        flagged: flagged.length,
        top: flagged.slice(0, args.top).map((row) => ({
          openingSlug: row.openingSlug,
          name: row.name,
          plies: row.plies,
          score: row.score,
          reasons: row.reasons,
          forcingSans: row.legalMoveStats.forcingSans,
          stopReason: row.stopReason,
        })),
      },
      null,
      2
    )
  );
}

main();
