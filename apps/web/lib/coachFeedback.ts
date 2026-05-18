import {
  buildGameAnalysisEventsFromAnalyzedGame,
  buildGameAnalysisCoachCandidatesFromFacts,
  buildGameAnalysisMoveEvents,
  buildGameAnalysisMoveEventsFromAnalyzedGameMove,
  buildGameAnalysisMoveEventsFromEngine,
  buildAnalyzedGameFromPgn,
  buildOpeningPracticeMoveEvent,
  buildOpeningPracticeWrongMoveEvent,
  classifyAnalyzedMoveByCentipawnLoss,
  COACH_CLASSIFICATION_THRESHOLDS,
  selectComplementaryGameAnalysisEvent,
  type CoachClassification,
  type CoachEvent,
  type CoachTone,
  type AnalyzedGame,
  type AnalyzedGameMove,
  type GameAnalysisCoachCandidate,
  type GameAnalysisMoveEventInput,
  type GameAnalysisEngineMoveInput,
  type OpeningPracticeMoveEventInput,
  type OpeningPracticeWrongMoveEventInput,
} from '@firstmove/core';
import {
  renderCoachEvent,
  renderCoachEventComposition,
  type RenderedCoachEvent,
} from '@firstmove/i18n';

export type CoachMoveClassification = CoachClassification;
export type CoachFeedbackTone = CoachTone;
export type CoachFeedback = RenderedCoachEvent;
export type CoachCandidateFeedback = GameAnalysisCoachCandidate;

export {
  COACH_CLASSIFICATION_THRESHOLDS,
  buildGameAnalysisCoachCandidatesFromFacts,
  buildAnalyzedGameFromPgn,
  classifyAnalyzedMoveByCentipawnLoss,
};

function renderGameAnalysisCoachEvents(events: CoachEvent[], locale?: string): CoachFeedback[] {
  const primary = events[0];
  const secondary = selectComplementaryGameAnalysisEvent(events);

  return events.map((event, index) =>
    index === 0
      ? renderCoachEventComposition({ primary: event, secondary, locale })
      : renderCoachEvent(event, locale)
  );
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
