'use client';

import { Chessboard } from 'react-chessboard';
import Link from 'next/link';
import type { Opening } from '@firstmove/core';
import { getCharacteristicFen } from '@firstmove/core';
import { DifficultyBadge, ColorBadge, Badge } from '@/components/ui/Badge';
import { type MasteryLevel, MASTERY_LABELS, MASTERY_COLORS } from '@/hooks/useProgress';

interface OpeningCardProps {
  opening: Opening;
  mastery?: MasteryLevel;
}

export function OpeningCard({ opening, mastery }: OpeningCardProps) {
  const fen = getCharacteristicFen(opening);
  const lineCount = opening.variations.length;

  return (
    <Link href={`/openings/${opening.id}`}>
      <div className="group flex gap-4 rounded-xl border border-white/5 bg-[#1a1d27] p-4 transition-all duration-200 hover:border-white/15 hover:bg-[#1e2130] cursor-pointer">
        {/* Mini Board */}
        <div className="shrink-0 rounded-lg overflow-hidden w-[130px] h-[130px] pointer-events-none">
          <Chessboard
            position={fen}
            boardWidth={130}
            arePiecesDraggable={false}
            boardOrientation={opening.color === 'black' ? 'black' : 'white'}
            customBoardStyle={{ borderRadius: '8px' }}
            customDarkSquareStyle={{ backgroundColor: '#4a7c59' }}
            customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
          />
        </div>

        {/* Content */}
        <div className="flex flex-col justify-between flex-1 min-w-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <Badge variant="eco">{opening.ecoCode}</Badge>
              <ColorBadge color={opening.color} />
              <DifficultyBadge difficulty={opening.difficulty} />
            </div>
            <h3 className="font-semibold text-white text-base leading-tight group-hover:text-amber-400 transition-colors">
              {opening.name}
            </h3>
            <p className="mt-1.5 text-sm text-gray-400 leading-relaxed line-clamp-2">
              {opening.description}
            </p>
          </div>

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-500">
              {lineCount} {lineCount === 1 ? 'line' : 'lines'}
            </span>
            {mastery && mastery !== 'new' ? (
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className={`w-2 h-2 rounded-full ${MASTERY_COLORS[mastery]}`} />
                {MASTERY_LABELS[mastery]}
              </span>
            ) : (
              <span className="text-xs text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">
                Practice →
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
