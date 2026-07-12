import type { BoardMatrix, DetectedMove, InferredFenFields, PieceCode, SquareValue } from './types';

const FILES = 'abcdefgh';

export function squareName(row: number, col: number): string {
  return `${FILES[col]}${8 - row}`;
}

export function squareIndices(square: string): { row: number; col: number } | null {
  if (!/^[a-h][1-8]$/.test(square)) return null;
  return { col: FILES.indexOf(square[0]!), row: 8 - Number(square[1]) };
}

export function boardToFenPlacement(board: BoardMatrix): string {
  return board.map(row => {
    let empty = 0;
    let fen = '';
    for (const square of row) {
      if (!square) {
        empty++;
      } else {
        if (empty) fen += String(empty);
        fen += square;
        empty = 0;
      }
    }
    if (empty) fen += String(empty);
    return fen;
  }).join('/');
}

export function estimateCastling(board: BoardMatrix): string {
  let rights = '';
  if (board[7]?.[4] === 'K') {
    if (board[7]?.[7] === 'R') rights += 'K';
    if (board[7]?.[0] === 'R') rights += 'Q';
  }
  if (board[0]?.[4] === 'k') {
    if (board[0]?.[7] === 'r') rights += 'k';
    if (board[0]?.[0] === 'r') rights += 'q';
  }
  return rights || '-';
}

function isWhitePiece(piece: PieceCode): boolean {
  return piece === piece.toUpperCase();
}

function estimateEnPassant(move: DetectedMove | null): string {
  if (!move || move.source !== 'highlight' || move.piece.toLowerCase() !== 'p') return '-';
  const from = squareIndices(move.from);
  const to = squareIndices(move.to);
  if (!from || !to || from.col !== to.col || Math.abs(from.row - to.row) !== 2) return '-';
  return squareName((from.row + to.row) / 2, from.col);
}

export function estimateFullmove(board: BoardMatrix): number {
  const pieces = board.flat().filter((piece): piece is PieceCode => piece !== null);
  const pawns = pieces.filter(piece => piece.toLowerCase() === 'p').length;
  const queens = pieces.filter(piece => piece.toLowerCase() === 'q').length;
  let developed = 0;
  const initialMinorSquares: [number, number, SquareValue][] = [
    [0, 1, 'n'], [0, 2, 'b'], [0, 5, 'b'], [0, 6, 'n'],
    [7, 1, 'N'], [7, 2, 'B'], [7, 5, 'B'], [7, 6, 'N'],
  ];
  for (const [row, col, piece] of initialMinorSquares) if (board[row]?.[col] !== piece) developed++;

  if (pieces.length >= 30 && pawns >= 15 && developed <= 2) return 3;
  if (pieces.length >= 26 && pawns >= 12) return 10;
  if (pieces.length >= 18) return 20;
  if (pieces.length >= 10 || queens > 0) return 30;
  return 40;
}

export function inferFenFields(board: BoardMatrix, move: DetectedMove | null): InferredFenFields {
  const activeColor = move
    ? move.source === 'arrow'
      ? (isWhitePiece(move.piece) ? 'w' : 'b')
      : (isWhitePiece(move.piece) ? 'b' : 'w')
    : 'w';
  const castling = estimateCastling(board);
  const enPassant = estimateEnPassant(move);
  const highlightedMove = move?.source === 'highlight' ? move : null;
  const isPawnMove = highlightedMove?.piece.toLowerCase() === 'p';
  const halfmove = !highlightedMove || isPawnMove ? 0 : 1;
  const fullmove = estimateFullmove(board);

  return {
    activeColor,
    castling,
    enPassant,
    halfmove,
    fullmove,
    reasons: {
      activeColor: move
        ? `Estimated from the ${move.source === 'highlight' ? 'last-move highlight' : 'move arrow'} (${move.from}–${move.to})`
        : 'No clear highlight or arrow; defaulted to White',
      castling: castling === '-'
        ? 'No king-and-rook starting-square combination detected'
        : 'Estimated from kings and rooks on their starting squares',
      enPassant: enPassant === '-'
        ? 'No highlighted two-square pawn move detected'
        : `Passed-over square from ${move!.from}–${move!.to}`,
      halfmove: !highlightedMove
        ? 'No last move detected; defaulted to 0'
        : isPawnMove ? 'Detected pawn move; reset to 0' : 'Detected non-pawn move; estimated as 1',
      fullmove: `Coarse estimate from ${board.flat().filter(Boolean).length} remaining pieces and development`,
    },
  };
}

export function buildFen(board: BoardMatrix, fields: InferredFenFields): string {
  return `${boardToFenPlacement(board)} ${fields.activeColor} ${fields.castling} ${fields.enPassant} ${fields.halfmove} ${fields.fullmove}`;
}
