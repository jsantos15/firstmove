const { Chess } = require("chess.js");

const SOURCE_FILES = ["a", "b", "c", "d", "e"];
const DEFAULT_BASE_URL =
  "https://raw.githubusercontent.com/lichess-org/chess-openings/master";

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\b(\w+)'s\b/gi, "$1")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s:,+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const [, ...rows] = lines;
  return rows.map((row) => {
    const [eco = "", name = "", pgn = ""] = row.split("\t");
    return { eco, name, pgn };
  });
}

function parseSansFromPgn(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  return chess.history();
}

function splitOpeningName(fullName) {
  const parts = String(fullName).split(":");
  const family = parts[0]?.trim() ?? "";
  const variation = parts.slice(1).join(":").trim();

  return {
    family,
    variation,
  };
}

async function fetchChessOpeningsDataset(options = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const entries = [];

  for (const file of SOURCE_FILES) {
    const response = await fetch(`${baseUrl}/${file}.tsv`, {
      headers: {
        "User-Agent": "FirstMove/1.0 (opening naming audit)",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${file}.tsv from chess-openings: ${response.status}`
      );
    }

    const text = await response.text();
    for (const row of parseTsv(text)) {
      let sans;
      try {
        sans = parseSansFromPgn(row.pgn);
      } catch (error) {
        throw new Error(
          `Failed to parse PGN for ${row.name}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      const { family, variation } = splitOpeningName(row.name);

      entries.push({
        eco: row.eco,
        name: row.name,
        family,
        variation,
        pgn: row.pgn,
        sans,
        normalizedName: normalizeText(row.name),
        normalizedFamily: normalizeText(family),
        normalizedVariation: normalizeText(variation),
      });
    }
  }

  return entries;
}

module.exports = {
  DEFAULT_BASE_URL,
  SOURCE_FILES,
  fetchChessOpeningsDataset,
  normalizeText,
};
