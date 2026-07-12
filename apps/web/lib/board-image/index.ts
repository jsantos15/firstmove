export { detectBoardCandidates } from './boardDetection';
export {
  boardToFenPlacement,
  buildFen,
  estimateCastling,
  estimateFullmove,
  inferFenFields,
  squareIndices,
  squareName,
} from './fenInference';
export { recognizeBoardImage } from './recognizeBoardImage';
export { BoardDetectionError, PIECE_CODES } from './types';
export type {
  BoardBounds,
  BoardMatrix,
  BoardRecognitionResult,
  DetectedMove,
  InferredFenFields,
  PieceCode,
  SquareValue,
} from './types';
