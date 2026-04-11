import { Chess } from 'chess.js';
import type { Opening, OpeningMove, PracticeSession } from '../types';

// ─── FEN Utilities ────────────────────────────────────────────────────────────

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function isValidFen(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

// ─── Move Sequence Helpers ────────────────────────────────────────────────────

/**
 * Given a list of SAN moves from the starting position,
 * returns the full move sequence with FEN after each move.
 */
export function buildMoveSequence(sanMoves: string[]): OpeningMove[] {
  const chess = new Chess();
  const sequence: OpeningMove[] = [];

  for (const san of sanMoves) {
    const result = chess.move(san);
    if (!result) break;
    sequence.push({ san, fen: chess.fen() });
  }

  return sequence;
}

/**
 * Returns the FEN after applying a list of SAN moves from the start.
 */
export function fenAfterMoves(sanMoves: string[]): string {
  const chess = new Chess();
  for (const san of sanMoves) {
    if (!chess.move(san)) break;
  }
  return chess.fen();
}

// ─── Practice Session Helpers ─────────────────────────────────────────────────

export function createPracticeSession(opening: Opening, variationId?: string): PracticeSession {
  const moves = variationId
    ? (opening.variations.find(v => v.id === variationId)?.moves ?? opening.moves)
    : opening.moves;

  return {
    openingId: opening.id,
    variationId,
    moves,
    currentMoveIndex: 0,
    isComplete: false,
    errors: 0,
  };
}

/**
 * Checks if a played move matches the expected move at the current position.
 * Returns the updated session.
 */
export function applyMoveToSession(
  session: PracticeSession,
  playedSan: string
): { session: PracticeSession; correct: boolean } {
  const expectedMove = session.moves[session.currentMoveIndex];
  if (!expectedMove) return { session, correct: false };

  const correct = playedSan === expectedMove.san;
  const nextIndex = session.currentMoveIndex + 1;
  const isComplete = correct && nextIndex >= session.moves.length;

  return {
    correct,
    session: {
      ...session,
      currentMoveIndex: correct ? nextIndex : session.currentMoveIndex,
      errors: correct ? session.errors : session.errors + 1,
      isComplete,
    },
  };
}

/**
 * Returns the expected move for the current position in a session.
 */
export function getCurrentExpectedMove(session: PracticeSession): OpeningMove | null {
  return session.moves[session.currentMoveIndex] ?? null;
}
