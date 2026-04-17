import type { ReactElement } from 'react';

// Local type mirroring react-chessboard's CustomPieces (not on its public API)
type CustomPieceFn = (args: { isDragging: boolean; squareWidth: number }) => ReactElement;
type CustomPieces = { [key: string]: CustomPieceFn };

// ─── Piece set definitions ────────────────────────────────────────────────────

export interface PieceSetDef {
  id: string;
  label: string;
  description: string;
  /** Lichess asset set name */
  lichessName: string;
}

export const PIECE_SETS: PieceSetDef[] = [
  { id: 'cburnett', label: 'Classic',  description: 'Lichess default Staunton',          lichessName: 'cburnett' },
  { id: 'merida',   label: 'Merida',   description: 'Traditional elegant Staunton',      lichessName: 'merida'   },
  { id: 'alpha',    label: 'Alpha',    description: 'Flat, character-based letterforms',  lichessName: 'alpha'    },
  { id: 'fantasy',  label: 'Fantasy',  description: 'Illustrated cartoon style',          lichessName: 'fantasy'  },
  { id: 'maestro',  label: 'Maestro',  description: 'Refined thin-stroke Staunton',      lichessName: 'maestro'  },
  { id: 'cardinal', label: 'Cardinal', description: 'Bold modern design',                lichessName: 'cardinal' },
  { id: 'staunty',  label: 'Staunty',  description: 'Flat minimalist Staunton',          lichessName: 'staunty'  },
];

const PIECE_CODES = [
  'wK', 'wQ', 'wR', 'wB', 'wN', 'wP',
  'bK', 'bQ', 'bR', 'bB', 'bN', 'bP',
] as const;

// ─── Builder ──────────────────────────────────────────────────────────────────

// jsDelivr serves Lichess's MIT-licensed piece SVGs from their GitHub repo
// with proper CDN caching — reliable for production use.
const CDN = 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece';

export function buildCustomPieces(lichessName: string): CustomPieces {
  return Object.fromEntries(
    PIECE_CODES.map(code => [
      code,
      ({ squareWidth }: { squareWidth: number }) => (
        <img
          src={`${CDN}/${lichessName}/${code}.svg`}
          style={{ width: squareWidth, height: squareWidth, display: 'block' }}
          alt={code}
          draggable={false}
        />
      ),
    ])
  ) as CustomPieces;
}

export function getCustomPieces(setId: string): CustomPieces | undefined {
  const def = PIECE_SETS.find(s => s.id === setId);
  if (!def) return undefined;
  return buildCustomPieces(def.lichessName);
}

export function getPreviewUrl(set: PieceSetDef, code: string): string {
  return `${CDN}/${set.lichessName}/${code}.svg`;
}
