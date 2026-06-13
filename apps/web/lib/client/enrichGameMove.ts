import {
  applySanMoveToFen,
  applyUciMoveToFen,
  buildSanLineFromUci,
  type AnalyzedGameMove,
} from '@firstmove/core';
import type { AnalysisWorkerPool } from './analysisPool';

export async function enrichGameMove(
  move: AnalyzedGameMove,
  pool: AnalysisWorkerPool,
  depth: number,
): Promise<AnalyzedGameMove> {
  if (!move.beforeFen) return move;
  const { beforeFen } = move;

  // Analyze the position before the played move first — we need bestMoveUci before
  // we can analyze the best-move response position.
  const before = await pool.analyze(beforeFen, depth);

  const playedResult = applySanMoveToFen(beforeFen, move.san);

  const bestMoveResult = before.bestMoveUci
    ? (() => { try { return applyUciMoveToFen(beforeFen, before.bestMoveUci!); } catch { return null; } })()
    : null;

  // afterPlayed and afterBest are independent — fire them in parallel.
  const [afterPlayed, afterBest] = await Promise.all([
    pool.analyze(playedResult.afterFen, depth),
    bestMoveResult ? pool.analyze(bestMoveResult.afterFen, depth) : Promise.resolve(null),
  ]);

  const bestLine = buildSanLineFromUci({
    fen: beforeFen,
    uciMoves: before.pv.length ? before.pv : before.bestMoveUci ? [before.bestMoveUci] : [],
    startPlyIndex: move.plyIndex,
    maxMoves: 4,
  });

  const bestMoveAlternatives = before.lines.flatMap(line => {
    if (!line.bestMoveUci) return [];
    try {
      const applied = applyUciMoveToFen(beforeFen, line.bestMoveUci);
      return [{ san: applied.san, evalCp: line.evalCp }];
    } catch {
      return [];
    }
  });

  return {
    ...move,
    hasEngineAnalysis: true,
    afterFen: playedResult.afterFen,
    beforeEvalCp: before.evalCp,
    afterPlayedEvalCp: afterPlayed.evalCp ?? move.afterPlayedEvalCp,
    afterBestEvalCp: afterBest?.evalCp,
    bestMoveSan: bestMoveResult?.san,
    bestLine: bestLine.length ? bestLine : undefined,
    bestMoveAlternatives: bestMoveAlternatives.length ? bestMoveAlternatives : undefined,
    isCriticalMove:
      typeof afterBest?.evalCp === 'number' && typeof afterPlayed.evalCp === 'number'
        ? Math.abs(afterBest.evalCp - afterPlayed.evalCp) >= 150
        : move.isCriticalMove,
  };
}
