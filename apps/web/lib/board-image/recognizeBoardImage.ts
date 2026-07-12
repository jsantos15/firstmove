import { detectBoardCandidates } from './boardDetection';
import { buildFen, inferFenFields, squareName } from './fenInference';
import {
  BoardDetectionError,
  PIECE_CODES,
  type BoardMatrix,
  type BoardRecognitionResult,
  type DetectedMove,
  type SquareValue,
} from './types';

const MODEL_URL = '/models/board-recognition/piece-classifier.onnx';
const ASSET_ROOT = '/models/board-recognition/';
const MAX_DETECTION_DIMENSION = 1200;

type OrtModule = typeof import('onnxruntime-web/wasm');
type OrtSession = Awaited<ReturnType<OrtModule['InferenceSession']['create']>>;

let sessionPromise: Promise<{ ort: OrtModule; session: OrtSession }> | null = null;

async function getSession(): Promise<{ ort: OrtModule; session: OrtSession }> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      ort.env.wasm.wasmPaths = ASSET_ROOT;
      const session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      return { ort, session };
    })();
  }
  return sessionPromise;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The selected file could not be decoded as an image.'));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function imageCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(1, MAX_DETECTION_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas image processing is not available in this browser.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cropBoard(source: HTMLCanvasElement, x: number, y: number, size: number): HTMLCanvasElement {
  const crop = document.createElement('canvas');
  crop.width = 512;
  crop.height = 512;
  const context = crop.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas image processing is not available in this browser.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, x, y, size, size, 0, 0, 512, 512);
  return crop;
}

async function classifySquares(crop: HTMLCanvasElement): Promise<{ pieces: SquareValue[]; confidences: number[] }> {
  const input = new Float32Array(64 * 3 * 64 * 64);
  const squareCanvas = document.createElement('canvas');
  squareCanvas.width = 64;
  squareCanvas.height = 64;
  const context = squareCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas image processing is not available in this browser.');

  for (let square = 0; square < 64; square++) {
    const row = Math.floor(square / 8);
    const col = square % 8;
    context.clearRect(0, 0, 64, 64);
    context.drawImage(crop, col * 64, row * 64, 64, 64, 0, 0, 64, 64);
    const rgba = context.getImageData(0, 0, 64, 64).data;
    for (let p = 0; p < 64 * 64; p++) {
      const batchOffset = square * 3 * 64 * 64;
      input[batchOffset + p] = rgba[p * 4]! / 255;
      input[batchOffset + 64 * 64 + p] = rgba[p * 4 + 1]! / 255;
      input[batchOffset + 2 * 64 * 64 + p] = rgba[p * 4 + 2]! / 255;
    }
  }

  const { ort, session } = await getSession();
  const outputs = await session.run({ squares: new ort.Tensor('float32', input, [64, 3, 64, 64]) });
  const logits = outputs.logits?.data as Float32Array | undefined;
  if (!logits) throw new Error('The board recognition model returned no predictions.');

  const pieces: SquareValue[] = [];
  const confidences: number[] = [];
  for (let square = 0; square < 64; square++) {
    let best = 0;
    let maxLogit = -Infinity;
    for (let cls = 0; cls < 13; cls++) {
      const value = logits[square * 13 + cls]!;
      if (value > maxLogit) {
        best = cls;
        maxLogit = value;
      }
    }
    let denominator = 0;
    for (let cls = 0; cls < 13; cls++) denominator += Math.exp(logits[square * 13 + cls]! - maxLogit);
    pieces.push(PIECE_CODES[best] ?? null);
    confidences.push(1 / denominator);
  }
  return { pieces, confidences };
}

function orientationScore(pieces: SquareValue[]): number {
  let score = 0;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (!piece) continue;
    const row = Math.floor(i / 8);
    const weight = piece.toLowerCase() === 'p' ? 1 : piece.toLowerCase() === 'k' ? 1.5 : 0.5;
    score += (piece === piece.toUpperCase() ? row - 3.5 : 3.5 - row) * weight;
  }
  return score;
}

function canonicalize<T>(values: T[], blackAtBottom: boolean): T[] {
  return blackAtBottom ? [...values].reverse() : values;
}

function matrix(values: SquareValue[]): BoardMatrix {
  return Array.from({ length: 8 }, (_, row) => values.slice(row * 8, row * 8 + 8));
}

type Rgb = [number, number, number];

function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function medianRgb(values: Rgb[]): Rgb {
  return [median(values.map(v => v[0])), median(values.map(v => v[1])), median(values.map(v => v[2]))];
}

function inspectOverlays(crop: HTMLCanvasElement): { highlights: number[]; arrowCells: number[] } {
  const context = crop.getContext('2d', { willReadFrequently: true })!;
  const { data } = context.getImageData(0, 0, 512, 512);
  const cornerColors: Rgb[][] = Array.from({ length: 64 }, () => []);
  const offsets = [6, 12, 52, 58];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = row * 8 + col;
      for (const oy of offsets) for (const ox of offsets) {
        const i = (((row * 64 + oy) * 512) + col * 64 + ox) * 4;
        cornerColors[square]!.push([data[i]!, data[i + 1]!, data[i + 2]!]);
      }
    }
  }

  const squareColors = cornerColors.map(medianRgb);
  const parityColors: [Rgb, Rgb] = [
    medianRgb(squareColors.filter((_, i) => (Math.floor(i / 8) + i % 8) % 2 === 0)),
    medianRgb(squareColors.filter((_, i) => (Math.floor(i / 8) + i % 8) % 2 === 1)),
  ];
  const greenCounts = new Array<number>(64).fill(0);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = row * 8 + col;
      const base = parityColors[((row + col) % 2) as 0 | 1];
      for (let y = 4; y < 60; y += 2) for (let x = 4; x < 60; x += 2) {
        const i = (((row * 64 + y) * 512) + col * 64 + x) * 4;
        const rgb: Rgb = [data[i]!, data[i + 1]!, data[i + 2]!];
        const [r, g, b] = rgb;
        if (g > 75 && g > r * 1.2 && g > b * 1.12 && rgbDistance(rgb, base) > 38) greenCounts[square]++;
      }
    }
  }
  const highlightScores = squareColors.map((color, i) =>
    rgbDistance(color, parityColors[((Math.floor(i / 8) + i % 8) % 2) as 0 | 1])
  );
  const ranked = highlightScores.map((score, i) => ({ score, i })).sort((a, b) => b.score - a.score);
  const highlights = ranked.length >= 2
    && ranked[1]!.score > 34
    && rgbDistance(squareColors[ranked[0]!.i]!, squareColors[ranked[1]!.i]!) < 70
      ? [ranked[0]!.i, ranked[1]!.i]
      : [];

  const arrowCells = greenCounts
    .map((count, i) => ({ count, i }))
    .filter(item => item.count > 35 && !highlights.includes(item.i))
    .sort((a, b) => b.count - a.count)
    .map(item => item.i);
  return { highlights, arrowCells };
}

function canonicalIndex(imageIndex: number, blackAtBottom: boolean): number {
  return blackAtBottom ? 63 - imageIndex : imageIndex;
}

function inferMove(
  overlays: { highlights: number[]; arrowCells: number[] },
  imagePieces: SquareValue[],
  board: BoardMatrix,
  blackAtBottom: boolean,
): DetectedMove | null {
  if (overlays.highlights.length === 2) {
    const occupied = overlays.highlights.filter(index => imagePieces[index] !== null);
    const empty = overlays.highlights.filter(index => imagePieces[index] === null);
    if (occupied.length === 1 && empty.length === 1) {
      const toIndex = canonicalIndex(occupied[0]!, blackAtBottom);
      const fromIndex = canonicalIndex(empty[0]!, blackAtBottom);
      const piece = board[Math.floor(toIndex / 8)]?.[toIndex % 8];
      if (piece) return {
        from: squareName(Math.floor(fromIndex / 8), fromIndex % 8),
        to: squareName(Math.floor(toIndex / 8), toIndex % 8),
        piece,
        source: 'highlight',
      };
    }
  }

  if (overlays.arrowCells.length >= 2) {
    const occupiedArrowCells = overlays.arrowCells.filter(index => imagePieces[index] !== null);
    const sourceImageIndex = occupiedArrowCells.length === 1 ? occupiedArrowCells[0] : undefined;
    const destinationImageIndex = overlays.arrowCells.find(index => imagePieces[index] === null);
    if (sourceImageIndex !== undefined && destinationImageIndex !== undefined) {
      const fromIndex = canonicalIndex(sourceImageIndex, blackAtBottom);
      const toIndex = canonicalIndex(destinationImageIndex, blackAtBottom);
      const piece = board[Math.floor(fromIndex / 8)]?.[fromIndex % 8];
      if (piece) return {
        from: squareName(Math.floor(fromIndex / 8), fromIndex % 8),
        to: squareName(Math.floor(toIndex / 8), toIndex % 8),
        piece,
        source: 'arrow',
      };
    }
  }
  return null;
}

export async function recognizeBoardImage(file: File): Promise<BoardRecognitionResult> {
  const image = await loadImage(file);
  const source = imageCanvas(image);
  const sourceContext = source.getContext('2d', { willReadFrequently: true })!;
  const imageData = sourceContext.getImageData(0, 0, source.width, source.height);
  const candidates = detectBoardCandidates(imageData);
  if (candidates.length === 0) {
    throw new BoardDetectionError('none', 'No digital chessboard was detected. Use a clear screenshot with the full board visible.');
  }
  if (candidates.length > 1) {
    throw new BoardDetectionError('multiple', `More than one chessboard was detected (${candidates.length}). Please use an image containing exactly one board.`);
  }

  const bounds = candidates[0]!;
  const crop = cropBoard(source, bounds.x, bounds.y, bounds.size);
  const { pieces: imagePieces, confidences: imageConfidences } = await classifySquares(crop);
  const blackAtBottom = orientationScore(imagePieces) < 0;
  const canonicalPieces = canonicalize(imagePieces, blackAtBottom);
  const canonicalConfidences = canonicalize(imageConfidences, blackAtBottom);
  const board = matrix(canonicalPieces);
  const overlays = inspectOverlays(crop);
  const detectedMove = inferMove(overlays, imagePieces, board, blackAtBottom);
  const fields = inferFenFields(board, detectedMove);
  const sortedConfidence = [...canonicalConfidences].sort((a, b) => a - b);

  return {
    board,
    bounds,
    orientation: blackAtBottom ? 'black' : 'white',
    confidence: sortedConfidence[Math.floor(sortedConfidence.length * 0.2)] ?? 0,
    squareConfidences: canonicalConfidences,
    detectedMove,
    fields,
    fen: buildFen(board, fields),
    cropDataUrl: crop.toDataURL('image/png'),
  };
}
