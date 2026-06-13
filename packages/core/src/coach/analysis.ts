import type { CoachClassification } from './index';

export const GAME_REVIEW_CATEGORIES = [
  'brilliant',
  'great',
  'book',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
] as const;

export type GameReviewCategory = (typeof GAME_REVIEW_CATEGORIES)[number];

export const GAME_REVIEW_CATEGORY_LABELS = {
  brilliant: 'Brilliant',
  great: 'Great',
  book: 'Book',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  miss: 'Miss',
  blunder: 'Blunder',
} as const satisfies Record<GameReviewCategory, string>;

export const COACH_CLASSIFICATION_THRESHOLDS = {
  greatGainCp: 120,
  excellentGainCp: 80,
  brilliantMaxLossCp: 10,
  greatMaxLossCp: 20,
  goodLossCp: 45,
  inaccuracyLossCp: 90,
  mistakeLossCp: 180,
  blunderLossCp: 300,
  missOpportunityCp: 150,
} as const;

export function classifyAnalyzedMoveByCentipawnLoss({
  centipawnLoss,
  centipawnGain,
  isBestMove,
  isBookMove,
  isSacrifice,
  isOnlyGoodMove,
  isCriticalMove,
  missedOpportunityCp,
}: {
  centipawnLoss: number;
  centipawnGain?: number;
  isBestMove?: boolean;
  isBookMove?: boolean;
  isSacrifice?: boolean;
  isOnlyGoodMove?: boolean;
  isCriticalMove?: boolean;
  missedOpportunityCp?: number;
}): CoachClassification {
  return buildGameReviewCategory({
    centipawnLoss,
    centipawnGain,
    isBestMove,
    isBookMove,
    isSacrifice,
    isOnlyGoodMove,
    isCriticalMove,
    missedOpportunityCp,
  });
}

export function buildGameReviewCategory({
  centipawnLoss,
  centipawnGain,
  isBestMove,
  isBookMove,
  isSacrifice,
  isOnlyGoodMove,
  isCriticalMove,
  missedOpportunityCp,
}: {
  centipawnLoss: number;
  centipawnGain?: number;
  isBestMove?: boolean;
  isBookMove?: boolean;
  isSacrifice?: boolean;
  isOnlyGoodMove?: boolean;
  isCriticalMove?: boolean;
  missedOpportunityCp?: number;
}): GameReviewCategory {
  if (isBookMove) return 'book';
  if (
    isBestMove &&
    isSacrifice &&
    centipawnLoss <= COACH_CLASSIFICATION_THRESHOLDS.brilliantMaxLossCp
  ) {
    return 'brilliant';
  }
  if (
    isBestMove &&
    (isOnlyGoodMove ||
      isCriticalMove ||
      (centipawnGain ?? 0) >= COACH_CLASSIFICATION_THRESHOLDS.greatGainCp) &&
    centipawnLoss <= COACH_CLASSIFICATION_THRESHOLDS.greatMaxLossCp
  ) {
    return 'great';
  }
  if (isBestMove || centipawnLoss <= 10) return 'best';
  if (
    typeof missedOpportunityCp === 'number' &&
    missedOpportunityCp >= COACH_CLASSIFICATION_THRESHOLDS.missOpportunityCp
  ) {
    return 'miss';
  }
  if (centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.blunderLossCp) return 'blunder';
  if (centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.mistakeLossCp) return 'mistake';
  if (centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.inaccuracyLossCp) return 'inaccuracy';
  if (centipawnLoss <= COACH_CLASSIFICATION_THRESHOLDS.goodLossCp) return 'excellent';
  return 'good';
}
