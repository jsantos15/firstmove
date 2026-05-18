import { COACH_CLASSIFICATION_THRESHOLDS, classifyAnalyzedMoveByCentipawnLoss } from './analysis';
import type {
  CoachAnalysisFacts,
  CoachClassification,
  CoachEvent,
  CoachEventType,
  CoachEventVariables,
  CoachGamePhase,
  CoachPersona,
  CoachSeverity,
  CoachThemeTag,
  CoachTone,
} from './index';

export interface GameAnalysisMoveEventInput {
  gameId: string;
  moveSan: string;
  plyIndex: number;
  phase: CoachGamePhase;
  beforeEvalCp?: number;
  afterEvalCp?: number;
  centipawnLoss?: number;
  centipawnGain?: number;
  bestMoveSan?: string;
  isBestMove?: boolean;
  isOnlyGoodMove?: boolean;
  isCriticalMove?: boolean;
  isSacrifice?: boolean;
  missedOpportunityCp?: number;
  themeTags?: CoachThemeTag[];
  persona?: CoachPersona;
}

export type GameAnalysisSide = 'white' | 'black';

export interface GameAnalysisEngineMoveInput {
  gameId: string;
  moveSan: string;
  plyIndex: number;
  playedBy: GameAnalysisSide;
  phase: CoachGamePhase;
  beforeEvalCp?: number;
  afterPlayedEvalCp: number;
  afterBestEvalCp?: number;
  bestMoveSan?: string;
  isOnlyGoodMove?: boolean;
  isCriticalMove?: boolean;
  isSacrifice?: boolean;
  themeTags?: CoachThemeTag[];
  persona?: CoachPersona;
}

export interface AnalyzedGameMove {
  id?: string;
  san: string;
  plyIndex: number;
  playedBy: GameAnalysisSide;
  phase: CoachGamePhase;
  beforeEvalCp?: number;
  afterPlayedEvalCp: number;
  afterBestEvalCp?: number;
  bestMoveSan?: string;
  isOnlyGoodMove?: boolean;
  isCriticalMove?: boolean;
  isSacrifice?: boolean;
  themeTags?: CoachThemeTag[];
}

export interface AnalyzedGame {
  id: string;
  pgn?: string;
  initialFen?: string;
  moves: AnalyzedGameMove[];
}

export interface GameAnalysisEventsFromGameInput {
  game: AnalyzedGame;
  persona?: CoachPersona;
}

function formatPawns(cp: number) {
  if (Math.abs(cp) < 10) return 'level';
  return `${cp > 0 ? '+' : '-'}${(Math.abs(cp) / 100).toFixed(1)}`;
}

function toPlayerPerspective(evalCp: number | undefined, playedBy: GameAnalysisSide) {
  if (typeof evalCp !== 'number' || !Number.isFinite(evalCp)) return undefined;
  return playedBy === 'white' ? evalCp : -evalCp;
}

function cleanVariables(variables: CoachEventVariables): CoachEventVariables {
  return Object.fromEntries(
    Object.entries(variables).filter(([, value]) => value !== null && typeof value !== 'undefined')
  );
}

function eventTone(classification: CoachClassification): CoachTone {
  if (classification === 'blunder' || classification === 'mistake') return 'negative';
  if (classification === 'miss' || classification === 'inaccuracy') return 'warning';
  if (classification === 'brilliant' || classification === 'great') return 'payoff';
  return 'positive';
}

function eventSeverity(classification: CoachClassification): CoachSeverity {
  if (classification === 'blunder') return 'critical';
  if (classification === 'mistake' || classification === 'miss') return 'major';
  if (classification === 'inaccuracy') return 'medium';
  return 'info';
}

function hasTacticalTheme(themeTags: CoachThemeTag[] = []) {
  return themeTags.some(themeTag =>
    ['fork', 'pin', 'skewer', 'discovered_attack', 'mate_threat'].includes(themeTag)
  );
}

function missedOpportunityEventType(missedOpportunityCp?: number): CoachEventType {
  if (
    typeof missedOpportunityCp === 'number' &&
    missedOpportunityCp >= COACH_CLASSIFICATION_THRESHOLDS.blunderLossCp
  ) {
    return 'missed_win';
  }
  return 'missed_tactic';
}

function moveQualityEventType(
  classification: CoachClassification,
  input: GameAnalysisMoveEventInput
): CoachEventType {
  if (classification === 'brilliant') return 'brilliant_move';
  if (classification === 'great') return 'great_move';
  if (classification === 'best') {
    return input.isOnlyGoodMove || input.isCriticalMove ? 'only_move' : 'best_move';
  }
  if (classification === 'excellent' || classification === 'good') {
    if (
      hasTacticalTheme(input.themeTags) &&
      (input.centipawnGain ?? 0) >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp
    ) {
      return 'tactic_found';
    }
    if ((input.centipawnGain ?? 0) >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp) {
      return 'advantage_gained';
    }
    return 'good_move';
  }
  if (classification === 'inaccuracy') return 'inaccuracy';
  if (classification === 'mistake') return 'mistake';
  if (classification === 'blunder') return 'blunder';
  if (classification === 'miss') return missedOpportunityEventType(input.missedOpportunityCp);
  return input.centipawnLoss && input.centipawnLoss > 0 ? 'eval_loss' : 'eval_gain';
}

function buildGameAnalysisEvent({
  input,
  eventType,
  classification,
  extraVariables = {},
  extraFacts = {},
  themeTags = input.themeTags ?? [],
}: {
  input: GameAnalysisMoveEventInput;
  eventType: CoachEventType;
  classification: CoachClassification;
  extraVariables?: CoachEventVariables;
  extraFacts?: CoachAnalysisFacts;
  themeTags?: CoachThemeTag[];
}): CoachEvent {
  const variables = cleanVariables({
    moveSan: input.moveSan,
    bestMoveSan: input.bestMoveSan ?? null,
    evalPawns:
      typeof input.afterEvalCp === 'number' && Number.isFinite(input.afterEvalCp)
        ? formatPawns(input.afterEvalCp)
        : null,
    ...extraVariables,
  });
  const analysisFacts: CoachAnalysisFacts = cleanVariables({
    beforeCp: input.beforeEvalCp ?? null,
    afterCp: input.afterEvalCp ?? null,
    centipawnLoss: input.centipawnLoss ?? null,
    centipawnGain: input.centipawnGain ?? null,
    bestMoveSan: input.bestMoveSan ?? null,
    isBestMove: input.isBestMove ?? null,
    isOnlyGoodMove: input.isOnlyGoodMove ?? null,
    isCriticalMove: input.isCriticalMove ?? null,
    isSacrifice: input.isSacrifice ?? null,
    missedOpportunityCp: input.missedOpportunityCp ?? null,
    ...extraFacts,
  });

  return {
    id: `game:${input.gameId}:${input.plyIndex}:${eventType}`,
    domain: 'game_analysis',
    subject: {
      kind: 'game',
      id: input.gameId,
    },
    plyIndex: input.plyIndex,
    eventType,
    classification,
    tone: eventTone(classification),
    severity: eventSeverity(classification),
    persona: input.persona ?? 'neutral',
    phase: input.phase,
    themeTags,
    messageKey: '',
    spokenKey: '',
    variables,
    analysisFacts,
    source: input.themeTags?.length ? 'tactical_detector' : 'engine_analysis',
    contentVersion: 1,
  };
}

export function buildGameAnalysisMoveEvents(input: GameAnalysisMoveEventInput): CoachEvent[] {
  const events: CoachEvent[] = [];
  const centipawnLoss = input.centipawnLoss ?? 0;
  const centipawnGain = input.centipawnGain ?? 0;
  const classification = classifyAnalyzedMoveByCentipawnLoss({
    centipawnLoss,
    centipawnGain,
    isBestMove: input.isBestMove,
    isSacrifice: input.isSacrifice,
    isOnlyGoodMove: input.isOnlyGoodMove,
    isCriticalMove: input.isCriticalMove,
    missedOpportunityCp: input.missedOpportunityCp,
  });

  if (
    typeof input.missedOpportunityCp === 'number' &&
    input.missedOpportunityCp >= COACH_CLASSIFICATION_THRESHOLDS.missOpportunityCp &&
    input.bestMoveSan
  ) {
    events.push(
      buildGameAnalysisEvent({
        input,
        eventType: missedOpportunityEventType(input.missedOpportunityCp),
        classification: 'miss',
        themeTags: input.themeTags?.length ? input.themeTags : ['initiative'],
      })
    );
  }

  if (centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.inaccuracyLossCp) {
    const lossClassification =
      classification === 'miss'
        ? classifyAnalyzedMoveByCentipawnLoss({
            centipawnLoss,
            centipawnGain,
            isBestMove: input.isBestMove,
            isSacrifice: input.isSacrifice,
            isOnlyGoodMove: input.isOnlyGoodMove,
            isCriticalMove: input.isCriticalMove,
          })
        : classification;

    events.push(
      buildGameAnalysisEvent({
        input,
        eventType: moveQualityEventType(lossClassification, {
          ...input,
          missedOpportunityCp: undefined,
        }),
        classification: lossClassification,
      })
    );
  }

  if (input.isBestMove || centipawnLoss <= 10) {
    const bestClassification = classifyAnalyzedMoveByCentipawnLoss({
      centipawnLoss,
      centipawnGain,
      isBestMove: true,
      isSacrifice: input.isSacrifice,
      isOnlyGoodMove: input.isOnlyGoodMove,
      isCriticalMove: input.isCriticalMove,
    });

    events.push(
      buildGameAnalysisEvent({
        input,
        eventType: moveQualityEventType(bestClassification, input),
        classification: bestClassification,
        themeTags: input.isOnlyGoodMove || input.isCriticalMove ? ['defense'] : input.themeTags,
      })
    );
  } else if (centipawnGain >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp) {
    const gainClassification = classifyAnalyzedMoveByCentipawnLoss({
      centipawnLoss,
      centipawnGain,
      isBestMove: input.isBestMove,
      isSacrifice: input.isSacrifice,
      isOnlyGoodMove: input.isOnlyGoodMove,
      isCriticalMove: input.isCriticalMove,
    });

    events.push(
      buildGameAnalysisEvent({
        input,
        eventType: moveQualityEventType(gainClassification, input),
        classification: gainClassification === 'best' ? 'excellent' : gainClassification,
      })
    );
  }

  return events;
}

export function buildGameAnalysisMoveEventsFromEngine(
  input: GameAnalysisEngineMoveInput
): CoachEvent[] {
  const beforePlayerEval = toPlayerPerspective(input.beforeEvalCp, input.playedBy);
  const playedPlayerEval = toPlayerPerspective(input.afterPlayedEvalCp, input.playedBy);
  const bestPlayerEval = toPlayerPerspective(input.afterBestEvalCp, input.playedBy);

  if (typeof playedPlayerEval !== 'number') {
    return [];
  }

  const centipawnLoss =
    typeof bestPlayerEval === 'number' ? Math.max(0, bestPlayerEval - playedPlayerEval) : 0;
  const centipawnGain =
    typeof beforePlayerEval === 'number' ? Math.max(0, playedPlayerEval - beforePlayerEval) : 0;
  const isBestMove =
    input.bestMoveSan && input.bestMoveSan === input.moveSan
      ? true
      : typeof bestPlayerEval === 'number'
        ? centipawnLoss <= 10
        : undefined;
  const missedOpportunityCp =
    input.bestMoveSan &&
    input.bestMoveSan !== input.moveSan &&
    centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.missOpportunityCp
      ? centipawnLoss
      : undefined;

  return buildGameAnalysisMoveEvents({
    gameId: input.gameId,
    moveSan: input.moveSan,
    plyIndex: input.plyIndex,
    phase: input.phase,
    beforeEvalCp: beforePlayerEval,
    afterEvalCp: playedPlayerEval,
    centipawnLoss,
    centipawnGain,
    bestMoveSan: input.bestMoveSan,
    isBestMove,
    isOnlyGoodMove: input.isOnlyGoodMove,
    isCriticalMove: input.isCriticalMove,
    isSacrifice: input.isSacrifice,
    missedOpportunityCp,
    themeTags: input.themeTags,
    persona: input.persona,
  });
}

export function buildGameAnalysisMoveEventsFromAnalyzedGameMove({
  game,
  move,
  persona,
}: {
  game: AnalyzedGame;
  move: AnalyzedGameMove;
  persona?: CoachPersona;
}): CoachEvent[] {
  return buildGameAnalysisMoveEventsFromEngine({
    gameId: game.id,
    moveSan: move.san,
    plyIndex: move.plyIndex,
    playedBy: move.playedBy,
    phase: move.phase,
    beforeEvalCp: move.beforeEvalCp,
    afterPlayedEvalCp: move.afterPlayedEvalCp,
    afterBestEvalCp: move.afterBestEvalCp,
    bestMoveSan: move.bestMoveSan,
    isOnlyGoodMove: move.isOnlyGoodMove,
    isCriticalMove: move.isCriticalMove,
    isSacrifice: move.isSacrifice,
    themeTags: move.themeTags,
    persona,
  });
}

export function buildGameAnalysisEventsFromAnalyzedGame({
  game,
  persona,
}: GameAnalysisEventsFromGameInput): CoachEvent[] {
  return game.moves.flatMap(move =>
    buildGameAnalysisMoveEventsFromAnalyzedGameMove({ game, move, persona })
  );
}

export function buildPrimaryGameAnalysisMoveEvent(
  input: GameAnalysisMoveEventInput
): CoachEvent | null {
  return buildGameAnalysisMoveEvents(input)[0] ?? null;
}

export function buildPrimaryGameAnalysisMoveEventFromEngine(
  input: GameAnalysisEngineMoveInput
): CoachEvent | null {
  return buildGameAnalysisMoveEventsFromEngine(input)[0] ?? null;
}

export function buildPrimaryGameAnalysisMoveEventFromAnalyzedGameMove({
  game,
  move,
  persona,
}: {
  game: AnalyzedGame;
  move: AnalyzedGameMove;
  persona?: CoachPersona;
}): CoachEvent | null {
  return buildGameAnalysisMoveEventsFromAnalyzedGameMove({ game, move, persona })[0] ?? null;
}
