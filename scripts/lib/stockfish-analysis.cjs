const { Chess } = require("./chess-js.cjs");
const {
  createStockfishEngine,
  parseInfoLine,
} = require("./stockfish.cjs");

function buildPositionFromSan(sanMoves) {
  const chess = new Chess();
  const uciMoves = [];

  for (const san of sanMoves) {
    const move = chess.move(san);

    if (!move) {
      throw new Error(`Illegal SAN move: ${san}`);
    }

    const promotion = move.promotion ?? "";
    uciMoves.push(`${move.from}${move.to}${promotion}`);
  }

  return {
    finalFen: chess.fen(),
    turn: chess.turn() === "w" ? "white" : "black",
    uciMoves,
  };
}

function analyzeSanLine({ sanMoves, depth = 10, engineFlavor = "lite-single" }) {
  return new Promise((resolve, reject) => {
    const engine = createStockfishEngine({ flavor: engineFlavor });
    const { finalFen, turn, uciMoves } = buildPositionFromSan(sanMoves);
    let latestInfo = null;

    const cleanup = () => {
      try {
        engine.quit();
      } catch (_error) {
        // ignore teardown errors
      }
    };

    try {
      engine.send("uci", () => {
        engine.send("isready", () => {
          engine.send("ucinewgame");
          const positionCommand = uciMoves.length
            ? `position startpos moves ${uciMoves.join(" ")}`
            : "position startpos";
          engine.send(positionCommand);
          engine.send(
            `go depth ${depth}`,
            (bestmoveLine) => {
              const bestmoveMatch = bestmoveLine.match(
                /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/
              );

              const result = {
                finalFen,
                turn,
                depth,
                engineFlavor,
                bestMove: bestmoveMatch ? bestmoveMatch[1] : null,
                ponder: bestmoveMatch ? bestmoveMatch[2] ?? null : null,
                evaluation: latestInfo
                  ? {
                      perspective: "side-to-move",
                      depth: latestInfo.depth,
                      seldepth: latestInfo.seldepth,
                      score: latestInfo.score,
                      nodes: latestInfo.nodes,
                      nps: latestInfo.nps,
                      pv: latestInfo.pv,
                    }
                  : null,
              };

              cleanup();
              resolve(result);
            },
            (line) => {
              const info = parseInfoLine(line);
              if (!info || info.multipv !== 1 || !info.score) {
                return;
              }

              if (!latestInfo || (info.depth ?? 0) >= (latestInfo.depth ?? 0)) {
                latestInfo = info;
              }
            }
          );
        });
      });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

module.exports = {
  analyzeSanLine,
};
