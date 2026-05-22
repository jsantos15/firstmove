import { Svg, Rect, Text as SvgText, G } from 'react-native-svg';
import { COLORS } from '../../lib/constants';

interface MiniBoardProps {
  fen?: string;
  size?: number;
  orientation?: 'white' | 'black';
}

interface PieceInfo {
  type: string;
  color: 'w' | 'b';
  rank: number;
  file: number;
}

const PIECE_UNICODE: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
};

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function parseFen(fen: string): PieceInfo[] {
  const boardPart = fen.split(' ')[0];
  const ranks = boardPart.split('/');
  const pieces: PieceInfo[] = [];

  for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
    const rankStr = ranks[rankIdx];
    if (!rankStr) continue;
    let fileIdx = 0;
    for (const char of rankStr) {
      if (char >= '1' && char <= '8') {
        fileIdx += parseInt(char, 10);
      } else {
        pieces.push({
          type: char.toLowerCase(),
          color: char === char.toUpperCase() ? 'w' : 'b',
          rank: 7 - rankIdx,
          file: fileIdx,
        });
        fileIdx++;
      }
    }
  }
  return pieces;
}

export function MiniBoard({ fen = STARTING_FEN, size = 160, orientation = 'white' }: MiniBoardProps) {
  const sq = size / 8;
  const pieces = parseFen(fen);
  const fontSize = sq * 0.72;

  const toX = (file: number) =>
    orientation === 'white' ? file * sq : (7 - file) * sq;
  const toY = (rank: number) =>
    orientation === 'white' ? (7 - rank) * sq : rank * sq;

  return (
    <Svg width={size} height={size}>
      {/* Board squares */}
      {Array.from({ length: 8 }, (_, rank) =>
        Array.from({ length: 8 }, (_, file) => {
          const isLight = (rank + file) % 2 === 0;
          return (
            <Rect
              key={`${rank}-${file}`}
              x={toX(file)}
              y={toY(rank)}
              width={sq}
              height={sq}
              fill={isLight ? COLORS.boardLight : COLORS.boardDark}
            />
          );
        })
      )}

      {/* Pieces — render stroke layer first, then fill layer on top */}
      {pieces.map((piece, i) => {
        const char = PIECE_UNICODE[`${piece.color}${piece.type}`];
        if (!char) return null;
        const cx = toX(piece.file) + sq / 2;
        const cy = toY(piece.rank) + sq / 2 + fontSize * 0.36;
        const isWhite = piece.color === 'w';

        return (
          <G key={i}>
            {/* Outline layer */}
            <SvgText
              x={cx}
              y={cy}
              fontSize={fontSize}
              textAnchor="middle"
              fill="none"
              stroke={isWhite ? '#5c3d1a' : 'rgba(255,255,255,0.7)'}
              strokeWidth={isWhite ? 2 : 1.5}
            >
              {char}
            </SvgText>
            {/* Fill layer */}
            <SvgText
              x={cx}
              y={cy}
              fontSize={fontSize}
              textAnchor="middle"
              fill={isWhite ? '#ffffff' : '#1a0a00'}
              stroke="none"
            >
              {char}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
