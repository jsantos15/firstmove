const fs = require("fs");
const path = require("path");

const CHESS_API_URL = "https://chess-api.com/v1";
const DEFAULT_CACHE_PATH = path.resolve(
  __dirname,
  "..",
  "output",
  "chess-api-eval-cache.json"
);

const cacheByPath = new Map();
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withFileRetry(operation, label, attempts = 8) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      const retryable =
        error?.code === "EPERM" ||
        error?.code === "EBUSY" ||
        error?.code === "UNKNOWN";
      if (!retryable || attempt === attempts) break;
      sleepSync(50 * attempt);
    }
  }
  throw new Error(
    `${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

async function waitForSlot(delayMs) {
  const elapsed = Date.now() - lastRequestAt;
  const wait = Math.max(delayMs - elapsed, 0);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

function cacheKey(fen) {
  return `${fen}::chess-api:depth18`;
}

function loadCache(cachePath) {
  if (cacheByPath.has(cachePath)) return cacheByPath.get(cachePath);
  if (!fs.existsSync(cachePath)) {
    const empty = {};
    cacheByPath.set(cachePath, empty);
    return empty;
  }
  const cache = withFileRetry(
    () => JSON.parse(fs.readFileSync(cachePath, "utf8")),
    `Unable to read Chess-API eval cache ${cachePath}`
  );
  cacheByPath.set(cachePath, cache);
  return cache;
}

function readCachedChessApiEval(fen, options = {}) {
  const cachePath =
    options.cachePath === false
      ? null
      : path.resolve(options.cachePath ?? DEFAULT_CACHE_PATH);

  if (!cachePath) {
    return null;
  }

  const cache = loadCache(cachePath);
  const cached = cache[cacheKey(fen)];
  return cached && !cached.miss ? cached.result : null;
}

function writeCache(cachePath, cache) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  withFileRetry(
    () => fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8"),
    `Unable to write Chess-API eval cache ${cachePath}`
  );
}

function normalize(payload, fen) {
  const uci = payload.move ?? null;
  if (!uci) return null;

  const turnColor = fen.split(" ")[1] === "w" ? "white" : "black";
  const evalPawns = payload.eval ?? null;
  const evalCp = evalPawns != null ? Math.round(evalPawns * 100) : null;
  const mateMoves = payload.mate ?? null;

  const whiteScore =
    mateMoves != null
      ? { type: "mate", value: mateMoves }
      : evalCp != null
        ? { type: "cp", value: evalCp }
        : null;

  const multiplier = turnColor === "white" ? 1 : -1;
  const score = whiteScore
    ? { type: whiteScore.type, value: whiteScore.value * multiplier, whiteValue: whiteScore.value }
    : null;

  const pv = Array.isArray(payload.continuationArr) && payload.continuationArr.length
    ? payload.continuationArr
    : [uci];

  const depth = payload.depth ?? 18;

  return {
    fen,
    turnColor,
    depth,
    engineFlavor: "chess-api",
    source: "chess-api",
    bestMove: uci,
    ponder: pv[1] ?? null,
    lines: [
      {
        multipv: 1,
        depth,
        score,
        whiteScore,
        pv,
        uci,
        nodes: null,
        nps: null,
      },
    ],
  };
}

async function fetchChessApiEval(fen, options = {}) {
  const delayMs = options.delayMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 30000;
  const missTtlMs = options.missTtlMs ?? 24 * 60 * 60 * 1000;
  const cachePath =
    options.cachePath === false
      ? null
      : path.resolve(options.cachePath ?? DEFAULT_CACHE_PATH);
  const cache = cachePath ? loadCache(cachePath) : null;
  const key = cacheKey(fen);

  if (cache?.[key]) {
    if (!cache[key].miss) {
      return cache[key].result;
    }

    const cachedAtMs = Date.parse(cache[key].cachedAt ?? "");
    const missExpired =
      Number.isFinite(missTtlMs) &&
      Number.isFinite(cachedAtMs) &&
      Date.now() - cachedAtMs > missTtlMs;

    if (!missExpired) {
      return null;
    }

    delete cache[key];
  }

  await waitForSlot(delayMs);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(CHESS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "FirstMove/1.0 (opening generator)",
      },
      body: JSON.stringify({ fen, depth: 18, maxThinkingTime: 500 }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    const error = new Error("Chess-API rate limited (429)");
    error.status = 429;
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Chess-API failed (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json();
  const result = normalize(payload, fen);

  if (cache && cachePath) {
    cache[key] = result
      ? { result, cachedAt: new Date().toISOString() }
      : { miss: true, cachedAt: new Date().toISOString() };
    writeCache(cachePath, cache);
  }

  return result;
}

module.exports = { fetchChessApiEval, readCachedChessApiEval };
