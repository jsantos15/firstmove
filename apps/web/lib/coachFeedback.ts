import {
  buildGameAnalysisEventsFromAnalyzedGame,
  buildGameAnalysisSummaryEvents,
  buildGameAnalysisCoachCandidatesFromFacts,
  buildGameReviewReport,
  buildGameAnalysisMoveEvents,
  buildGameAnalysisMoveEventsFromAnalyzedGameMove,
  buildGameAnalysisMoveEventsFromEngine,
  buildAnalyzedGameFromPgn,
  buildOpeningPracticeMoveEvent,
  buildOpeningPracticeWrongMoveEvent,
  GAME_REVIEW_CATEGORIES,
  GAME_REVIEW_CATEGORY_LABELS,
  getAnalyzedGameMoveReviewCategory,
  COACH_CLASSIFICATION_THRESHOLDS,
  type CoachClassification,
  type CoachEvent,
  type CoachTone,
  type AnalyzedGame,
  type AnalyzedGameMove,
  type GameReviewCategory,
  type GameReviewReport,
  type GameAnalysisCoachCandidate,
  type GameAnalysisMoveEventInput,
  type GameAnalysisEngineMoveInput,
  type OpeningPracticeMoveEventInput,
  type OpeningPracticeWrongMoveEventInput,
} from '@firstmove/core';
import {
  renderCoachEvent,
  type RenderedCoachEvent,
} from '@firstmove/i18n';

export type CoachMoveClassification = CoachClassification;
export type CoachFeedbackTone = CoachTone;
export type CoachFeedback = RenderedCoachEvent;
export type CoachCandidateFeedback = GameAnalysisCoachCandidate;

export {
  COACH_CLASSIFICATION_THRESHOLDS,
  GAME_REVIEW_CATEGORIES,
  GAME_REVIEW_CATEGORY_LABELS,
  buildGameAnalysisCoachCandidatesFromFacts,
  buildGameReviewReport,
  buildAnalyzedGameFromPgn,
  getAnalyzedGameMoveReviewCategory,
};
export type { GameReviewCategory, GameReviewReport };

function renderGameAnalysisCoachEvents(events: CoachEvent[], locale?: string): CoachFeedback[] {
  return events.map(event => renderCoachEvent(event, locale));
}

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

type AnalyzedGameCoachInput = {
  game: AnalyzedGame;
  persona?: GameAnalysisEngineMoveInput['persona'];
  locale?: string;
};

type AnalyzedGameMoveCoachInput = {
  game: AnalyzedGame;
  move: AnalyzedGameMove;
  persona?: GameAnalysisEngineMoveInput['persona'];
  locale?: string;
};

export function buildMoveCoachFeedback(input: MoveCoachInput): CoachFeedback {
  return renderCoachEvent(buildOpeningPracticeMoveEvent(input), input.locale);
}

export function buildWrongMoveCoachFeedback(input: WrongMoveCoachInput): CoachFeedback {
  return renderCoachEvent(buildOpeningPracticeWrongMoveEvent(input), input.locale);
}

export function buildGameAnalysisCoachFeedback(input: GameAnalysisCoachInput): CoachFeedback[] {
  return renderGameAnalysisCoachEvents(buildGameAnalysisMoveEvents(input), input.locale);
}

export function buildGameAnalysisCoachFeedbackFromEngine(
  input: GameAnalysisEngineCoachInput
): CoachFeedback[] {
  return renderGameAnalysisCoachEvents(buildGameAnalysisMoveEventsFromEngine(input), input.locale);
}

export function buildGameAnalysisCoachFeedbackFromAnalyzedGame(
  input: AnalyzedGameCoachInput
): CoachFeedback[] {
  return renderGameAnalysisCoachEvents(
    buildGameAnalysisEventsFromAnalyzedGame(input),
    input.locale
  );
}

export function buildGameAnalysisSummaryFeedback(input: AnalyzedGameCoachInput): CoachFeedback[] {
  return buildGameAnalysisSummaryEvents(input).map(event => renderCoachEvent(event, input.locale));
}

export function buildGameAnalysisCoachFeedbackFromAnalyzedGameMove(
  input: AnalyzedGameMoveCoachInput
): CoachFeedback[] {
  return renderGameAnalysisCoachEvents(
    buildGameAnalysisMoveEventsFromAnalyzedGameMove(input),
    input.locale
  );
}

export function buildPrimaryGameAnalysisCoachFeedback(
  input: GameAnalysisCoachInput
): CoachFeedback | null {
  return buildGameAnalysisCoachFeedback(input)[0] ?? null;
}

export function buildPrimaryGameAnalysisCoachFeedbackFromEngine(
  input: GameAnalysisEngineCoachInput
): CoachFeedback | null {
  return buildGameAnalysisCoachFeedbackFromEngine(input)[0] ?? null;
}

export function buildPrimaryGameAnalysisCoachFeedbackFromAnalyzedGameMove(
  input: AnalyzedGameMoveCoachInput
): CoachFeedback | null {
  return buildGameAnalysisCoachFeedbackFromAnalyzedGameMove(input)[0] ?? null;
}
