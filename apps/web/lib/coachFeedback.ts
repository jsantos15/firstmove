export type CoachMoveClassification =
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
  excellentGainCp: 80,
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

function normalizeCategory(category?: LineCategory) {
  if (category === 'tactical_payoff' || category === 'forcing' || category === 'strategic' || category === 'setup') {
    return category;
  }
  return 'strategic';
}

export function classifyAnalyzedMoveByCentipawnLoss({
  centipawnLoss,
  isBestMove,
  isBookMove,
  missedOpportunityCp,
}: {
  centipawnLoss: number;
  isBestMove?: boolean;
  isBookMove?: boolean;
  missedOpportunityCp?: number;
}): CoachMoveClassification {
  if (isBookMove) return 'book';
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

function getCategoryMessage(category: ReturnType<typeof normalizeCategory>, moveSan: string, variationName: string) {
  if (category === 'tactical_payoff') {
    return `${moveSan} keeps the tactical idea alive in ${variationName}. The point is not just to make a move, but to make the opponent answer your threat.`;
  }
  if (category === 'forcing') {
    return `${moveSan} is forcing. It narrows the opponent's choices, which is exactly what you want in this line.`;
  }
  if (category === 'setup') {
    return `${moveSan} is a setup move. You are getting the pieces to the squares this opening is built around.`;
  }
  return `${moveSan} follows the plan for ${variationName}. You improve the position without rushing the payoff.`;
}

function getClassificationPresentation(classification: CoachMoveClassification) {
  switch (classification) {
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

  const evalNote =
    after === null
      ? ''
      : ` The resulting position is ${formatPawns(after)} for your side.`;
  const finalNote = input.isFinalMove ? ' That finishes the line.' : '';
  const message = `${getCategoryMessage(category, input.moveSan, input.variationName)}${evalNote}${finalNote}`;

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
