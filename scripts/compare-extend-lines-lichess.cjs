#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const {
  fetchLichessExplorer,
  totalGames,
} = require("./lib/lichess-explorer.cjs");

const DEFAULT_AUDIT_PATH = path.resolve(
  __dirname,
  "output",
  "opening-line-audit.json"
);

const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "opening-line-lichess-compare.json"
);

function parseArgs(argv) {
  const args = {
    audit: DEFAULT_AUDIT_PATH,
    output: DEFAULT_OUTPUT,
    opening: null,
    line: null,
    limit: null,
    tailPlies: 6,
    minGames: 200,
    delayMs: 500,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--audit") {
      args.audit = path.resolve(argv[i + 1]);
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

    if (token === "--tail-plies") {
      args.tailPlies = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (token === "--min-games") {
      args.minGames = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (token === "--delay-ms") {
      args.delayMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
  }

  return args;
}

function applyUciMove(chess, uciMove) {
  const from = uciMove.slice(0, 2);
  const to = uciMove.slice(2, 4);
  const promotion = uciMove.slice(4) || undefined;
  const move = chess.move({ from, to, promotion });

  if (!move) {
    throw new Error(`Illegal UCI move from Lichess Explorer: ${uciMove}`);
  }

  return move.san;
}

function filterEntries(report, args) {
  let entries = report.results.filter((entry) => entry.audit?.decision === "extend");

  if (args.opening) {
    entries = entries.filter((entry) => entry.openingId === args.opening);
  }

  if (args.line) {
    entries = entries.filter((entry) => entry.lineId === args.line);
  }

  if (Number.isFinite(args.limit) && args.limit > 0) {
    entries = entries.slice(0, args.limit);
  }

  return entries;
}

async function buildHumanTail(entry, args) {
  const chess = new Chess();
  for (const san of entry.sans) {
    chess.move(san);
  }

  const rootExplorer = await fetchLichessExplorer(entry.finalFen, {
    moves: 12,
    delayMs: args.delayMs,
  });

  const topMoves = (rootExplorer.moves ?? [])
    .map((move) => ({
      ...move,
      totalGames: totalGames(move),
    }))
    .sort((a, b) => b.totalGames - a.totalGames)
    .slice(0, 8);

  const addedSans = [];
  const trace = [];
  let currentFen = entry.finalFen;

  for (let ply = 0; ply < args.tailPlies; ply += 1) {
    const explorer = await fetchLichessExplorer(currentFen, {
      moves: 12,
      delayMs: args.delayMs,
    });
    const rankedMoves = (explorer.moves ?? [])
      .map((move) => ({
        ...move,
        totalGames: totalGames(move),
      }))
      .sort((a, b) => b.totalGames - a.totalGames);

    const bestMove = rankedMoves[0];
    if (!bestMove || bestMove.totalGames < args.minGames) {
      break;
    }

    const san = applyUciMove(chess, bestMove.uci);
    addedSans.push(san);
    trace.push({
      fen: currentFen,
      move: {
        uci: bestMove.uci,
        san,
        totalGames: bestMove.totalGames,
        white: bestMove.white ?? 0,
        draws: bestMove.draws ?? 0,
        black: bestMove.black ?? 0,
        averageRating: bestMove.averageRating ?? null,
        opening: bestMove.opening ?? null,
      },
    });

    currentFen = chess.fen();
  }

  return {
    rootOpening: rootExplorer.opening ?? null,
    topMoves,
    humanTail: {
      addedPlies: addedSans.length,
      addedSans,
      finalFen: chess.fen(),
      trace,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(fs.readFileSync(args.audit, "utf8"));
  const entries = filterEntries(report, args);

  if (entries.length === 0) {
    throw new Error("No extend lines matched the provided filters.");
  }

  const results = [];

  for (const entry of entries) {
    const lichess = await buildHumanTail(entry, args);
    results.push({
      openingId: entry.openingId,
      openingName: entry.openingName,
      lineId: entry.lineId,
      lineName: entry.lineName,
      category: entry.category,
      currentSans: entry.sans,
      stockfishProposal: entry.proposal ?? null,
      lichess,
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "lichess-explorer",
    tailPlies: args.tailPlies,
    minGames: args.minGames,
    count: results.length,
    results,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote Lichess comparison report to ${args.output}`);
  console.log(JSON.stringify({ count: results.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
