'use client';

import { useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import Link from 'next/link';
import type { OpeningIndexRow } from '@firstmove/supabase';
import { ColorBadge, DifficultyBadge } from '@/components/ui/Badge';
import type { MasteryLevel } from '@/hooks/useProgress';
import { useBoardSettings } from '@/hooks/useBoardSettings';
import { getCustomPieces } from '@/lib/piecesets';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpeningCardProps {
  opening: OpeningIndexRow;
  completedLines?: number;
  status?: MasteryLevel;
}

function getCharacteristicFen(opening: OpeningIndexRow): string {
  return opening.course_preview_fen ?? opening.anchor_fen ?? 'start';
}

// ─── Status chip config ───────────────────────────────────────────────────────

const STATUS_CHIP: Record<Exclude<MasteryLevel, 'new'>, { label: string; cls: string }> = {
  learned:   { label: 'Learned',   cls: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  completed: { label: 'Completed', cls: 'text-blue-400  bg-blue-400/10  border-blue-400/20'  },
  mastered:  { label: 'Mastered',  cls: 'text-green-400 bg-green-400/10 border-green-400/20' },
};

// ─── Line progress dots ───────────────────────────────────────────────────────

function LineDots({ completed, total }: { completed: number; total: number }) {
  if (total === 0) return null;

  // Up to 10 lines: individual dots
  if (total <= 10) {
    return (
      <div className="flex items-center gap-1.25">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`w-1.75 h-1.75 rounded-full ${
              i < completed ? 'bg-amber-400' : 'bg-white/15'
            }`}
          />
        ))}
      </div>
    );
  }

  // More than 10: thin progress bar + fraction text
  const pct = (completed / total) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-0.75 w-16 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-gray-500">{completed}/{total}</span>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function OpeningCard({ opening, completedLines = 0, status = 'new' }: OpeningCardProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [showBoard, setShowBoard] = useState(false);
  const fen = getCharacteristicFen(opening);
  const totalLines = opening.variation_count ?? 0;
  const chip = status !== 'new' ? STATUS_CHIP[status] : null;
  const { theme, settings } = useBoardSettings();
  const customPieces = getCustomPieces(settings.pieceSetId);
  const hasCourse = Boolean(opening.course_slug);
  const boardOrientation =
    settings.flipBoard
      ? opening.course_color === 'black'
        ? 'white'
        : 'black'
      : opening.course_color === 'black'
      ? 'black'
      : 'white';

  useEffect(() => {
    if (showBoard) return;
    const node = previewRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setShowBoard(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '160px',
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [showBoard]);

  const card = (
    <div className={`group rounded-xl border border-white/5 bg-[var(--bg-panel)] overflow-hidden transition-all duration-200 ${
      hasCourse
        ? 'hover:border-amber-400/20 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 cursor-pointer'
        : 'opacity-90'
    }`}>

        {/* Board preview — sits in a darker panel so it floats */}
        <div ref={previewRef} className="flex items-center justify-center bg-[var(--bg-sidebar)] py-5 pointer-events-none">
          <div className="rounded-lg overflow-hidden ring-1 ring-white/8">
            {showBoard ? (
              <Chessboard
                position={fen}
                boardWidth={180}
                arePiecesDraggable={false}
                boardOrientation={boardOrientation}
                customDarkSquareStyle={{ backgroundColor: theme.dark }}
                customLightSquareStyle={{ backgroundColor: theme.light }}
                customPieces={customPieces}
                animationDuration={0}
              />
            ) : (
              <div className="h-[180px] w-[180px] bg-[linear-gradient(135deg,rgba(255,255,255,0.06)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.06)_50%,rgba(255,255,255,0.06)_75%,transparent_75%,transparent)] bg-[length:45px_45px]" />
            )}
          </div>
        </div>

        {/* Info panel */}
        <div className="p-4">

          {/* Status + course metadata */}
          <div className="flex items-center gap-1.5 mb-2.5">
            {opening.course_color && <ColorBadge color={opening.course_color} />}
            {opening.course_difficulty && <DifficultyBadge difficulty={opening.course_difficulty} />}
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              hasCourse
                ? 'border-green-400/20 bg-green-400/10 text-green-400'
                : 'border-amber-400/20 bg-amber-400/10 text-amber-400'
            }`}>
              {hasCourse ? 'Available' : 'Coming soon'}
            </span>
          </div>

          {/* Opening name */}
          <h3 className="font-semibold text-white text-sm leading-snug mb-3 group-hover:text-amber-400 transition-colors line-clamp-2">
            {opening.name}
          </h3>

          {/* Progress row */}
          <div className="flex items-center justify-between gap-2">
            <LineDots completed={completedLines} total={totalLines} />
            <span className="text-[11px] text-gray-600 shrink-0">
              {totalLines} {totalLines === 1 ? 'variation' : 'variations'}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500 truncate">
              {opening.popularity_games?.toLocaleString() ?? 'Unknown'} games
            </span>
            {chip ? (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0 ${chip.cls}`}>
                {chip.label}
              </span>
            ) : (
              <span className="text-[11px] text-gray-600 shrink-0">
                {opening.eco_code}
              </span>
            )}
          </div>

        </div>
      </div>
  );

  if (!opening.course_slug) {
    return <div className="block">{card}</div>;
  }

  return (
    <Link href={`/openings/${opening.course_slug}`} className="block">
      {card}
    </Link>
  );
}
