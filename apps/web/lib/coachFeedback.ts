import {
  buildGameAnalysisMoveEvents,
  buildGameAnalysisMoveEventsFromEngine,
  buildPrimaryGameAnalysisMoveEvent,
  buildPrimaryGameAnalysisMoveEventFromEngine,
  buildOpeningPracticeMoveEvent,
  buildOpeningPracticeWrongMoveEvent,
  classifyAnalyzedMoveByCentipawnLoss,
  COACH_CLASSIFICATION_THRESHOLDS,
  type CoachClassification,
  type CoachTone,
  type GameAnalysisMoveEventInput,
  type GameAnalysisEngineMoveInput,
  type OpeningPracticeMoveEventInput,
  type OpeningPracticeWrongMoveEventInput,
} from '@firstmove/core';
import { renderCoachEvent, type RenderedCoachEvent } from '@firstmove/i18n';

export type CoachMoveClassification = CoachClassification;
export type CoachFeedbackTone = CoachTone;
export type CoachFeedback = RenderedCoachEvent;

export { COACH_CLASSIFICATION_THRESHOLDS, classifyAnalyzedMoveByCentipawnLoss };

type MoveCoachInput = OpeningPracticeMoveEventInput & {
  locale?: string;
};

type WrongMoveCoachInput = OpeningPracticeWrongMoveEventInput & {
  locale?: string;
};

type GameAnalysisCoachInput = GameAnalysisMoveEventInput & {
  locale?: string;
};

type GameAnalysisEngineCoachInput = GameAnalysisEngineMoveInput & {
  locale?: string;
};

export function buildMoveCoachFeedback(input: MoveCoachInput): CoachFeedback {
  return renderCoachEvent(buildOpeningPracticeMoveEvent(input), input.locale);
}

export function buildWrongMoveCoachFeedback(input: WrongMoveCoachInput): CoachFeedback {
  return renderCoachEvent(buildOpeningPracticeWrongMoveEvent(input), input.locale);
}

export function buildGameAnalysisCoachFeedback(input: GameAnalysisCoachInput): CoachFeedback[] {
  return buildGameAnalysisMoveEvents(input).map(event => renderCoachEvent(event, input.locale));
}

export function buildGameAnalysisCoachFeedbackFromEngine(
  input: GameAnalysisEngineCoachInput
): CoachFeedback[] {
  return buildGameAnalysisMoveEventsFromEngine(input).map(event =>
    renderCoachEvent(event, input.locale)
  );
}

export function buildPrimaryGameAnalysisCoachFeedback(
  input: GameAnalysisCoachInput
): CoachFeedback | null {
  const event = buildPrimaryGameAnalysisMoveEvent(input);
  return event ? renderCoachEvent(event, input.locale) : null;
}

export function buildPrimaryGameAnalysisCoachFeedbackFromEngine(
  input: GameAnalysisEngineCoachInput
): CoachFeedback | null {
  const event = buildPrimaryGameAnalysisMoveEventFromEngine(input);
  return event ? renderCoachEvent(event, input.locale) : null;
}
