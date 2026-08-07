import { Chess } from 'chess.js';
import type { GameAnalysisSide } from './gameAnalysis';

/**
 * Real (non-eval-loss-threshold) tactical detection, one function per signal a
 * category's classification needs beyond simple centipawn loss. `buildGameReviewCategory`
 * (./analysis.ts) stays a pure threshold function over these facts — this module is where
 * "how do we know it's true" lives, so a future category adds a detector here rather than
 * complicating the classifier itself.
 *
 * Brilliant-detection rules calibrated against real Chess.com badges — see
 * scripts/accuracy-research/calibrate-brilliant.js and README.md for the full derivation.
 */

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const BRILLIANT_SIGNAL_THRESHOLDS = {
  seeThreshold: 1, // opponent's minimum static profit for a hanging piece to count as bait
  netSacMin: 1, // bait profit minus whatever the move itself captured — must be a real sac, not just a trade
  poisonLossCp: 300, // taker's loss (their own POV) for actually capturing the bait vs. leaving it
  onlyMoveMarginCp: 150, // how far ahead of the 2nd-best legal move this has to be, mover's POV
  bystanderTakerMaxWinPct: 10, // for a bystander bait (see isSelfSacrifice): taker's own win%
  // after actually capturing it must be this low — ArturoCaceres 21.Nd5 leaves the taker at
  // ~0.06%, DenLaz 26.Rf6's bishop only ~11% (real, but not decisive) — 10% is the line
  // between those two known examples, not a lot of data yet.
  minWinAfterPct: 40, // mover's own win% right after the move — the "only move" mechanism alone
  // can't tell "this saves an equal position" from "this merely loses slowest in a position
  // that was already hopeless" (e.g. DenLaz#DenLaz 29...Qf7, the best available reply to a
  // check in an already-lost position — margin over the alternatives was huge, but the mover
  // was still completely lost afterward). Without this, that reads as Brilliant; it shouldn't.
} as const;

export type BrilliantSignalThresholds = typeof BRILLIANT_SIGNAL_THRESHOLDS;

/** Lichess-style win% from a white-POV centipawn eval (same curve the calibration script uses). */
export function winPercentFromWhiteCp(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export interface HangingPieceBait {
  san: string;
  to: string;
  profit: number;
  afterFen: string;
}

/** Net material the side to move can win on `square` via best-recapture-sequence SEE. */
function seeGainOnSquare(fen: string, square: string): number {
  const chess = new Chess(fen);
  const captures = chess.moves({ verbose: true }).filter(m => m.to === square && m.captured);
  if (!captures.length) return 0;
  let best = 0;
  for (const m of captures) {
    const next = new Chess(fen);
    next.move(m.san);
    const gain = PIECE_VALUES[m.captured!] - seeGainOnSquare(next.fen(), square);
    if (gain > best) best = gain;
  }
  return best;
}

/**
 * Given the position right after a candidate move, find the most tempting bait: the
 * opponent's highest-profit capture of a piece worth >= 3 (no pawn sacs). The piece
 * doesn't have to be the one that just moved, and doesn't have to be new this move —
 * a pre-existing hanging piece counts too (see baitWasStaleBeforeOpponentsMove for the
 * "is it actually fresh" check).
 */
export function findHangingPieceBait(fenAfterMove: string): HangingPieceBait | null {
  const chess = new Chess(fenAfterMove);
  const captures = chess.moves({ verbose: true }).filter(
    m => m.captured && PIECE_VALUES[m.captured] >= 3
  );
  let best: HangingPieceBait | null = null;
  for (const m of captures) {
    const next = new Chess(fenAfterMove);
    next.move(m.san);
    const profit = PIECE_VALUES[m.captured!] - seeGainOnSquare(next.fen(), m.to);
    if (!best || profit > best.profit) {
      best = { san: m.san, to: m.to, profit, afterFen: next.fen() };
    }
  }
  return best;
}

/**
 * Was a profitable capture on `square` already available before the OPPONENT's last
 * move too (stale/idle for a full round), as opposed to freshly created by it? A stale
 * bait that's just been sitting on the board doesn't make the current move Brilliant —
 * but the move creating the offer doesn't have to be the mover's OWN last move either
 * (e.g. ArturoCaceres 21.Nd5 hangs a knight left loose two moves earlier by Nxg6;
 * Alonmindlin 24.h6 hangs a knight the opponent's own 23...b4 just exposed).
 */
export function baitWasStaleBeforeOpponentsMove(
  fenBeforeOpponentsMove: string,
  square: string
): boolean {
  const parts = fenBeforeOpponentsMove.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-'; // clear en passant, it can't survive a null move
  const flipped = parts.join(' ');
  let chess: Chess;
  try {
    chess = new Chess(flipped);
    if (chess.isCheck()) return false;
  } catch {
    return false;
  }
  const captures = chess.moves({ verbose: true }).filter(
    m => m.captured && m.to === square && PIECE_VALUES[m.captured] >= 3
  );
  for (const m of captures) {
    const next = new Chess(flipped);
    next.move(m.san);
    const profit = PIECE_VALUES[m.captured!] - seeGainOnSquare(next.fen(), square);
    if (profit >= 1) return true;
  }
  return false;
}

export interface SacrificeCandidate {
  bait: HangingPieceBait;
  /** cp the played move beats the engine's runner-up by, mover's POV — null if unknown. */
  onlyMoveMarginCp: number | null;
  /**
   * True when the hanging piece IS the piece that just moved (e.g. Nxe6+ hanging the
   * knight that just landed on e6) — a genuine self-sacrifice, where the "only move"
   * margin alone is real evidence of Brilliance (the point is survival, not punishing
   * the capture). False when it's a bystander piece left loose by an earlier move
   * (e.g. Rf6 with a bishop still hanging on f5 from two moves back) — there, being
   * the engine's best move by a margin says nothing about whether that bystander bait
   * is actually worth avoiding, so it needs its own check (isBystanderCaptureDecisive).
   */
  isSelfSacrifice: boolean;
}

/**
 * Cheap, pure pre-check (no engine calls) for whether a move MIGHT be Brilliant: it
 * must hang a real piece via SEE, as a genuine net sacrifice, and the offer must be
 * fresh (not stale). Only call this for moves that are already known to be the
 * engine's own top choice (rule 1, enforced by the caller) — that's firm and not
 * re-checked here.
 *
 * Returns the candidate plus the "only move" margin computed from MultiPV lines the
 * caller already has (free). If `isOnlyMoveBrilliant` on the result is false, the
 * caller needs one more engine call — the eval right after the bait is captured — to
 * check the "poisoned bait" path via `computePoisonTakerLossCp`.
 */
export function findSacrificeCandidate({
  fenBeforeMove,
  playedSan,
  fenBeforeOpponentsPriorMove,
  mover,
  multiPvLines,
  evalAfterMoveWhiteCp,
  thresholds = BRILLIANT_SIGNAL_THRESHOLDS,
}: {
  fenBeforeMove: string;
  playedSan: string;
  /** FEN right before the opponent's move that preceded this one — undefined at the game's first ply. */
  fenBeforeOpponentsPriorMove: string | undefined;
  mover: GameAnalysisSide;
  /** MultiPV lines for fenBeforeMove, best first (index 0 = engine's #1 choice). */
  multiPvLines: Array<{ evalCp: number | undefined }>;
  /** White-POV eval right after the move — used for the "wasn't already lost" guard. */
  evalAfterMoveWhiteCp: number | undefined;
  /** Defaults to the calibrated production values — override to sweep during calibration. */
  thresholds?: BrilliantSignalThresholds;
}): SacrificeCandidate | null {
  const chess = new Chess(fenBeforeMove);
  let moveResult;
  try {
    moveResult = chess.move(playedSan);
  } catch {
    return null;
  }
  const movedCapturedValue = moveResult.captured ? PIECE_VALUES[moveResult.captured] : 0;
  const fenAfterMove = chess.fen();

  if (typeof evalAfterMoveWhiteCp !== 'number') return null;
  const moverCpAfter = mover === 'white' ? evalAfterMoveWhiteCp : -evalAfterMoveWhiteCp;
  if (winPercentFromWhiteCp(moverCpAfter) < thresholds.minWinAfterPct) return null;

  const bait = findHangingPieceBait(fenAfterMove);
  if (!bait) return null;
  if (bait.profit < thresholds.seeThreshold) return null;
  if (bait.profit - movedCapturedValue < thresholds.netSacMin) return null;
  if (
    fenBeforeOpponentsPriorMove &&
    baitWasStaleBeforeOpponentsMove(fenBeforeOpponentsPriorMove, bait.to)
  ) {
    return null;
  }

  const onlyMoveMarginCp = computeOnlyMoveMarginCp({ mover, lines: multiPvLines });
  const isSelfSacrifice = bait.to === moveResult.to;
  return { bait, onlyMoveMarginCp, isSelfSacrifice };
}

export function isOnlyMoveBrilliant(
  candidate: SacrificeCandidate,
  thresholds: BrilliantSignalThresholds = BRILLIANT_SIGNAL_THRESHOLDS
): boolean {
  return (
    candidate.onlyMoveMarginCp != null && candidate.onlyMoveMarginCp >= thresholds.onlyMoveMarginCp
  );
}

/**
 * For a BYSTANDER bait only (see isSelfSacrifice) — is capturing it actually decisive
 * for the taker, not just "worse than declining"? A marginal cp loss (computePoisonTakerLossCp)
 * can look small even when the absolute result is crushing, if the taker was already in
 * trouble before the brilliant move too (ArturoCaceres 21.Nd5: only 129cp worse than
 * declining, but declining was already ~99.5% lost — the marginal number hides that
 * taking leaves Black at ~0.06%). This checks the taker's own win% in absolute terms
 * after the capture, which is what actually separates a real Brilliant bystander bait
 * from an incidental one worth only a modest edge (DenLaz 26.Rf6: bishop hangs, but
 * taking it only leaves Black at ~11% — bad, not decisive).
 */
export function isBystanderCaptureDecisive({
  mover,
  evalAfterBaitCapturedWhiteCp,
  thresholds = BRILLIANT_SIGNAL_THRESHOLDS,
}: {
  mover: GameAnalysisSide;
  evalAfterBaitCapturedWhiteCp: number;
  /** Defaults to the calibrated production values — override to sweep during calibration. */
  thresholds?: BrilliantSignalThresholds;
}): boolean {
  const takerCp = mover === 'white' ? -evalAfterBaitCapturedWhiteCp : evalAfterBaitCapturedWhiteCp;
  const takerWinPct = winPercentFromWhiteCp(takerCp);
  return takerWinPct <= thresholds.bystanderTakerMaxWinPct;
}

/**
 * How far ahead the engine's top choice is over the runner-up, from the mover's own
 * perspective. A large margin means every other legal try is meaningfully worse — not
 * just "slightly better," but the only real way to hold the position together (e.g.
 * penguingm1 29.Nxe6+: dead level only with this move, worse with anything else).
 */
export function computeOnlyMoveMarginCp({
  mover,
  lines,
}: {
  mover: GameAnalysisSide;
  lines: Array<{ evalCp: number | undefined }>;
}): number | null {
  const pv1 = lines[0]?.evalCp;
  if (typeof pv1 !== 'number') return null;
  // No runner-up at all (fewer than 2 legal moves) reads as a huge margin for White;
  // this edge case is vanishingly rare (a single forced legal reply) and unvalidated
  // for Black — ported as-is from the calibration script rather than "fixed" blind.
  const pv2 = lines[1]?.evalCp ?? -100000;
  const moverSign = mover === 'white' ? 1 : -1;
  return moverSign * (pv1 - pv2);
}

export function isPoisonBrilliant(
  takerLossCp: number,
  thresholds: BrilliantSignalThresholds = BRILLIANT_SIGNAL_THRESHOLDS
): boolean {
  return takerLossCp >= thresholds.poisonLossCp;
}

/**
 * How much the opponent ("the taker") loses, in their own perspective, by actually
 * capturing the bait instead of leaving the position as it stood right after the
 * Brilliant move. A large loss means the capture is "poisoned" — includes forced-mate
 * cases, which read as a huge loss via the mate-score convention already baked into
 * evalCp. Capped at 2000 so one mate score doesn't dominate a knob sweep.
 */
export function computePoisonTakerLossCp({
  mover,
  evalAfterMoveWhiteCp,
  evalAfterBaitCapturedWhiteCp,
}: {
  mover: GameAnalysisSide;
  /** White-POV eval right after the Brilliant move, before the opponent responds. */
  evalAfterMoveWhiteCp: number;
  /** White-POV eval after the opponent captures the bait. */
  evalAfterBaitCapturedWhiteCp: number;
}): number {
  const takerSign = mover === 'white' ? -1 : 1;
  const cpDecline = takerSign * evalAfterMoveWhiteCp;
  const cpTake = takerSign * evalAfterBaitCapturedWhiteCp;
  return Math.min(2000, cpDecline - cpTake);
}
