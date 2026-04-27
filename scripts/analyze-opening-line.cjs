#!/usr/bin/env node

const { analyzeSanLine } = require("./lib/stockfish-analysis.cjs");

function printUsage() {
  console.log(`Usage:
  node scripts/analyze-opening-line.cjs --san e4 e5 Nf3 Nc6 Bc4 Bc5
  node scripts/analyze-opening-line.cjs --json "[\\"e4\\",\\"e5\\",\\"Nf3\\"]"

Options:
  --san <moves...>      SAN moves separated by spaces
  --json <json>         JSON array of SAN moves
  --depth <n>           Search depth (default: 12)
  --engine <flavor>     lite-single | lite | single | full | asm
  --help                Show this help
`);
}

function parseArgs(argv) {
  const args = {
    depth: 12,
    engine: "lite-single",
    sanMoves: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

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

    if (token === "--json") {
      args.sanMoves = JSON.parse(argv[i + 1]);
      i += 1;
      continue;
    }

    if (token === "--san") {
      args.sanMoves = argv.slice(i + 1);
      break;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (!Array.isArray(args.sanMoves) || args.sanMoves.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!Number.isFinite(args.depth) || args.depth <= 0) {
    throw new Error(`Invalid depth: ${args.depth}`);
  }

  const result = await analyzeSanLine({
    sanMoves: args.sanMoves,
    depth: args.depth,
    engineFlavor: args.engine,
  });
  result.sanMoves = args.sanMoves;
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
