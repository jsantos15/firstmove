import { StyleSheet, View } from 'react-native';
import { Svg, Rect, SvgXml } from 'react-native-svg';
import { COLORS } from '../../lib/constants';
import { PIECE_SVGS } from './pieceSvgs';

interface MiniBoardProps {
  fen?: string;
  size?: number;
  orientation?: 'white' | 'black';
  showPieces?: boolean;
}

interface PieceInfo {
  type: string;
  color: 'w' | 'b';
  rank: number;
  file: number;
}

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

export function MiniBoard({
  fen = STARTING_FEN,
  size = 160,
  orientation = 'white',
  showPieces = true,
}: MiniBoardProps) {
  const sq = size / 8;
  const pieces = showPieces ? parseFen(fen) : [];

  const toX = (file: number) =>
    orientation === 'white' ? file * sq : (7 - file) * sq;
  const toY = (rank: number) =>
    orientation === 'white' ? (7 - rank) * sq : rank * sq;

  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }}>
      {/* Board squares */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
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
      </Svg>

      {/* Pieces use bundled cburnett SVGs to avoid per-card remote fetches. */}
      {pieces.map((piece, i) => {
        const code = `${piece.color}${piece.type.toUpperCase()}`;
        const xml = PIECE_SVGS[code];
        if (!xml) return null;

        return (
          <SvgXml
            key={i}
            xml={xml}
            width={sq}
            height={sq}
            style={{
              position: 'absolute',
              left: toX(piece.file),
              top: toY(piece.rank),
            }}
          />
        );
      })}
    </View>
  );
}
