import type { CSSProperties, ReactElement } from 'react';

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
  /** Extra CSS applied to each piece <img> */
  imgStyle?: React.CSSProperties;
}

// Only sets with commercial-compatible licenses.
// GPLv2+ : cburnett, merida
// MIT     : fantasy, spatial, celtic
// Apache 2: chessnut
// CC BY 4 : kiwen-suwi, firi
// CC BY-SA: shapes
// CC0     : rhosgfx
export const PIECE_SETS: PieceSetDef[] = [
  { id: 'cburnett',  label: 'Classic',    description: 'Lichess default Staunton',     lichessName: 'cburnett'  },
  { id: 'merida',    label: 'Merida',     description: 'Traditional elegant Staunton', lichessName: 'merida'    },
  { id: 'fantasy',   label: 'Fantasy',    description: 'Illustrated cartoon style',    lichessName: 'fantasy'   },
  { id: 'spatial',   label: 'Spatial',    description: 'Modern 3D-style pieces',       lichessName: 'spatial'   },
  { id: 'celtic',    label: 'Celtic',     description: 'Ornate Celtic design',         lichessName: 'celtic'    },
  { id: 'chessnut',  label: 'Chessnut',   description: 'Clean modern look',            lichessName: 'chessnut'  },
  { id: 'kiwen-suwi',label: 'Kiwen-Suwi', description: 'Abstract geometric pieces',   lichessName: 'kiwen-suwi'},
  { id: 'firi',      label: 'Firi',       description: 'Stylized flat pieces',         lichessName: 'firi'      },
  { id: 'shapes',    label: 'Shapes',     description: 'Abstract shape-based pieces',  lichessName: 'shapes'    },
  { id: 'rhosgfx',   label: 'Rhosgfx',   description: 'Public domain classic set',    lichessName: 'rhosgfx'   },
];

const PIECE_CODES = [
  'wK', 'wQ', 'wR', 'wB', 'wN', 'wP',
  'bK', 'bQ', 'bR', 'bB', 'bN', 'bP',
] as const;

// ─── Builder ──────────────────────────────────────────────────────────────────

// jsDelivr serves Lichess's MIT-licensed piece SVGs from their GitHub repo
// with proper CDN caching — reliable for production use.
const CDN = 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece';

export function buildCustomPieces(lichessName: string, imgStyle?: CSSProperties): CustomPieces {
  return Object.fromEntries(
    PIECE_CODES.map(code => [
      code,
      ({ squareWidth }: { squareWidth: number }) => (
        <img
          src={`${CDN}/${lichessName}/${code}.svg`}
          style={{ width: squareWidth, height: squareWidth, display: 'block', ...imgStyle }}
          alt={code}
          draggable={false}
          onDragStart={event => event.preventDefault()}
        />
      ),
    ])
  ) as CustomPieces;
}

export function getCustomPieces(setId: string): CustomPieces | undefined {
  const def = PIECE_SETS.find(s => s.id === setId);
  if (!def) return undefined;
  return buildCustomPieces(def.lichessName, def.imgStyle);
}

export function getPreviewUrl(set: PieceSetDef, code: string): string {
  return `${CDN}/${set.lichessName}/${code}.svg`;
}
