'use client';

import { Book, Star, Check, X } from 'lucide-react';
import type { GameReviewCategory } from '@/lib/coachFeedback';

// Single source of truth for classification color, shared by this badge and the analysis
// page's Game Review legend dot (which imports this as CLASSIFICATION_DOT).
export const CLASSIFICATION_COLOR: Record<GameReviewCategory, string> = {
  brilliant: 'bg-cyan-400',
  great: 'bg-blue-400',
  book: 'bg-orange-300',
  // Good/best/excellent share one "regular" green — they're all flavors of "fine move",
  // so there's no reason to tell them apart by shade the way the actual outliers are.
  best: 'bg-green-500',
  excellent: 'bg-green-500',
  good: 'bg-green-500',
  inaccuracy: 'bg-yellow-400',
  mistake: 'bg-orange-400',
  miss: 'bg-rose-400',
  blunder: 'bg-red-500',
};

// Same hue as CLASSIFICATION_COLOR, as a text-* class for coloring the move label itself
// (chess.com shows the SAN in the badge's color, not just the badge). Written out as full
// literal class names — Tailwind's scanner needs the complete string, not a "bg-"→"text-"
// swap done at runtime — rather than every category having an entry.
export const MOVE_LABEL_TEXT_COLOR: Partial<Record<GameReviewCategory, string>> = {
  brilliant: 'text-cyan-400',
  great: 'text-blue-400',
  best: 'text-green-500',
  excellent: 'text-green-500',
  good: 'text-green-500',
  inaccuracy: 'text-yellow-400',
  mistake: 'text-orange-400',
  miss: 'text-rose-400',
  blunder: 'text-red-500',
};

// Book/excellent/good/best moves are the common case — left unbadged, shown in the
// default text color, reserving the badge for moves worth noticing.
export const UNBADGED_REVIEW_CATEGORIES: readonly GameReviewCategory[] = ['book', 'excellent', 'good', 'best'];

function ClassificationGlyph({ category }: { category: GameReviewCategory }) {
  switch (category) {
    case 'brilliant':
      return <span aria-hidden>!!</span>;
    case 'great':
      return <span aria-hidden>!</span>;
    case 'inaccuracy':
      return <span aria-hidden>?!</span>;
    case 'mistake':
      return <span aria-hidden>?</span>;
    case 'blunder':
      return <span aria-hidden>??</span>;
    // Real icons from lucide-react below. Star/ThumbsUp are closed single-path shapes, so
    // filling them solid (fill=currentColor, stroke=none) reads as a proper solid glyph
    // rather than just an outline; Book/Check/X stay stroke-only since that's their actual
    // shape (Book's silhouette isn't a closed region, Check/X are bare line strokes).
    case 'book':
      return <Book aria-hidden strokeWidth={2.25} className="h-[76%] w-[76%]" />;
    case 'best':
      return <Star aria-hidden fill="currentColor" stroke="none" className="h-[80%] w-[80%]" />;
    // ThumbsUp's own two paths (hand/thumb blob + a separate wrist/cuff line) inlined
    // directly rather than rendered through the <ThumbsUp> component: a white-on-white
    // stroke for that line is technically present but invisible at badge size, so the
    // cuff line is stroked in the badge's own green (bg-green-500's hex) instead of
    // currentColor, cutting a visible seam into the solid white fill.
    case 'excellent':
      return (
        <svg viewBox="0 0 24 24" aria-hidden className="h-[78%] w-[78%]">
          <path fill="currentColor" d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
          <path stroke="#22c55e" strokeWidth={1.75} strokeLinecap="round" d="M7 10v12" />
        </svg>
      );
    case 'good':
      return <Check aria-hidden strokeWidth={3} className="h-[76%] w-[76%]" />;
    case 'miss':
      return <X aria-hidden strokeWidth={3} className="h-[70%] w-[70%]" />;
  }
}

// Chess.com-style circular move-quality badge — a colored disc with the classification's
// symbol, matching the icon set on their game review screen (!!, !, book, star, thumbs-up,
// check, ?!, ?, x, ??). Sizing is a single `size` in px; text glyphs scale off it directly
// since they're centered characters rather than a fixed-viewBox svg.
export function MoveClassificationIcon({
  category,
  size = 20,
  className = '',
}: {
  category: GameReviewCategory;
  size?: number;
  className?: string;
}) {
  const isTextGlyph = ['brilliant', 'great', 'inaccuracy', 'mistake', 'blunder'].includes(category);
  return (
    <span
      role="img"
      aria-label={category}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white ${CLASSIFICATION_COLOR[category]} ${className}`}
      style={{ width: size, height: size, fontSize: isTextGlyph ? size * 0.62 : undefined }}
    >
      <span className="flex items-center justify-center font-bold leading-none">
        <ClassificationGlyph category={category} />
      </span>
    </span>
  );
}
