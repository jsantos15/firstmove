#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Chess } = require("./lib/chess-js.cjs");
const { fetchChessOpeningsDataset } = require("./lib/chess-openings-source.cjs");

const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "opening-position-index.json"
);

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--output") {
      args.output = path.resolve(argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

function normalizeFenForOpeningPosition(fen) {
  return fen.split(/\s+/).slice(0, 4).join(" ");
}

function buildPositionRow(entry) {
  const chess = new Chess();
  for (const san of entry.sans) {
    chess.move(san);
  }

  const fen = chess.fen();
  return {
    position_key: normalizeFenForOpeningPosition(fen),
    fen,
    eco_code: entry.eco,
    name: entry.name,
    family: entry.family,
    variation: entry.variation || null,
    pgn: entry.pgn,
    sans: entry.sans,
    ply: entry.sans.length,
    source: "lichess-org/chess-openings",
  };
}

function choosePreferredPositionRow(current, candidate) {
  if (!current) return candidate;

  if (candidate.ply !== current.ply) {
    return candidate.ply > current.ply ? candidate : current;
  }

  if (candidate.name.length !== current.name.length) {
    return candidate.name.length > current.name.length ? candidate : current;
  }

  return candidate.name.localeCompare(current.name) < 0 ? candidate : current;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = await fetchChessOpeningsDataset();
  const rowsByPosition = new Map();

  for (const entry of entries) {
    const candidate = buildPositionRow(entry);
    const current = rowsByPosition.get(candidate.position_key);
    rowsByPosition.set(
      candidate.position_key,
      choosePreferredPositionRow(current, candidate)
    );
  }

  const rows = [...rowsByPosition.values()].sort((left, right) => {
    if (left.eco_code !== right.eco_code) {
      return left.eco_code.localeCompare(right.eco_code);
    }
    if (left.ply !== right.ply) {
      return left.ply - right.ply;
    }
    return left.name.localeCompare(right.name);
  });

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(
    args.output,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "lichess-org/chess-openings",
        rows,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        output: args.output,
        sourceEntries: entries.length,
        positions: rows.length,
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
