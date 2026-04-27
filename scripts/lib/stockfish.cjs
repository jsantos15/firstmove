const fs = require("fs");
const path = require("path");

const loadEngine = require("../../packages/core/node_modules/stockfish/examples/loadEngine.js");

const ENGINE_DIR = path.resolve(
  __dirname,
  "../../packages/core/node_modules/stockfish/src"
);

const ENGINE_PATTERNS = {
  "lite-single": /^stockfish-17\.1-lite-single-.*\.js$/,
  lite: /^stockfish-17\.1-lite-.*\.js$/,
  single: /^stockfish-17\.1-single-.*\.js$/,
  full: /^stockfish-17\.1-.*\.js$/,
  asm: /^stockfish-17\.1-asm-.*\.js$/,
};

function resolveEnginePath(flavor = "lite-single") {
  const pattern = ENGINE_PATTERNS[flavor];

  if (!pattern) {
    throw new Error(
      `Unsupported Stockfish flavor "${flavor}". Expected one of: ${Object.keys(ENGINE_PATTERNS).join(", ")}`
    );
  }

  const entry = fs
    .readdirSync(ENGINE_DIR)
    .find((name) => pattern.test(name));

  if (!entry) {
    throw new Error(`Could not find a Stockfish engine file for flavor "${flavor}" in ${ENGINE_DIR}`);
  }

  return path.join(ENGINE_DIR, entry);
}

function createStockfishEngine(options = {}) {
  const enginePath = resolveEnginePath(options.flavor);
  const engine = loadEngine(enginePath);

  return {
    path: enginePath,
    send(command, onDone, onStream) {
      engine.send(command, onDone, onStream);
    },
    quit() {
      engine.quit();
    },
  };
}

function parseInfoLine(line) {
  if (typeof line !== "string" || !line.startsWith("info ")) {
    return null;
  }

  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const seldepthMatch = line.match(/\bseldepth\s+(\d+)/);
  const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
  const nodesMatch = line.match(/\bnodes\s+(\d+)/);
  const npsMatch = line.match(/\bnps\s+(\d+)/);
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);

  return {
    raw: line,
    depth: depthMatch ? Number(depthMatch[1]) : null,
    seldepth: seldepthMatch ? Number(seldepthMatch[1]) : null,
    multipv: multipvMatch ? Number(multipvMatch[1]) : 1,
    nodes: nodesMatch ? Number(nodesMatch[1]) : null,
    nps: npsMatch ? Number(npsMatch[1]) : null,
    score:
      scoreMatch
        ? {
            type: scoreMatch[1],
            value: Number(scoreMatch[2]),
          }
        : null,
    pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : [],
  };
}

module.exports = {
  createStockfishEngine,
  parseInfoLine,
  resolveEnginePath,
};
