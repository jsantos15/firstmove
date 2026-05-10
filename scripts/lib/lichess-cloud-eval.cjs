const fs = require("fs");
const path = require("path");

const { loadScriptEnv } = require("./local-env.cjs");

const CLOUD_EVAL_URL = "https://lichess.org/api/cloud-eval";
const DEFAULT_CACHE_PATH = path.resolve(
  __dirname,
  "..",
  "output",
  "lichess-cloud-eval-cache.json"
);

let lastRequestAt = 0;
const cacheByPath = new Map();

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

function buildHeaders(options = {}) {
  loadScriptEnv();

  const token =
    options.token ??
    process.env.LICHESS_API_TOKEN ??
    process.env.LICHESS_TOKEN ??
    null;
  const headers = {
    Accept: "application/json",
    "User-Agent": "FirstMove/1.0 (opening cloud eval audit)",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function cacheKey(fen, multipvCount) {
  return `${fen}::multipv:${multipvCount}`;
}

function loadCache(cachePath) {
  if (cacheByPath.has(cachePath)) {
    return cacheByPath.get(cachePath);
  }

  if (!fs.existsSync(cachePath)) {
    const empty = {};
    cacheByPath.set(cachePath, empty);
    return empty;
  }

  const cache = withFileRetry(
    () => JSON.parse(fs.readFileSync(cachePath, "utf8")),
    `Unable to read Lichess cloud cache ${cachePath}`
  );
  cacheByPath.set(cachePath, cache);
  return cache;
}

function readCachedLichessCloudEval(fen, options = {}) {
  const multipvCount = options.multipvCount ?? 5;
  const cachePath =
    options.cachePath === false
      ? null
      : path.resolve(options.cachePath ?? DEFAULT_CACHE_PATH);

  if (!cachePath) {
    return null;
  }

  const cache = loadCache(cachePath);
  const cached = cache[cacheKey(fen, multipvCount)];
  return cached && !cached.miss ? cached.result : null;
}

function writeCache(cachePath, cache) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  withFileRetry(
    () => fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8"),
    `Unable to write Lichess cloud cache ${cachePath}`
  );
}

async function waitForRequestSlot(delayMs) {
  const elapsed = Date.now() - lastRequestAt;
  const waitMs = Math.max(delayMs - elapsed, 0);

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastRequestAt = Date.now();
}

function whiteScoreToSideToMoveScore(score, turnColor) {
  if (!score) {
    return null;
  }

  const multiplier = turnColor === "white" ? 1 : -1;
  return {
    type: score.type,
    value: score.value * multiplier,
    whiteValue: score.value,
  };
}

function parseCloudPv(pv, index, turnColor, depth, knodes) {
  const moves = String(pv.moves ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const whiteScore = Number.isFinite(pv.cp)
    ? { type: "cp", value: pv.cp }
    : Number.isFinite(pv.mate)
      ? { type: "mate", value: pv.mate }
      : null;

  return {
    multipv: index + 1,
    depth,
    score: whiteScoreToSideToMoveScore(whiteScore, turnColor),
    whiteScore,
    pv: moves,
    uci: moves[0] ?? null,
    nodes: Number.isFinite(knodes) ? knodes * 1000 : null,
    nps: null,
  };
}

async function fetchLichessCloudEval(fen, options = {}) {
  const multipvCount = options.multipvCount ?? 5;
  const delayMs = options.delayMs ?? 5000;
  const maxRetries = options.maxRetries ?? 0;
  const networkRetryDelayMs = options.networkRetryDelayMs ?? 10000;
  const timeoutMs = options.timeoutMs ?? 30000;
  const missTtlMs = options.missTtlMs ?? 24 * 60 * 60 * 1000;
  const cachePath =
    options.cachePath === false
      ? null
      : path.resolve(options.cachePath ?? DEFAULT_CACHE_PATH);
  const cache = cachePath ? loadCache(cachePath) : null;
  const key = cacheKey(fen, multipvCount);

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

  const url = new URL(CLOUD_EVAL_URL);
  url.searchParams.set("fen", fen);
  url.searchParams.set("multiPv", String(multipvCount));

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    await waitForRequestSlot(delayMs);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;

    try {
      response = await fetch(url, {
        headers: buildHeaders(options),
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        await sleep(networkRetryDelayMs);
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 404) {
      if (cache && cachePath) {
        cache[key] = {
          miss: true,
          cachedAt: new Date().toISOString(),
        };
        writeCache(cachePath, cache);
      }

      return null;
    }

    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const retryAfterMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 60000;
      await sleep(retryAfterMs);
      continue;
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const retryAfterSeconds =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
      const error = new Error(
        `Lichess cloud eval rate limited (429)${
          retryAfterSeconds == null ? "" : `; retry after ${retryAfterSeconds}s`
        }`
      );
      error.status = 429;
      error.retryAfterSeconds = retryAfterSeconds;
      throw error;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Lichess cloud eval failed (${response.status}): ${body}`);
    }

    const payload = await response.json();
    const turnColor = fen.split(" ")[1] === "w" ? "white" : "black";
    const lines = (payload.pvs ?? [])
      .slice(0, multipvCount)
      .map((pv, index) =>
        parseCloudPv(
          pv,
          index,
          turnColor,
          payload.depth ?? null,
          payload.knodes ?? null
        )
      )
      .filter((line) => line.uci);

    if (!lines.length) {
      return null;
    }

    const result = {
      fen,
      turnColor,
      depth: payload.depth ?? null,
      engineFlavor: "lichess-cloud-eval",
      source: "lichess-cloud-eval",
      bestMove: lines[0]?.uci ?? null,
      ponder: lines[0]?.pv?.[1] ?? null,
      lines,
      cloudEval: {
        knodes: payload.knodes ?? null,
        depth: payload.depth ?? null,
        whitePerspective: true,
      },
    };

    if (cache && cachePath) {
      cache[key] = {
        result,
        cachedAt: new Date().toISOString(),
      };
      writeCache(cachePath, cache);
    }

    return result;
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("Lichess cloud eval remained rate-limited after retry.");
}

module.exports = {
  fetchLichessCloudEval,
  readCachedLichessCloudEval,
};
