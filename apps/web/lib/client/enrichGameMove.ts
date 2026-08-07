import {
  applySanMoveToFen,
  applyUciMoveToFen,
  buildSanLineFromUci,
  findSacrificeCandidate,
  isOnlyMoveBrilliant,
  isPoisonBrilliant,
  isBystanderCaptureDecisive,
  computePoisonTakerLossCp,
  type AnalyzedGameMove,
} from '@firstmove/core';
import type { AnalysisWorkerPool } from './analysisPool';

// The "poisoned bait" check (eval right after the opponent takes the hanging piece)
// only fires for the rare move that's already the engine's top choice AND hangs a
// piece — a handful of positions per game at most — so it's worth a deeper look than
// the standard per-move pass to avoid depth-10 noise on what's usually a sharp,
// forcing sequence (see scripts/accuracy-research/calibrate-brilliant.js, tuned at
// depth 20-22).
const BRILLIANT_POISON_CHECK_DEPTH_FLOOR = 16;

export async function enrichGameMove(
  move: AnalyzedGameMove,
  pool: AnalysisWorkerPool,
  depth: number,
  /** FEN right before the opponent's move that preceded this one — undefined at ply 0. */
  fenBeforeOpponentsPriorMove?: string,
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

  // Brilliant candidate check — only worth attempting when the played move IS the
  // engine's own top choice (firm rule, not re-checked in findSacrificeCandidate).
  let isSacrifice = move.isSacrifice;
  if (bestMoveResult?.san === move.san) {
    const candidate = findSacrificeCandidate({
      fenBeforeMove: beforeFen,
      playedSan: move.san,
      fenBeforeOpponentsPriorMove,
      mover: move.playedBy,
      multiPvLines: before.lines,
      evalAfterMoveWhiteCp: afterPlayed.evalCp,
    });
    if (candidate) {
      // Self-sacrifice + only-move margin is sufficient on its own (Nxe6+ pattern: the
      // move's own point is survival, not punishing a capture — there may be no real
      // poison at all). A bystander bait (piece left hanging by an earlier move) needs
      // more: being the best move by a margin says nothing about whether that bystander
      // piece is actually worth avoiding, so it always gets the engine check below too.
      if (candidate.isSelfSacrifice && isOnlyMoveBrilliant(candidate)) {
        isSacrifice = true;
      } else {
        const afterBaitTaken = await pool.analyze(
          candidate.bait.afterFen,
          Math.max(depth, BRILLIANT_POISON_CHECK_DEPTH_FLOOR)
        );
        if (typeof afterPlayed.evalCp === 'number' && typeof afterBaitTaken.evalCp === 'number') {
          const takerLossCp = computePoisonTakerLossCp({
            mover: move.playedBy,
            evalAfterMoveWhiteCp: afterPlayed.evalCp,
            evalAfterBaitCapturedWhiteCp: afterBaitTaken.evalCp,
          });
          const bystanderDecisive =
            !candidate.isSelfSacrifice &&
            isOnlyMoveBrilliant(candidate) &&
            isBystanderCaptureDecisive({
              mover: move.playedBy,
              evalAfterBaitCapturedWhiteCp: afterBaitTaken.evalCp,
            });
          if (isPoisonBrilliant(takerLossCp) || bystanderDecisive) isSacrifice = true;
        }
      }
    }
  }

  return {
    ...move,
    hasEngineAnalysis: true,
    afterFen: playedResult.afterFen,
    beforeEvalCp: before.evalCp,
    afterPlayedEvalCp: afterPlayed.evalCp ?? move.afterPlayedEvalCp,
    afterBestEvalCp: afterBest?.evalCp,
    bestMoveSan: bestMoveResult?.san,
    isSacrifice,
    bestLine: bestLine.length ? bestLine : undefined,
    bestMoveAlternatives: bestMoveAlternatives.length ? bestMoveAlternatives : undefined,
    isCriticalMove:
      typeof afterBest?.evalCp === 'number' && typeof afterPlayed.evalCp === 'number'
        ? Math.abs(afterBest.evalCp - afterPlayed.evalCp) >= 150
        : move.isCriticalMove,
  };
}
