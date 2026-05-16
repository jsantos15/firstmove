import {
  type CoachAnalysisFacts,
  type CoachClassification,
  type CoachEvent,
  type CoachEventType,
  type CoachEventVariables,
  type CoachSeverity,
  type CoachThemeTag,
  type CoachTone,
} from '@firstmove/core';
import { renderCoachEvent, type RenderedCoachEvent } from '@firstmove/i18n';

export type CoachMoveClassification = CoachClassification;
export type CoachFeedbackTone = CoachTone;
export type CoachFeedback = RenderedCoachEvent;

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

type OpeningColor = 'white' | 'black';
type LineCategory = 'setup' | 'strategic' | 'tactical_payoff' | 'forcing' | string;

interface MoveCoachInput {
  openingColor: OpeningColor;
  openingId?: string;
  variationId?: string;
  variationName: string;
  moveSan: string;
  moveIndex: number;
  moveCount: number;
  beforeEvalCp?: number;
  afterEvalCp?: number;
  primaryCategory?: LineCategory;
  isFinalMove?: boolean;
  locale?: string;
}

interface WrongMoveCoachInput {
  attemptedSan?: string;
  expectedSan: string;
  openingId?: string;
  variationId?: string;
  variationName: string;
  moveIndex: number;
  locale?: string;
}

function toTrainedSideEval(evalCp: number | undefined, openingColor: OpeningColor) {
  if (typeof evalCp !== 'number' || !Number.isFinite(evalCp)) return null;
  return openingColor === 'white' ? evalCp : -evalCp;
}

function formatPawns(cp: number) {
  if (Math.abs(cp) < 10) return 'level';
  return `${cp > 0 ? '+' : '-'}${(Math.abs(cp) / 100).toFixed(1)}`;
}

function normalizeCategory(category?: LineCategory) {
  if (
    category === 'tactical_payoff' ||
    category === 'forcing' ||
    category === 'strategic' ||
    category === 'setup'
  ) {
    return category;
  }
  return 'strategic';
}

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
}): CoachMoveClassification {
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

function classifyExpectedOpeningMove({
  category,
  delta,
  isFinalMove,
}: {
  category: ReturnType<typeof normalizeCategory>;
  delta: number | null;
  isFinalMove?: boolean;
}): CoachMoveClassification {
  if (isFinalMove) return 'complete';
  if (category === 'tactical_payoff') return 'payoff';
  if (category === 'forcing') return 'forcing';
  if (category === 'setup') return 'setup';
  if (delta !== null && delta >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp)
    return 'excellent';
  return 'book';
}

function eventTone(classification: CoachClassification): CoachTone {
  if (classification === 'complete') return 'complete';
  if (classification === 'wrong' || classification === 'mistake' || classification === 'blunder')
    return 'negative';
  if (classification === 'miss' || classification === 'inaccuracy') return 'warning';
  if (classification === 'payoff' || classification === 'brilliant') return 'payoff';
  if (
    classification === 'great' ||
    classification === 'best' ||
    classification === 'excellent' ||
    classification === 'good' ||
    classification === 'forcing'
  ) {
    return 'positive';
  }
  return 'neutral';
}

function eventSeverity(classification: CoachClassification): CoachSeverity {
  if (classification === 'blunder') return 'critical';
  if (classification === 'mistake' || classification === 'miss') return 'major';
  if (classification === 'inaccuracy' || classification === 'wrong') return 'medium';
  return 'info';
}

function openingEventType({
  category,
  classification,
  delta,
}: {
  category: ReturnType<typeof normalizeCategory>;
  classification: CoachClassification;
  delta: number | null;
}): CoachEventType {
  if (classification === 'complete') return 'line_complete';
  if (category === 'tactical_payoff') return 'tactical_payoff';
  if (category === 'forcing') return 'opening_forcing';
  if (category === 'setup') return 'opening_setup';
  if (delta !== null && delta >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp) {
    return 'eval_gain';
  }
  return 'opening_book_move';
}

function categoryThemeTags(category: ReturnType<typeof normalizeCategory>): CoachThemeTag[] {
  if (category === 'tactical_payoff') return ['initiative', 'material'];
  if (category === 'forcing') return ['initiative', 'tempo'];
  if (category === 'setup') return ['development'];
  return ['piece_activity'];
}

function cleanVariables(variables: CoachEventVariables): CoachEventVariables {
  return Object.fromEntries(
    Object.entries(variables).filter(([, value]) => value !== null && typeof value !== 'undefined')
  );
}

export function buildMoveCoachEvent(input: MoveCoachInput): CoachEvent {
  const before = toTrainedSideEval(input.beforeEvalCp, input.openingColor);
  const after = toTrainedSideEval(input.afterEvalCp, input.openingColor);
  const delta = before === null || after === null ? null : after - before;
  const category = normalizeCategory(input.primaryCategory);
  const classification = classifyExpectedOpeningMove({
    category,
    delta,
    isFinalMove: input.isFinalMove,
  });
  const eventType = openingEventType({ category, classification, delta });
  const variables = cleanVariables({
    moveSan: input.moveSan,
    variationName: input.variationName,
    evalPawns: after === null ? null : formatPawns(after),
  });
  const analysisFacts: CoachAnalysisFacts = cleanVariables({
    beforeCp: before,
    afterCp: after,
    deltaCp: delta,
    moveCount: input.moveCount,
    openingColor: input.openingColor,
    lineCategory: category,
  });

  return {
    id: `opening:${input.openingId ?? 'unknown'}:${input.variationId ?? input.variationName}:${
      input.moveIndex
    }:${eventType}`,
    domain: 'opening_practice',
    subject: {
      kind: 'opening_line',
      id: input.variationId ?? input.variationName,
      parentId: input.openingId,
    },
    plyIndex: input.moveIndex,
    eventType,
    classification,
    tone: eventTone(classification),
    severity: eventSeverity(classification),
    phase: 'opening',
    themeTags: categoryThemeTags(category),
    persona: 'neutral',
    messageKey: '',
    spokenKey: '',
    variables,
    analysisFacts,
    source: 'opening_practice',
    contentVersion: 1,
  };
}

export function buildWrongMoveCoachEvent(input: WrongMoveCoachInput): CoachEvent {
  const variables = cleanVariables({
    attemptedSan: input.attemptedSan ?? null,
    expectedSan: input.expectedSan,
    variationName: input.variationName,
  });

  return {
    id: `opening:${input.openingId ?? 'unknown'}:${input.variationId ?? input.variationName}:${
      input.moveIndex
    }:wrong_move`,
    domain: 'opening_practice',
    subject: {
      kind: 'opening_line',
      id: input.variationId ?? input.variationName,
      parentId: input.openingId,
    },
    plyIndex: input.moveIndex,
    eventType: 'wrong_move',
    classification: 'wrong',
    tone: 'negative',
    severity: 'medium',
    phase: 'opening',
    themeTags: [],
    persona: 'neutral',
    messageKey: input.attemptedSan
      ? 'coach.event.wrong_move.message'
      : 'coach.event.wrong_move.generic_message',
    spokenKey: 'coach.spoken.wrong_move',
    variables,
    analysisFacts: {
      expectedSan: input.expectedSan,
      ...(input.attemptedSan ? { attemptedSan: input.attemptedSan } : {}),
    },
    source: 'opening_practice',
    contentVersion: 1,
  };
}

export function buildMoveCoachFeedback(input: MoveCoachInput): CoachFeedback {
  return renderCoachEvent(buildMoveCoachEvent(input), input.locale);
}

export function buildWrongMoveCoachFeedback(input: WrongMoveCoachInput): CoachFeedback {
  return renderCoachEvent(buildWrongMoveCoachEvent(input), input.locale);
}
