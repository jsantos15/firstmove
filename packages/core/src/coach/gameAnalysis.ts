import { COACH_CLASSIFICATION_THRESHOLDS, classifyAnalyzedMoveByCentipawnLoss } from './analysis';
import type {
  CoachAnalysisFacts,
  CoachClassification,
  CoachEvidence,
  CoachEvidenceMove,
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
  playedBy?: GameAnalysisSide;
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
  evidence?: CoachEvidence;
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
  bestLine?: CoachEvidenceMove[];
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
  bestLine?: CoachEvidenceMove[];
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

export interface GameAnalysisMoveFacts {
  gameId: string;
  moveSan: string;
  plyIndex: number;
  playedBy: GameAnalysisSide;
  phase: CoachGamePhase;
  beforeEvalCp?: number;
  afterPlayedEvalCp: number;
  afterBestEvalCp?: number;
  beforePlayerEvalCp?: number;
  afterPlayerEvalCp: number;
  bestPlayerEvalCp?: number;
  centipawnLoss: number;
  centipawnGain: number;
  bestMoveSan?: string;
  isBestMove?: boolean;
  isOnlyGoodMove?: boolean;
  isCriticalMove?: boolean;
  isSacrifice?: boolean;
  missedOpportunityCp?: number;
  themeTags: CoachThemeTag[];
  persona?: CoachPersona;
  evidence?: CoachEvidence;
}

export interface GameAnalysisCoachCandidate {
  id: string;
  eventType: CoachEventType;
  classification: CoachClassification;
  priority: number;
  teachingWeight: number;
  reason: string;
  tone: CoachTone;
  severity: CoachSeverity;
  themeTags: CoachThemeTag[];
  variables: CoachEventVariables;
  analysisFacts: CoachAnalysisFacts;
  evidence?: CoachEvidence;
}

function formatPawns(cp: number) {
  if (Math.abs(cp) < 10) return 'level';
  return `${cp > 0 ? '+' : '-'}${(Math.abs(cp) / 100).toFixed(1)}`;
}

function toPlayerPerspective(evalCp: number | undefined, playedBy: GameAnalysisSide) {
  if (typeof evalCp !== 'number' || !Number.isFinite(evalCp)) return undefined;
  return playedBy === 'white' ? evalCp : -evalCp;
}

function buildBestMoveEvidence({
  bestMoveSan,
  bestLine,
}: {
  bestMoveSan?: string;
  bestLine?: CoachEvidenceMove[];
}): CoachEvidence | undefined {
  if (bestLine?.length) {
    return {
      kind: 'line',
      title: 'Show the better line',
      moves: bestLine,
      summary: 'This is the continuation behind the coach recommendation.',
    };
  }

  if (bestMoveSan) {
    return {
      kind: 'single_move',
      title: 'Show the better move',
      move: {
        san: bestMoveSan,
        isKeyMove: true,
      },
      summary: 'This move is the key improvement in the position.',
    };
  }

  return undefined;
}

function cleanVariables(variables: CoachEventVariables): CoachEventVariables {
  return Object.fromEntries(
    Object.entries(variables).filter(([, value]) => value !== null && typeof value !== 'undefined')
  );
}

function cleanAnalysisFacts(facts: CoachAnalysisFacts): CoachAnalysisFacts {
  return Object.fromEntries(
    Object.entries(facts).filter(([, value]) => value !== null && typeof value !== 'undefined')
  ) as CoachAnalysisFacts;
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

function buildFactsBase(input: GameAnalysisMoveEventInput): GameAnalysisMoveFacts {
  const centipawnLoss = input.centipawnLoss ?? 0;
  const centipawnGain = input.centipawnGain ?? 0;
  const afterPlayerEvalCp =
    typeof input.afterEvalCp === 'number' && Number.isFinite(input.afterEvalCp)
      ? input.afterEvalCp
      : 0;

  return {
    gameId: input.gameId,
    moveSan: input.moveSan,
    plyIndex: input.plyIndex,
    playedBy: input.playedBy ?? 'white',
    phase: input.phase,
    beforeEvalCp: input.beforeEvalCp,
    afterPlayedEvalCp: afterPlayerEvalCp,
    afterBestEvalCp:
      typeof input.afterEvalCp === 'number' && typeof input.centipawnLoss === 'number'
        ? input.afterEvalCp + input.centipawnLoss
        : undefined,
    beforePlayerEvalCp: input.beforeEvalCp,
    afterPlayerEvalCp,
    bestPlayerEvalCp:
      typeof input.afterEvalCp === 'number' && typeof input.centipawnLoss === 'number'
        ? input.afterEvalCp + input.centipawnLoss
        : undefined,
    centipawnLoss,
    centipawnGain,
    bestMoveSan: input.bestMoveSan,
    isBestMove: input.isBestMove,
    isOnlyGoodMove: input.isOnlyGoodMove,
    isCriticalMove: input.isCriticalMove,
    isSacrifice: input.isSacrifice,
    missedOpportunityCp: input.missedOpportunityCp,
    themeTags: input.themeTags ?? [],
    persona: input.persona,
    evidence: input.evidence,
  };
}

function candidateVariables(facts: GameAnalysisMoveFacts): CoachEventVariables {
  return cleanVariables({
    moveSan: facts.moveSan,
    bestMoveSan: facts.bestMoveSan ?? null,
    evalPawns: formatPawns(facts.afterPlayerEvalCp),
  });
}

function candidateAnalysisFacts(
  facts: GameAnalysisMoveFacts,
  extraFacts: CoachAnalysisFacts = {}
): CoachAnalysisFacts {
  return cleanAnalysisFacts({
    beforeCp: facts.beforePlayerEvalCp ?? null,
    afterCp: facts.afterPlayerEvalCp,
    centipawnLoss: facts.centipawnLoss,
    centipawnGain: facts.centipawnGain,
    bestMoveSan: facts.bestMoveSan ?? null,
    isBestMove: facts.isBestMove ?? null,
    isOnlyGoodMove: facts.isOnlyGoodMove ?? null,
    isCriticalMove: facts.isCriticalMove ?? null,
    isSacrifice: facts.isSacrifice ?? null,
    missedOpportunityCp: facts.missedOpportunityCp ?? null,
    ...extraFacts,
  });
}

function makeCandidate({
  facts,
  eventType,
  classification,
  priority,
  teachingWeight,
  reason,
  themeTags = facts.themeTags,
  evidence = facts.evidence,
}: {
  facts: GameAnalysisMoveFacts;
  eventType: CoachEventType;
  classification: CoachClassification;
  priority: number;
  teachingWeight: number;
  reason: string;
  themeTags?: CoachThemeTag[];
  evidence?: CoachEvidence;
}): GameAnalysisCoachCandidate {
  return {
    id: `candidate:${facts.gameId}:${facts.plyIndex}:${eventType}:${reason}`,
    eventType,
    classification,
    priority,
    teachingWeight,
    reason,
    tone: eventTone(classification),
    severity: eventSeverity(classification),
    themeTags,
    variables: candidateVariables(facts),
    analysisFacts: candidateAnalysisFacts(facts, {
      candidatePriority: priority,
      candidateReason: reason,
    }),
    evidence,
  };
}

export function buildGameAnalysisCoachCandidatesFromFacts(
  facts: GameAnalysisMoveFacts
): GameAnalysisCoachCandidate[] {
  const candidates: GameAnalysisCoachCandidate[] = [];
  const classification = classifyAnalyzedMoveByCentipawnLoss({
    centipawnLoss: facts.centipawnLoss,
    centipawnGain: facts.centipawnGain,
    isBestMove: facts.isBestMove,
    isSacrifice: facts.isSacrifice,
    isOnlyGoodMove: facts.isOnlyGoodMove,
    isCriticalMove: facts.isCriticalMove,
    missedOpportunityCp: facts.missedOpportunityCp,
  });

  if (
    typeof facts.missedOpportunityCp === 'number' &&
    facts.missedOpportunityCp >= COACH_CLASSIFICATION_THRESHOLDS.missOpportunityCp &&
    facts.bestMoveSan
  ) {
    candidates.push(
      makeCandidate({
        facts,
        eventType: missedOpportunityEventType(facts.missedOpportunityCp),
        classification: 'miss',
        priority: 1000 + facts.missedOpportunityCp,
        teachingWeight: 100,
        reason: 'missed_higher_value_line',
        themeTags: facts.themeTags.length ? facts.themeTags : ['initiative'],
        evidence: facts.evidence ?? buildBestMoveEvidence({ bestMoveSan: facts.bestMoveSan }),
      })
    );
  }

  if (facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.inaccuracyLossCp) {
    const lossClassification =
      classification === 'miss'
        ? classifyAnalyzedMoveByCentipawnLoss({
            centipawnLoss: facts.centipawnLoss,
            centipawnGain: facts.centipawnGain,
            isBestMove: facts.isBestMove,
            isSacrifice: facts.isSacrifice,
            isOnlyGoodMove: facts.isOnlyGoodMove,
            isCriticalMove: facts.isCriticalMove,
          })
        : classification;

    candidates.push(
      makeCandidate({
        facts,
        eventType: moveQualityEventType(lossClassification, {
          ...facts,
          afterEvalCp: facts.afterPlayerEvalCp,
          missedOpportunityCp: undefined,
        }),
        classification: lossClassification,
        priority: 900 + facts.centipawnLoss,
        teachingWeight: 90,
        reason: 'eval_loss_after_move',
      })
    );
  }

  if (facts.isBestMove || facts.centipawnLoss <= 10) {
    const bestClassification = classifyAnalyzedMoveByCentipawnLoss({
      centipawnLoss: facts.centipawnLoss,
      centipawnGain: facts.centipawnGain,
      isBestMove: true,
      isSacrifice: facts.isSacrifice,
      isOnlyGoodMove: facts.isOnlyGoodMove,
      isCriticalMove: facts.isCriticalMove,
    });

    candidates.push(
      makeCandidate({
        facts,
        eventType: moveQualityEventType(bestClassification, {
          ...facts,
          afterEvalCp: facts.afterPlayerEvalCp,
        }),
        classification: bestClassification,
        priority: 700 + facts.centipawnGain,
        teachingWeight:
          bestClassification === 'great' || bestClassification === 'brilliant' ? 85 : 65,
        reason: facts.isOnlyGoodMove ? 'only_good_move_found' : 'best_or_engine_equal_move',
        themeTags: facts.isOnlyGoodMove || facts.isCriticalMove ? ['defense'] : facts.themeTags,
      })
    );
  } else if (facts.centipawnGain >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp) {
    const gainClassification = classifyAnalyzedMoveByCentipawnLoss({
      centipawnLoss: facts.centipawnLoss,
      centipawnGain: facts.centipawnGain,
      isBestMove: facts.isBestMove,
      isSacrifice: facts.isSacrifice,
      isOnlyGoodMove: facts.isOnlyGoodMove,
      isCriticalMove: facts.isCriticalMove,
    });

    candidates.push(
      makeCandidate({
        facts,
        eventType: moveQualityEventType(gainClassification, {
          ...facts,
          afterEvalCp: facts.afterPlayerEvalCp,
        }),
        classification: gainClassification === 'best' ? 'excellent' : gainClassification,
        priority: 650 + facts.centipawnGain,
        teachingWeight: 70,
        reason: hasTacticalTheme(facts.themeTags)
          ? 'tactical_eval_gain_after_move'
          : 'eval_gain_after_move',
      })
    );
  }

  return candidates.sort((a, b) => b.priority - a.priority || b.teachingWeight - a.teachingWeight);
}

function buildGameAnalysisEventFromCandidate({
  facts,
  candidate,
}: {
  facts: GameAnalysisMoveFacts;
  candidate: GameAnalysisCoachCandidate;
}): CoachEvent {
  return {
    id: `game:${facts.gameId}:${facts.plyIndex}:${candidate.eventType}`,
    domain: 'game_analysis',
    subject: {
      kind: 'game',
      id: facts.gameId,
    },
    plyIndex: facts.plyIndex,
    eventType: candidate.eventType,
    classification: candidate.classification,
    tone: candidate.tone,
    severity: candidate.severity,
    persona: facts.persona ?? 'neutral',
    phase: facts.phase,
    themeTags: candidate.themeTags,
    messageKey: '',
    spokenKey: '',
    variables: candidate.variables,
    analysisFacts: candidate.analysisFacts,
    evidence: candidate.evidence,
    source: candidate.themeTags.length ? 'tactical_detector' : 'engine_analysis',
    contentVersion: 1,
  };
}

export function buildGameAnalysisMoveEvents(input: GameAnalysisMoveEventInput): CoachEvent[] {
  const facts = buildFactsBase(input);
  return buildGameAnalysisCoachCandidatesFromFacts(facts).map(candidate =>
    buildGameAnalysisEventFromCandidate({ facts, candidate })
  );
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
    playedBy: input.playedBy,
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
    evidence: buildBestMoveEvidence({ bestMoveSan: input.bestMoveSan, bestLine: input.bestLine }),
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
    bestLine: move.bestLine,
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
