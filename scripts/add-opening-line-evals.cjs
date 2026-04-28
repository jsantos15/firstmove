#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Chess } = require("./lib/chess-js.cjs");
const {
  createStockfishEngine,
  parseInfoLine,
} = require("./lib/stockfish.cjs");

const SCORE_MATE_CP = 100000;
const DEFAULT_INPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-candidates-normalized.json"
);
const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-candidates-normalized-with-evals.json"
);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    depth: 8,
    engine: "lite-single",
    checkpointEvery: 10,
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

    if (token === "--depth") {
      args.depth = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--engine") {
      args.engine = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--checkpoint-every") {
      args.checkpointEvery = Number(argv[index + 1]);
      index += 1;
    }
  }

  return args;
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

function sideToMoveScoreToWhiteCp(score, turnColor) {
  const cp = scoreToCp(score);
  if (!Number.isFinite(cp)) {
    return null;
  }

  return turnColor === "w" ? cp : -cp;
}

function replayLine(sans) {
  const chess = new Chess();
  const positions = [
    {
      uciMoves: [],
      turn: chess.turn(),
    },
  ];
  const uciMoves = [];

  for (const san of sans) {
    const move = chess.move(san);
    if (!move) {
      throw new Error(`Illegal SAN move: ${san}`);
    }

    uciMoves.push(`${move.from}${move.to}${move.promotion ?? ""}`);
    positions.push({
      uciMoves: [...uciMoves],
      turn: chess.turn(),
    });
  }

  return positions;
}

function analyzePosition(engine, position, depth) {
  return new Promise((resolve, reject) => {
    let latestInfo = null;

    try {
      const positionCommand = position.uciMoves.length
        ? `position startpos moves ${position.uciMoves.join(" ")}`
        : "position startpos";

      engine.send(positionCommand);
      engine.send(
        `go depth ${depth}`,
        () => {
          resolve(sideToMoveScoreToWhiteCp(latestInfo?.score ?? null, position.turn));
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
    } catch (error) {
      reject(error);
    }
  });
}

function initEngine(engine) {
  return new Promise((resolve) => {
    engine.send("uci", () => {
      engine.send("isready", () => {
        engine.send("ucinewgame");
        resolve();
      });
    });
  });
}

function writePayload(output, payload) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function updatePayloadLine(payload, updatedLine) {
  const updateLine = (line) => {
    if (line.fullName !== updatedLine.fullName) {
      return line;
    }

    return {
      ...line,
      evalCpByPly: updatedLine.evalCpByPly,
      finalEvalCp: updatedLine.finalEvalCp,
      finalEvalPerspective: updatedLine.finalEvalPerspective,
      engineChecked: true,
    };
  };

  payload.results = (payload.results ?? []).map(updateLine);
  payload.openings = (payload.openings ?? []).map((opening) => ({
    ...opening,
    lines: (opening.lines ?? []).map(updateLine),
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const lines = Array.isArray(payload.results) ? payload.results : [];
  const engine = createStockfishEngine({ flavor: args.engine });
  const cache = new Map();

  await initEngine(engine);

  try {
    let processed = 0;
    for (const line of lines) {
      if (Array.isArray(line.evalCpByPly) && line.evalCpByPly.length === line.generatedSans.length + 1) {
        const finalEvalCp = line.evalCpByPly.at(-1);
        updatePayloadLine(payload, {
          ...line,
          finalEvalCp,
          finalEvalPerspective: "white",
          evalCpByPly: line.evalCpByPly,
        });
        processed += 1;
        continue;
      }

      const positions = replayLine(line.generatedSans ?? []);
      const evalCpByPly = [];

      for (const position of positions) {
        const key = position.uciMoves.join(" ");
        if (!cache.has(key)) {
          cache.set(key, await analyzePosition(engine, position, args.depth));
        }

        evalCpByPly.push(cache.get(key));
      }

      updatePayloadLine(payload, {
        ...line,
        finalEvalCp: evalCpByPly.at(-1),
        finalEvalPerspective: "white",
        evalCpByPly,
      });

      processed += 1;
      console.log(`[${processed}/${lines.length}] ${line.fullName}`);

      if (
        Number.isFinite(args.checkpointEvery) &&
        args.checkpointEvery > 0 &&
        processed % args.checkpointEvery === 0
      ) {
        writePayload(args.output, payload);
        console.log(`Checkpoint saved to ${args.output}`);
      }
    }

    writePayload(args.output, payload);
  } finally {
    engine.quit();
  }

  console.log(`Wrote eval-enriched candidates to ${args.output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
