const DEFAULT_BASE_URL = "https://explorer.lichess.ovh/lichess";

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
    headers: {
      "User-Agent": "FirstMove/1.0 (opening line sourcing)",
    },
  });

  if (!response.ok) {
    throw new Error(`Lichess Explorer ${response.status} for FEN: ${fen}`);
  }

  return response.json();
}

async function fetchWithRetry(fen, options = {}) {
  const retries = options.retries ?? 3;
  const delayMs = options.delayMs ?? 500;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 1) {
        await sleep(delayMs * attempt);
      }

      return await fetchLichessExplorer(fen, options);
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
    }
  }

  throw new Error("Unreachable Lichess retry state.");
}

module.exports = {
  fetchLichessExplorer: fetchWithRetry,
  totalGames,
};
