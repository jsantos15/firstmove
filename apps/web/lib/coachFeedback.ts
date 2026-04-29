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

export type CoachFeedbackTone = 'neutral' | 'positive' | 'payoff' | 'warning' | 'negative' | 'complete';

export interface CoachFeedback {
  id: string;
  classification: CoachMoveClassification;
  label: string;
  title: string;
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
  if (category === 'tactical_payoff' || category === 'forcing' || category === 'strategic' || category === 'setup') {
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
    (isOnlyGoodMove || isCriticalMove || (centipawnGain ?? 0) >= COACH_CLASSIFICATION_THRESHOLDS.greatGainCp) &&
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

function getCategoryMessage(
  category: ReturnType<typeof normalizeCategory>,
  moveSan: string,
  variationName: string,
  seed: string
) {
  if (category === 'tactical_payoff') {
    return pickStable(
      [
        `There it is. ${moveSan} is the moment the earlier pressure starts to pay off.`,
        `That is the point of the line. ${moveSan} turns the pressure into something concrete.`,
        `Good, now the idea has teeth. ${moveSan} makes Black deal with the tactic instead of playing freely.`,
      ],
      seed
    );
  }
  if (category === 'forcing') {
    return pickStable(
      [
        `Now you are asking a direct question. ${moveSan} limits the replies and keeps the initiative with you.`,
        `Good tempo. ${moveSan} makes the opponent respond to your idea before they get comfortable.`,
        `${moveSan} keeps the game on your terms. The opponent has fewer useful choices now.`,
      ],
      seed
    );
  }
  if (category === 'setup') {
    return pickStable(
      [
        `Nice quiet move. ${moveSan} prepares the position before you start forcing things.`,
        `This is useful patience. ${moveSan} gets the structure ready for the next idea.`,
        `${moveSan} does the groundwork. You are making the coming plan easier to play.`,
      ],
      seed
    );
  }
  return pickStable(
    [
      `${moveSan} fits the plan in ${variationName}. You improve first, then look for the payoff.`,
      `Good practical move. ${moveSan} keeps your pieces coordinated and your plan clear.`,
      `This keeps the line healthy. ${moveSan} improves the position without rushing.`,
    ],
    seed
  );
}

function getClassificationPresentation(classification: CoachMoveClassification) {
  switch (classification) {
    case 'brilliant':
      return { label: 'Brilliant', title: 'Brilliant idea', tone: 'payoff' as const };
    case 'great':
      return { label: 'Great', title: 'Great move', tone: 'positive' as const };
    case 'setup':
      return { label: 'Setup', title: 'Build the structure', tone: 'neutral' as const };
    case 'forcing':
      return { label: 'Forcing', title: 'Keep the initiative', tone: 'positive' as const };
    case 'payoff':
      return { label: 'Payoff', title: 'Tactical idea', tone: 'payoff' as const };
    case 'best':
      return { label: 'Best', title: 'Best move', tone: 'positive' as const };
    case 'excellent':
      return { label: 'Excellent', title: 'Excellent move', tone: 'positive' as const };
    case 'good':
      return { label: 'Good', title: 'Good move', tone: 'positive' as const };
    case 'inaccuracy':
      return { label: 'Inaccuracy', title: 'A little imprecise', tone: 'warning' as const };
    case 'mistake':
      return { label: 'Mistake', title: 'This loses ground', tone: 'negative' as const };
    case 'blunder':
      return { label: 'Blunder', title: 'Major problem', tone: 'negative' as const };
    case 'miss':
      return { label: 'Miss', title: 'Missed opportunity', tone: 'warning' as const };
    case 'wrong':
      return { label: 'Try again', title: 'Not this move', tone: 'negative' as const };
    case 'complete':
      return { label: 'Complete', title: 'Line complete', tone: 'complete' as const };
    case 'book':
    default:
      return { label: 'Book', title: 'Good opening move', tone: 'neutral' as const };
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
  if (classification === 'payoff' || classification === 'great' || classification === 'brilliant') return true;
  if (isFinalMove) return true;
  return delta !== null && Math.abs(delta) >= 50;
}

function buildEvalNote(after: number, delta: number | null) {
  if (delta !== null && delta >= 50) {
    return ` The engine also likes the progress: you are up to ${formatPawns(after)} now.`;
  }
  if (delta !== null && delta <= -50) {
    return ` The engine still keeps this playable at ${formatPawns(after)}, but be precise from here.`;
  }
  return ` The position is ${formatPawns(after)} for your side.`;
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
  if (delta !== null && delta >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp) return 'excellent';
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
  const { label, title, tone } = getClassificationPresentation(classification);

  const seed = `${input.variationName}:${input.moveIndex}:${input.moveSan}:${category}:${classification}`;
  const evalNote = shouldMentionEval({ classification, delta, after, isFinalMove: input.isFinalMove })
    ? buildEvalNote(after as number, delta)
    : '';
  const finalNote = input.isFinalMove ? ' Nice work, that finishes the line.' : '';
  const message = `${getCategoryMessage(category, input.moveSan, input.variationName, seed)}${evalNote}${finalNote}`;

  return {
    id: `move-${input.moveIndex}-${input.moveSan}`,
    classification,
    label,
    title,
    message,
    spokenText: `${label}. ${title}. ${message}`,
    tone,
  };
}

export function buildWrongMoveCoachFeedback(input: WrongMoveCoachInput): CoachFeedback {
  const attemptedText = input.attemptedSan ? `${input.attemptedSan} is not the move for this position.` : 'That is not the move for this position.';
  const message = `${attemptedText} In ${input.variationName}, look for ${input.expectedSan}.`;
  const presentation = getClassificationPresentation('wrong');

  return {
    id: `wrong-${input.moveIndex}-${input.attemptedSan ?? 'move'}-${input.expectedSan}`,
    classification: 'wrong',
    label: presentation.label,
    title: presentation.title,
    message,
    spokenText: `Try again. ${message}`,
    tone: presentation.tone,
  };
}
