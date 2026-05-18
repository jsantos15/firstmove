import { Chess } from 'chess.js';
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
  beforeFen?: string;
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
  beforeFen?: string;
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
  beforeFen?: string;
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
  beforeFen?: string;
  afterFen?: string;
  moveFrom?: string;
  moveTo?: string;
  movedPiece?: string;
  capturedPiece?: string;
  isCapture: boolean;
  givesCheck: boolean;
  givesCheckmate: boolean;
  bestMoveTo?: string;
  bestMoveCapturedPiece?: string;
  bestMoveIsCapture: boolean;
  bestMoveGivesCheck: boolean;
  bestMoveGivesCheckmate: boolean;
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

interface BestMoveTacticalFacts {
  bestMoveTo?: string;
  bestMoveCapturedPiece?: string;
  bestMoveIsCapture: boolean;
  bestMoveGivesCheck: boolean;
  bestMoveGivesCheckmate: boolean;
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

function detectChessStateFacts({
  beforeFen,
  moveSan,
}: {
  beforeFen?: string;
  moveSan: string;
}): Pick<
  GameAnalysisMoveFacts,
  | 'afterFen'
  | 'moveFrom'
  | 'moveTo'
  | 'movedPiece'
  | 'capturedPiece'
  | 'isCapture'
  | 'givesCheck'
  | 'givesCheckmate'
> {
  if (!beforeFen) {
    return {
      isCapture: false,
      givesCheck: moveSan.includes('+') || moveSan.includes('#'),
      givesCheckmate: moveSan.includes('#'),
    };
  }

  try {
    const chess = new Chess(beforeFen);
    const move = chess.move(moveSan);
    if (!move) {
      return {
        isCapture: false,
        givesCheck: moveSan.includes('+') || moveSan.includes('#'),
        givesCheckmate: moveSan.includes('#'),
      };
    }

    return {
      afterFen: chess.fen(),
      moveFrom: move.from,
      moveTo: move.to,
      movedPiece: move.piece,
      capturedPiece: move.captured,
      isCapture: Boolean(move.captured) || move.flags.includes('c') || move.flags.includes('e'),
      givesCheck: chess.isCheck(),
      givesCheckmate: chess.isCheckmate(),
    };
  } catch {
    return {
      isCapture: false,
      givesCheck: moveSan.includes('+') || moveSan.includes('#'),
      givesCheckmate: moveSan.includes('#'),
    };
  }
}

function sanLooksLikeCapture(moveSan: string | undefined) {
  return Boolean(moveSan?.includes('x'));
}

function sanLooksLikeCheck(moveSan: string | undefined) {
  return Boolean(moveSan?.includes('+') || moveSan?.includes('#'));
}

function sanLooksLikeCheckmate(moveSan: string | undefined) {
  return Boolean(moveSan?.includes('#'));
}

function detectBestMoveTacticalFacts({
  beforeFen,
  bestMoveSan,
  bestLine,
}: {
  beforeFen?: string;
  bestMoveSan?: string;
  bestLine?: CoachEvidenceMove[];
}): BestMoveTacticalFacts {
  const firstBestLineMove = bestLine?.[0]?.san;
  const moveSan = bestMoveSan ?? firstBestLineMove;
  if (!moveSan) {
    return {
      bestMoveIsCapture: false,
      bestMoveGivesCheck: false,
      bestMoveGivesCheckmate: false,
    };
  }

  if (beforeFen) {
    try {
      const chess = new Chess(beforeFen);
      const move = chess.move(moveSan);
      if (move) {
        return {
          bestMoveTo: move.to,
          bestMoveCapturedPiece: move.captured,
          bestMoveIsCapture:
            Boolean(move.captured) || move.flags.includes('c') || move.flags.includes('e'),
          bestMoveGivesCheck: chess.isCheck(),
          bestMoveGivesCheckmate: chess.isCheckmate(),
        };
      }
    } catch {
      // Fall through to SAN markers below.
    }
  }

  return {
    bestMoveIsCapture: sanLooksLikeCapture(moveSan),
    bestMoveGivesCheck: sanLooksLikeCheck(moveSan),
    bestMoveGivesCheckmate: sanLooksLikeCheckmate(moveSan),
  };
}

function buildBestMoveEvidence({
  bestMoveSan,
  bestLine,
  title = 'Show the better line',
  summary = 'This is the continuation behind the coach recommendation.',
}: {
  bestMoveSan?: string;
  bestLine?: CoachEvidenceMove[];
  title?: string;
  summary?: string;
}): CoachEvidence | undefined {
  if (bestLine?.length) {
    return {
      kind: 'line',
      title,
      moves: bestLine,
      summary,
    };
  }

  if (bestMoveSan) {
    return {
      kind: 'single_move',
      title,
      move: {
        san: bestMoveSan,
        isKeyMove: true,
      },
      summary,
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
  const chessFacts = detectChessStateFacts({
    beforeFen: input.beforeFen,
    moveSan: input.moveSan,
  });
  const bestMoveFacts = detectBestMoveTacticalFacts({
    beforeFen: input.beforeFen,
    bestMoveSan: input.bestMoveSan,
    bestLine:
      input.evidence?.kind === 'line'
        ? input.evidence.moves
        : input.evidence?.kind === 'single_move'
          ? [input.evidence.move]
          : undefined,
  });

  return {
    gameId: input.gameId,
    moveSan: input.moveSan,
    plyIndex: input.plyIndex,
    playedBy: input.playedBy ?? 'white',
    phase: input.phase,
    beforeFen: input.beforeFen,
    afterFen: chessFacts.afterFen,
    moveFrom: chessFacts.moveFrom,
    moveTo: chessFacts.moveTo,
    movedPiece: chessFacts.movedPiece,
    capturedPiece: chessFacts.capturedPiece,
    isCapture: chessFacts.isCapture,
    givesCheck: chessFacts.givesCheck,
    givesCheckmate: chessFacts.givesCheckmate,
    bestMoveTo: bestMoveFacts.bestMoveTo,
    bestMoveCapturedPiece: bestMoveFacts.bestMoveCapturedPiece,
    bestMoveIsCapture: bestMoveFacts.bestMoveIsCapture,
    bestMoveGivesCheck: bestMoveFacts.bestMoveGivesCheck,
    bestMoveGivesCheckmate: bestMoveFacts.bestMoveGivesCheckmate,
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
    isCapture: facts.isCapture,
    givesCheck: facts.givesCheck,
    givesCheckmate: facts.givesCheckmate,
    beforeFen: facts.beforeFen ?? null,
    afterFen: facts.afterFen ?? null,
    moveFrom: facts.moveFrom ?? null,
    moveTo: facts.moveTo ?? null,
    movedPiece: facts.movedPiece ?? null,
    capturedPiece: facts.capturedPiece ?? null,
    bestMoveTo: facts.bestMoveTo ?? null,
    bestMoveCapturedPiece: facts.bestMoveCapturedPiece ?? null,
    bestMoveIsCapture: facts.bestMoveIsCapture,
    bestMoveGivesCheck: facts.bestMoveGivesCheck,
    bestMoveGivesCheckmate: facts.bestMoveGivesCheckmate,
    ...extraFacts,
  });
}

function missedTacticalIdea(facts: GameAnalysisMoveFacts): GameAnalysisCoachCandidate | null {
  if (
    typeof facts.missedOpportunityCp !== 'number' ||
    facts.missedOpportunityCp < COACH_CLASSIFICATION_THRESHOLDS.missOpportunityCp ||
    !facts.bestMoveSan ||
    facts.bestMoveSan === facts.moveSan
  ) {
    return null;
  }

  if (!facts.bestMoveGivesCheckmate && !facts.bestMoveGivesCheck && !facts.bestMoveIsCapture) {
    return null;
  }

  const eventType = facts.bestMoveGivesCheckmate
    ? 'missed_win'
    : facts.bestMoveGivesCheck || facts.bestMoveIsCapture
      ? 'missed_tactic'
      : missedOpportunityEventType(facts.missedOpportunityCp);
  const reason = facts.bestMoveGivesCheckmate
    ? 'missed_forced_mate'
    : facts.bestMoveGivesCheck && facts.bestMoveIsCapture
      ? 'missed_forcing_capture'
      : facts.bestMoveGivesCheck
        ? 'missed_checking_resource'
        : 'missed_material_tactic';
  const title = facts.bestMoveGivesCheckmate
    ? 'Show the missed mate'
    : facts.bestMoveGivesCheck
      ? 'Show the forcing move'
      : 'Show the material tactic';
  const summary = facts.bestMoveGivesCheckmate
    ? `${facts.bestMoveSan} was the forcing mate idea in the position.`
    : facts.bestMoveGivesCheck
      ? `${facts.bestMoveSan} starts with check, so the opponent has to answer it.`
      : `${facts.bestMoveSan} was the material idea hidden in the position.`;

  return makeCandidate({
    facts,
    eventType,
    classification: 'miss',
    priority:
      (facts.bestMoveGivesCheckmate ? 2600 : facts.bestMoveGivesCheck ? 1800 : 1500) +
      facts.missedOpportunityCp,
    teachingWeight: facts.bestMoveGivesCheckmate ? 100 : 95,
    reason,
    themeTags: [
      ...(facts.bestMoveGivesCheckmate ? (['mate_threat'] as CoachThemeTag[]) : []),
      ...(facts.bestMoveGivesCheck ? (['king_safety', 'tempo'] as CoachThemeTag[]) : []),
      ...(facts.bestMoveIsCapture ? (['material'] as CoachThemeTag[]) : []),
    ],
    evidence:
      facts.evidence ??
      buildBestMoveEvidence({
        bestMoveSan: facts.bestMoveSan,
        title,
        summary,
      }),
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

  if (facts.givesCheckmate) {
    candidates.push(
      makeCandidate({
        facts,
        eventType: 'tactic_found',
        classification: 'brilliant',
        priority: 5000,
        teachingWeight: 100,
        reason: 'move_gives_checkmate',
        themeTags: ['mate_threat', 'king_safety'],
        evidence: facts.moveTo
          ? {
              kind: 'square',
              title: 'Show the mating square',
              squares: [facts.moveTo],
              summary: `${facts.moveSan} ends the game by attacking the king.`,
            }
          : facts.evidence,
      })
    );
  } else if (facts.givesCheck) {
    candidates.push(
      makeCandidate({
        facts,
        eventType: 'king_safety',
        classification:
          classification === 'blunder' || classification === 'mistake'
            ? 'good'
            : classification === 'best'
              ? 'best'
              : 'good',
        priority: 520 + Math.max(0, facts.centipawnGain),
        teachingWeight: 45,
        reason: 'move_gives_check',
        themeTags: ['king_safety', 'tempo'],
        evidence: facts.moveTo
          ? {
              kind: 'square',
              title: 'Show the checking move',
              squares: [facts.moveTo],
              summary: `${facts.moveSan} gives check and forces the opponent to respond.`,
            }
          : facts.evidence,
      })
    );
  }

  if (facts.isCapture) {
    candidates.push(
      makeCandidate({
        facts,
        eventType: 'material_trade',
        classification:
          facts.centipawnGain >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp
            ? 'excellent'
            : 'good',
        priority: 480 + Math.max(0, facts.centipawnGain),
        teachingWeight:
          facts.centipawnGain >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp ? 60 : 35,
        reason: facts.capturedPiece ? `move_captures_${facts.capturedPiece}` : 'move_captures',
        themeTags: ['material'],
        evidence: facts.moveTo
          ? {
              kind: 'piece',
              title: 'Show the captured material',
              pieces: [{ square: facts.moveTo, role: 'captured_piece_square' }],
              summary: `${facts.moveSan} changes the material balance.`,
            }
          : facts.evidence,
      })
    );
  }

  const missedTacticCandidate = missedTacticalIdea(facts);
  if (missedTacticCandidate) {
    candidates.push(missedTacticCandidate);
  }

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
    beforeFen: input.beforeFen,
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
    beforeFen: move.beforeFen,
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
