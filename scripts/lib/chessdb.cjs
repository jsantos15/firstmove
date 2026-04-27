const API = "https://www.chessdb.cn/cdb.php";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBestMoves(fen, options = {}) {
  const delayMs = options.delayMs ?? 800;
  const retries = options.retries ?? 3;

  await sleep(delayMs);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const url = `${API}?action=queryall&board=${encodeURIComponent(
      fen
    )}&json=1`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "FirstMove/1.0 (opening regeneration)",
        },
      });

      if (response.status === 429) {
        await sleep(15_000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`ChessDB API ${response.status} for FEN: ${fen}`);
      }

      const payload = await response.json();
      if (payload.status !== "ok" || !Array.isArray(payload.moves)) {
        return [];
      }

      return payload.moves;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }

      await sleep(3_000 * attempt);
    }
  }

  return [];
}

module.exports = {
  fetchBestMoves,
};
