const path = require("path");

function loadChessJs() {
  const candidates = [
    "chess.js",
    path.resolve(__dirname, "../../node_modules/chess.js"),
    path.resolve(__dirname, "../../packages/core/node_modules/chess.js"),
    path.resolve(
      __dirname,
      "../../packages/core/node_modules/chess.js/dist/cjs/chess.js"
    ),
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_error) {
      // Try the next candidate.
    }
  }

  throw new Error(
    "Unable to resolve chess.js from the workspace root or packages/core."
  );
}

module.exports = loadChessJs();
