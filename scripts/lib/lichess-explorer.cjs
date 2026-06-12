const DEFAULT_BASE_URL = "https://explorer.lichess.org/lichess";
const { loadScriptEnv } = require("./local-env.cjs");

function buildExplorerHeaders(options = {}) {
  loadScriptEnv();

  const bearerToken =
    options.token ??
    process.env.LICHESS_API_TOKEN ??
    process.env.LICHESS_TOKEN ??
    null;
  const cookie =
    options.cookie ??
    process.env.LICHESS_EXPLORER_COOKIE ??
    process.env.LICHESS_COOKIE ??
    null;

  const headers = {
    Accept: "application/json",
    Origin: "https://lichess.org",
    Referer: "https://lichess.org/analysis",
    "User-Agent": "FirstMove/1.0 (opening line sourcing)",
  };

  if (cookie) {
    headers.Cookie = cookie;
  }

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  return headers;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function totalGames(move) {
  return (move.white ?? 0) + (move.draws ?? 0) + (move.black ?? 0);
}

async function fetchLichessExplorer(fen, options = {}) {
  const params = new URLSearchParams({
    variant: "standard",
    speeds: options.speeds ?? "blitz,rapid,classical",
    ratings: options.ratings ?? "1600,1800,2000,2200,2500",
    moves: String(options.moves ?? 12),
    recentGames: String(options.recentGames ?? 0),
    topGames: String(options.topGames ?? 0),
    fen,
  });

  const url = `${options.baseUrl ?? DEFAULT_BASE_URL}?${params.toString()}`;
  const response = await fetch(url, {
    headers: buildExplorerHeaders(options),
  });

  if (!response.ok) {
    throw new Error(`Lichess Explorer ${response.status} for FEN: ${fen}`);
  }

  return response.json();
}

async function fetchWithRetry(fen, options = {}) {
  const retries = options.retries ?? 3;
  const delayMs = options.delayMs ?? 500;
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 1) {
        await sleep(delayMs * 2 ** (attempt - 2));
      }

      return await fetchLichessExplorer(fen, options);
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        const message = error instanceof Error ? error.message : String(error);
        const cause = error?.cause;
        const details = [
          cause?.code ? `code=${cause.code}` : null,
          cause?.message ? `cause=${cause.message}` : null,
          cause?.hostname ? `host=${cause.hostname}` : null,
        ].filter(Boolean);
        const suffix = details.length ? ` (${details.join("; ")})` : "";
        if (message.includes(fen)) {
          throw new Error(`${message}${suffix}`, { cause: error });
        }
        throw new Error(
          `Lichess Explorer fetch failed after ${retries} attempt(s) for FEN: ${fen}: ${message}${suffix}`,
          { cause: error }
        );
      }
    }
  }

  throw new Error(
    `Unreachable Lichess retry state for FEN: ${fen}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

module.exports = {
  buildExplorerHeaders,
  fetchLichessExplorer: fetchWithRetry,
  totalGames,
};
