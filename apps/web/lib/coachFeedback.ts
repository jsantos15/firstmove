import { formatMessage, type CoachMessageVariables, type I18nMessageKey } from '@firstmove/i18n';

export type CoachMoveClassification =
  | 'brilliant'
  | 'great'
  | 'book'
  | 'setup'
  | 'forcing'
  | 'payoff'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'miss'
  | 'wrong'
  | 'complete';

export type CoachFeedbackTone =
  | 'neutral'
  | 'positive'
  | 'payoff'
  | 'warning'
  | 'negative'
  | 'complete';

export interface CoachFeedback {
  id: string;
  classification: CoachMoveClassification;
  labelKey: I18nMessageKey;
  label: string;
  titleKey: I18nMessageKey;
  title: string;
  messageKey: I18nMessageKey;
  messageKeys: I18nMessageKey[];
  spokenTextKey: I18nMessageKey;
  variables: CoachMessageVariables;
  message: string;
  spokenText: string;
  tone: CoachFeedbackTone;
}

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

export interface CoachNarrationPayload {
  opening: {
    color: OpeningColor;
    variationName: string;
  };
  move: {
    san: string;
    plyIndex: number;
    moveNumber: number;
    isFinalMove: boolean;
  };
  classification: CoachMoveClassification;
  lineCategory: ReturnType<typeof normalizeCategory>;
  evaluation: {
    beforeCp: number | null;
    afterCp: number | null;
    deltaCp: number | null;
    perspective: 'trained_side';
  };
  style: {
    audience: 'beginner_intermediate';
    tone: 'friendly_chess_coach';
    maxWords: 45;
  };
}

interface WrongMoveCoachInput {
  attemptedSan?: string;
  expectedSan: string;
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

function pickStable<T>(items: readonly T[], seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return items[hash % items.length];
}

function moveNumberFromPly(moveIndex: number) {
  return Math.floor(moveIndex / 2) + 1;
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

function getCategoryMessageKey(
  category: ReturnType<typeof normalizeCategory>,
  seed: string
): I18nMessageKey {
  if (category === 'tactical_payoff') {
    return pickStable(
      [
        'coach.expected.tactical_payoff.0',
        'coach.expected.tactical_payoff.1',
        'coach.expected.tactical_payoff.2',
      ],
      seed
    );
  }
  if (category === 'forcing') {
    return pickStable(
      ['coach.expected.forcing.0', 'coach.expected.forcing.1', 'coach.expected.forcing.2'],
      seed
    );
  }
  if (category === 'setup') {
    return pickStable(
      ['coach.expected.setup.0', 'coach.expected.setup.1', 'coach.expected.setup.2'],
      seed
    );
  }
  return pickStable(
    ['coach.expected.strategic.0', 'coach.expected.strategic.1', 'coach.expected.strategic.2'],
    seed
  );
}

function getClassificationPresentation(classification: CoachMoveClassification): {
  labelKey: I18nMessageKey;
  titleKey: I18nMessageKey;
  tone: CoachFeedbackTone;
} {
  switch (classification) {
    case 'brilliant':
      return {
        labelKey: 'coach.label.brilliant',
        titleKey: 'coach.title.brilliant',
        tone: 'payoff' as const,
      };
    case 'great':
      return {
        labelKey: 'coach.label.great',
        titleKey: 'coach.title.great',
        tone: 'positive' as const,
      };
    case 'setup':
      return {
        labelKey: 'coach.label.setup',
        titleKey: 'coach.title.setup',
        tone: 'neutral' as const,
      };
    case 'forcing':
      return {
        labelKey: 'coach.label.forcing',
        titleKey: 'coach.title.forcing',
        tone: 'positive' as const,
      };
    case 'payoff':
      return {
        labelKey: 'coach.label.payoff',
        titleKey: 'coach.title.payoff',
        tone: 'payoff' as const,
      };
    case 'best':
      return {
        labelKey: 'coach.label.best',
        titleKey: 'coach.title.best',
        tone: 'positive' as const,
      };
    case 'excellent':
      return {
        labelKey: 'coach.label.excellent',
        titleKey: 'coach.title.excellent',
        tone: 'positive' as const,
      };
    case 'good':
      return {
        labelKey: 'coach.label.good',
        titleKey: 'coach.title.good',
        tone: 'positive' as const,
      };
    case 'inaccuracy':
      return {
        labelKey: 'coach.label.inaccuracy',
        titleKey: 'coach.title.inaccuracy',
        tone: 'warning' as const,
      };
    case 'mistake':
      return {
        labelKey: 'coach.label.mistake',
        titleKey: 'coach.title.mistake',
        tone: 'negative' as const,
      };
    case 'blunder':
      return {
        labelKey: 'coach.label.blunder',
        titleKey: 'coach.title.blunder',
        tone: 'negative' as const,
      };
    case 'miss':
      return {
        labelKey: 'coach.label.miss',
        titleKey: 'coach.title.miss',
        tone: 'warning' as const,
      };
    case 'wrong':
      return {
        labelKey: 'coach.label.wrong',
        titleKey: 'coach.title.wrong',
        tone: 'negative' as const,
      };
    case 'complete':
      return {
        labelKey: 'coach.label.complete',
        titleKey: 'coach.title.complete',
        tone: 'complete' as const,
      };
    case 'book':
    default:
      return {
        labelKey: 'coach.label.book',
        titleKey: 'coach.title.book',
        tone: 'neutral' as const,
      };
  }
}

function shouldMentionEval({
  classification,
  delta,
  after,
  isFinalMove,
}: {
  classification: CoachMoveClassification;
  delta: number | null;
  after: number | null;
  isFinalMove?: boolean;
}) {
  if (after === null) return false;
  if (classification === 'payoff' || classification === 'great' || classification === 'brilliant')
    return true;
  if (isFinalMove) return true;
  return delta !== null && Math.abs(delta) >= 50;
}

function buildEvalNote(after: number, delta: number | null) {
  if (delta !== null && delta >= 50) {
    return {
      key: 'coach.eval.progress' as const,
      variables: { evalPawns: formatPawns(after) },
    };
  }
  if (delta !== null && delta <= -50) {
    return {
      key: 'coach.eval.precision' as const,
      variables: { evalPawns: formatPawns(after) },
    };
  }
  return {
    key: 'coach.eval.position' as const,
    variables: { evalPawns: formatPawns(after) },
  };
}

export function buildCoachNarrationPayload(input: MoveCoachInput): CoachNarrationPayload {
  const before = toTrainedSideEval(input.beforeEvalCp, input.openingColor);
  const after = toTrainedSideEval(input.afterEvalCp, input.openingColor);
  const delta = before === null || after === null ? null : after - before;
  const category = normalizeCategory(input.primaryCategory);
  const classification = classifyExpectedOpeningMove({
    category,
    delta,
    isFinalMove: input.isFinalMove,
  });

  return {
    opening: {
      color: input.openingColor,
      variationName: input.variationName,
    },
    move: {
      san: input.moveSan,
      plyIndex: input.moveIndex,
      moveNumber: moveNumberFromPly(input.moveIndex),
      isFinalMove: Boolean(input.isFinalMove),
    },
    classification,
    lineCategory: category,
    evaluation: {
      beforeCp: before,
      afterCp: after,
      deltaCp: delta,
      perspective: 'trained_side',
    },
    style: {
      audience: 'beginner_intermediate',
      tone: 'friendly_chess_coach',
      maxWords: 45,
    },
  };
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

export function buildMoveCoachFeedback(input: MoveCoachInput): CoachFeedback {
  const before = toTrainedSideEval(input.beforeEvalCp, input.openingColor);
  const after = toTrainedSideEval(input.afterEvalCp, input.openingColor);
  const delta = before === null || after === null ? null : after - before;
  const category = normalizeCategory(input.primaryCategory);
  const classification = classifyExpectedOpeningMove({
    category,
    delta,
    isFinalMove: input.isFinalMove,
  });
  const { labelKey, titleKey, tone } = getClassificationPresentation(classification);

  const seed = `${input.variationName}:${input.moveIndex}:${input.moveSan}:${category}:${classification}`;
  const variables: CoachMessageVariables = {
    moveSan: input.moveSan,
    variationName: input.variationName,
  };
  const messageKey = getCategoryMessageKey(category, seed);
  const messageParts = [formatMessage(messageKey, variables, input.locale)];
  const messageKeys = [messageKey];
  if (shouldMentionEval({ classification, delta, after, isFinalMove: input.isFinalMove })) {
    const evalNote = buildEvalNote(after as number, delta);
    messageKeys.push(evalNote.key);
    Object.assign(variables, evalNote.variables);
    messageParts.push(formatMessage(evalNote.key, evalNote.variables, input.locale));
  }
  if (input.isFinalMove) {
    messageKeys.push('coach.final');
    messageParts.push(formatMessage('coach.final', {}, input.locale));
  }

  const label = formatMessage(labelKey, {}, input.locale);
  const title = formatMessage(titleKey, {}, input.locale);
  const message = messageParts.join('');
  const spokenTextKey = 'coach.spoken';
  const spokenText = formatMessage(spokenTextKey, { label, title, message }, input.locale);

  return {
    id: `move-${input.moveIndex}-${input.moveSan}`,
    classification,
    labelKey,
    label,
    titleKey,
    title,
    messageKey,
    messageKeys,
    spokenTextKey,
    variables,
    message,
    spokenText,
    tone,
  };
}

export function buildWrongMoveCoachFeedback(input: WrongMoveCoachInput): CoachFeedback {
  const variables: CoachMessageVariables = {
    attemptedSan: input.attemptedSan,
    expectedSan: input.expectedSan,
    variationName: input.variationName,
  };
  const messageKey = input.attemptedSan ? 'coach.wrong.attempted' : 'coach.wrong.generic';
  const message = formatMessage(messageKey, variables, input.locale);
  const presentation = getClassificationPresentation('wrong');
  const label = formatMessage(presentation.labelKey, {}, input.locale);
  const title = formatMessage(presentation.titleKey, {}, input.locale);
  const spokenTextKey = 'coach.spoken.wrong';

  return {
    id: `wrong-${input.moveIndex}-${input.attemptedSan ?? 'move'}-${input.expectedSan}`,
    classification: 'wrong',
    labelKey: presentation.labelKey,
    label,
    titleKey: presentation.titleKey,
    title,
    messageKey,
    messageKeys: [messageKey],
    spokenTextKey,
    variables,
    message,
    spokenText: formatMessage(spokenTextKey, { message }, input.locale),
    tone: presentation.tone,
  };
}
