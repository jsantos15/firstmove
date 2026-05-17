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

function formatPawns(cp: number) {
  if (Math.abs(cp) < 10) return 'level';
  return `${cp > 0 ? '+' : '-'}${(Math.abs(cp) / 100).toFixed(1)}`;
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

  if (
    typeof input.missedOpportunityCp === 'number' &&
    input.missedOpportunityCp >= COACH_CLASSIFICATION_THRESHOLDS.missOpportunityCp &&
    input.bestMoveSan
  ) {
    events.push(
      buildGameAnalysisEvent({
        input,
        eventType: 'missed_tactic',
        classification: 'miss',
        themeTags: input.themeTags?.length ? input.themeTags : ['initiative'],
      })
    );
  }

  if (centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.inaccuracyLossCp) {
    events.push(
      buildGameAnalysisEvent({
        input,
        eventType: 'eval_loss',
        classification: classifyAnalyzedMoveByCentipawnLoss({
          centipawnLoss,
          centipawnGain,
          isBestMove: input.isBestMove,
          isSacrifice: input.isSacrifice,
          isOnlyGoodMove: input.isOnlyGoodMove,
          isCriticalMove: input.isCriticalMove,
          missedOpportunityCp: input.missedOpportunityCp,
        }),
      })
    );
  }

  if (input.isBestMove || centipawnLoss <= 10) {
    events.push(
      buildGameAnalysisEvent({
        input,
        eventType: input.isOnlyGoodMove || input.isCriticalMove ? 'only_move' : 'best_move',
        classification: classifyAnalyzedMoveByCentipawnLoss({
          centipawnLoss,
          centipawnGain,
          isBestMove: true,
          isSacrifice: input.isSacrifice,
          isOnlyGoodMove: input.isOnlyGoodMove,
          isCriticalMove: input.isCriticalMove,
        }),
        themeTags: input.isOnlyGoodMove || input.isCriticalMove ? ['defense'] : input.themeTags,
      })
    );
  } else if (centipawnGain >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp) {
    events.push(
      buildGameAnalysisEvent({
        input,
        eventType: 'eval_gain',
        classification: 'excellent',
      })
    );
  }

  return events;
}

export function buildPrimaryGameAnalysisMoveEvent(
  input: GameAnalysisMoveEventInput
): CoachEvent | null {
  return buildGameAnalysisMoveEvents(input)[0] ?? null;
}
