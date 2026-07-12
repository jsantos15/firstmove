export const PIECE_CODES = ['P', 'R', 'N', 'B', 'Q', 'K', 'p', 'r', 'n', 'b', 'q', 'k', null] as const;

export type PieceCode = Exclude<(typeof PIECE_CODES)[number], null>;
export type SquareValue = PieceCode | null;
export type BoardMatrix = SquareValue[][];

export interface BoardBounds {
  x: number;
  y: number;
  size: number;
  score: number;
}

export interface DetectedMove {
  from: string;
  to: string;
  piece: PieceCode;
  source: 'highlight' | 'arrow';
}

export interface InferredFenFields {
  activeColor: 'w' | 'b';
  castling: string;
  enPassant: string;
  halfmove: number;
  fullmove: number;
  reasons: {
    activeColor: string;
    castling: string;
    enPassant: string;
    halfmove: string;
    fullmove: string;
  };
}

export interface BoardRecognitionResult {
  board: BoardMatrix;
  bounds: BoardBounds;
  orientation: 'white' | 'black';
  confidence: number;
  squareConfidences: number[];
  detectedMove: DetectedMove | null;
  fields: InferredFenFields;
  fen: string;
  cropDataUrl: string;
}

export class BoardDetectionError extends Error {
  constructor(public readonly code: 'none' | 'multiple', message: string) {
    super(message);
    this.name = 'BoardDetectionError';
  }
}
