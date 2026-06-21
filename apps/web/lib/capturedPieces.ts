export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q';

const PIECE_VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const INITIAL_COUNTS: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

export interface MaterialState {
  whiteCaptured: PieceType[]; // Black pieces captured by White
  blackCaptured: PieceType[]; // White pieces captured by Black
  advantage: number;           // positive = White ahead in points
}

export function computeMaterial(fen: string): MaterialState {
  const placement = fen.split(' ')[0];
  const counts: Record<string, number> = {};
  for (const ch of placement) {
    if (/[pnbrqkPNBRQK]/.test(ch)) counts[ch] = (counts[ch] ?? 0) + 1;
  }

  const whiteCaptured: PieceType[] = [];
  const blackCaptured: PieceType[] = [];

  for (const piece of ['p', 'n', 'b', 'r', 'q'] as PieceType[]) {
    const blackMissing = INITIAL_COUNTS[piece] - (counts[piece] ?? 0);
    for (let i = 0; i < blackMissing; i++) whiteCaptured.push(piece);
    const whiteMissing = INITIAL_COUNTS[piece] - (counts[piece.toUpperCase()] ?? 0);
    for (let i = 0; i < whiteMissing; i++) blackCaptured.push(piece);
  }

  const whitePoints = whiteCaptured.reduce((s, p) => s + PIECE_VALUES[p], 0);
  const blackPoints = blackCaptured.reduce((s, p) => s + PIECE_VALUES[p], 0);

  return { whiteCaptured, blackCaptured, advantage: whitePoints - blackPoints };
}
