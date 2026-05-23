import { Chess } from 'chess.js';
import { COACH_CLASSIFICATION_THRESHOLDS, classifyAnalyzedMoveByCentipawnLoss } from './analysis';
import { COACH_GAME_PHASES } from './index';
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
  hasEngineAnalysis?: boolean;
  beforeFen?: string;
  beforeEvalCp?: number;
  afterEvalCp?: number;
  centipawnLoss?: number;
  centipawnGain?: number;
  bestMoveSan?: string;
  secondBestMoveSan?: string;
  secondBestEvalCp?: number;
  bestMoveGapCp?: number;
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
  hasEngineAnalysis?: boolean;
  beforeFen?: string;
  beforeEvalCp?: number;
  afterPlayedEvalCp: number;
  afterBestEvalCp?: number;
  bestMoveSan?: string;
  bestLine?: CoachEvidenceMove[];
  bestMoveAlternatives?: GameAnalysisMoveAlternative[];
  isOnlyGoodMove?: boolean;
  isCriticalMove?: boolean;
  isSacrifice?: boolean;
  themeTags?: CoachThemeTag[];
  persona?: CoachPersona;
}

export interface GameAnalysisMoveAlternative {
  san: string;
  evalCp?: number;
}

export interface AnalyzedGameMove {
  id?: string;
  san: string;
  plyIndex: number;
  playedBy: GameAnalysisSide;
  phase: CoachGamePhase;
  hasEngineAnalysis?: boolean;
  beforeFen?: string;
  afterFen?: string;
  beforeEvalCp?: number;
  afterPlayedEvalCp: number;
  afterBestEvalCp?: number;
  bestMoveSan?: string;
  bestLine?: CoachEvidenceMove[];
  bestMoveAlternatives?: GameAnalysisMoveAlternative[];
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
  includeSummaries?: boolean;
}

export interface AnalyzedGameFromPgnInput {
  id: string;
  pgn: string;
  initialFen?: string;
}

export interface AppliedSanMove {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  playedBy: GameAnalysisSide;
  beforeFen: string;
  afterFen: string;
}

export interface AppliedUciMove extends AppliedSanMove {
  uci: string;
}

export interface BuildSanLineFromUciInput {
  fen: string;
  uciMoves: string[];
  startPlyIndex?: number;
  maxMoves?: number;
}

export interface GameAnalysisMoveFacts {
  gameId: string;
  moveSan: string;
  plyIndex: number;
  playedBy: GameAnalysisSide;
  phase: CoachGamePhase;
  hasEngineAnalysis: boolean;
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
  playedTacticalMotif?: string;
  playedTacticalMotifTargets?: string[];
  bestMoveTacticalMotif?: string;
  bestMoveTacticalMotifTargets?: string[];
  materialRiskSquare?: string;
  materialRiskPiece?: string;
  materialRiskValue?: number;
  materialRiskAttackers?: number;
  materialRiskDefenders?: number;
  materialRiskIsHanging?: boolean;
  opponentThreatMoveSan?: string;
  opponentThreatKind?: string;
  opponentThreatFrom?: string;
  opponentThreatTo?: string;
  opponentThreatCapturedPiece?: string;
  opponentThreatCapturedValue?: number;
  opponentThreatIsCapture?: boolean;
  opponentThreatGivesCheck?: boolean;
  opponentThreatGivesCheckmate?: boolean;
  developedPiece?: string;
  developedFrom?: string;
  developedTo?: string;
  centerControlBefore?: number;
  centerControlAfter?: number;
  centerControlDelta?: number;
  pieceActivityBefore?: number;
  pieceActivityAfter?: number;
  pieceActivityDelta?: number;
  pawnStructureIssue?: string;
  pawnStructureSquare?: string;
  passedPawnSquare?: string;
  passedPawnRank?: number;
  beforeEvalCp?: number;
  afterPlayedEvalCp: number;
  afterBestEvalCp?: number;
  beforePlayerEvalCp?: number;
  afterPlayerEvalCp: number;
  bestPlayerEvalCp?: number;
  secondBestMoveSan?: string;
  secondBestPlayerEvalCp?: number;
  bestMoveGapCp?: number;
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
  bestMoveTacticalMotif?: TacticalMotifName;
  bestMoveTacticalMotifTargets?: string[];
}

type TacticalMotifName =
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered_attack'
  | 'trapped_piece'
  | 'back_rank';

interface TacticalMotifFacts {
  motif?: TacticalMotifName;
  targetSquares?: string[];
  targetPieces?: string[];
}

type RayPiece = { square: string; piece: { type: PieceCode; color: ChessColor } };

interface MaterialRiskFacts {
  square: string;
  piece: string;
  value: number;
  attackers: number;
  defenders: number;
  isHanging: boolean;
}

interface OpponentThreatFacts {
  moveSan: string;
  kind: 'mate' | 'checking_capture' | 'capture' | 'check';
  from: string;
  to: string;
  capturedPiece?: string;
  capturedValue?: number;
  isCapture: boolean;
  givesCheck: boolean;
  givesCheckmate: boolean;
}

interface PositionalDeltaFacts {
  developedPiece?: string;
  developedFrom?: string;
  developedTo?: string;
  centerControlBefore: number;
  centerControlAfter: number;
  centerControlDelta: number;
  pieceActivityBefore?: number;
  pieceActivityAfter?: number;
  pieceActivityDelta?: number;
}

interface PawnStructureDeltaFacts {
  pawnStructureIssue?: 'doubled_pawn' | 'isolated_pawn';
  pawnStructureSquare?: string;
  passedPawnSquare?: string;
  passedPawnRank?: number;
}

type ChessColor = 'w' | 'b';
type PieceCode = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const CENTER_SQUARES = ['d4', 'e4', 'd5', 'e5'] as const;
const DEVELOPMENT_HOME_SQUARES: Record<ChessColor, Partial<Record<PieceCode, string[]>>> = {
  w: {
    n: ['b1', 'g1'],
    b: ['c1', 'f1'],
  },
  b: {
    n: ['b8', 'g8'],
    b: ['c8', 'f8'],
  },
};
const PIECE_VALUES: Record<PieceCode, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};
const PIECE_NAMES: Record<PieceCode, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

interface PawnInfo {
  square: string;
  file: number;
  rank: number;
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

const COMPLEMENTARY_EVENT_TYPES = [
  'blunder',
  'mistake',
  'hanging_material',
  'loose_piece',
  'opponent_threat',
  'missed_tactic',
  'missed_win',
  'development',
  'center_control',
  'piece_activity',
  'pawn_structure',
  'conversion',
  'material_trade',
] as const satisfies readonly CoachEventType[];

const SUMMARY_EVENT_VERSION = 1;

function formatPawns(cp: number) {
  if (Math.abs(cp) < 10) return 'level';
  return `${cp > 0 ? '+' : '-'}${(Math.abs(cp) / 100).toFixed(1)}`;
}

function toPlayerPerspective(evalCp: number | undefined, playedBy: GameAnalysisSide) {
  if (typeof evalCp !== 'number' || !Number.isFinite(evalCp)) return undefined;
  return playedBy === 'white' ? evalCp : -evalCp;
}

function playedSideColor(playedBy: GameAnalysisSide): ChessColor {
  return playedBy === 'white' ? 'w' : 'b';
}

function oppositeColor(color: ChessColor): ChessColor {
  return color === 'w' ? 'b' : 'w';
}

function squareToCoords(square: string) {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);
  if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > 8) return null;
  return { file, rank };
}

function coordsToSquare(file: number, rank: number) {
  return `${FILES[file]}${rank}`;
}

function boardPieceAt(
  board: ReturnType<Chess['board']>,
  square: string
): { type: PieceCode; color: ChessColor } | null {
  const coords = squareToCoords(square);
  if (!coords) return null;
  return board[8 - coords.rank]?.[coords.file] ?? null;
}

function motifToThemeTag(motif?: TacticalMotifName): CoachThemeTag | undefined {
  if (!motif) return undefined;
  if (motif === 'trapped_piece') return 'material';
  if (motif === 'back_rank') return 'mate_threat';
  return motif;
}

function uniqueThemeTags(themeTags: Array<CoachThemeTag | undefined>) {
  return [...new Set(themeTags.filter((themeTag): themeTag is CoachThemeTag => Boolean(themeTag)))];
}

function isPathClear(board: ReturnType<Chess['board']>, from: string, to: string) {
  const fromCoords = squareToCoords(from);
  const toCoords = squareToCoords(to);
  if (!fromCoords || !toCoords) return false;

  const fileStep = Math.sign(toCoords.file - fromCoords.file);
  const rankStep = Math.sign(toCoords.rank - fromCoords.rank);
  let file = fromCoords.file + fileStep;
  let rank = fromCoords.rank + rankStep;

  while (file !== toCoords.file || rank !== toCoords.rank) {
    if (boardPieceAt(board, coordsToSquare(file, rank))) return false;
    file += fileStep;
    rank += rankStep;
  }

  return true;
}

function pieceAttacksSquare({
  board,
  from,
  to,
  piece,
}: {
  board: ReturnType<Chess['board']>;
  from: string;
  to: string;
  piece: { type: PieceCode; color: ChessColor };
}) {
  if (from === to) return false;

  const fromCoords = squareToCoords(from);
  const toCoords = squareToCoords(to);
  if (!fromCoords || !toCoords) return false;

  const fileDelta = toCoords.file - fromCoords.file;
  const rankDelta = toCoords.rank - fromCoords.rank;
  const absFileDelta = Math.abs(fileDelta);
  const absRankDelta = Math.abs(rankDelta);

  if (piece.type === 'p') {
    const direction = piece.color === 'w' ? 1 : -1;
    return rankDelta === direction && absFileDelta === 1;
  }

  if (piece.type === 'n') {
    return (absFileDelta === 1 && absRankDelta === 2) || (absFileDelta === 2 && absRankDelta === 1);
  }

  if (piece.type === 'k') {
    return absFileDelta <= 1 && absRankDelta <= 1;
  }

  const isDiagonal = absFileDelta === absRankDelta;
  const isStraight = fileDelta === 0 || rankDelta === 0;

  if (piece.type === 'b') return isDiagonal && isPathClear(board, from, to);
  if (piece.type === 'r') return isStraight && isPathClear(board, from, to);
  if (piece.type === 'q') return (isDiagonal || isStraight) && isPathClear(board, from, to);

  return false;
}

function countAttackers(board: ReturnType<Chess['board']>, square: string, color: ChessColor) {
  let attackers = 0;

  for (let rowIndex = 0; rowIndex < board.length; rowIndex += 1) {
    for (let fileIndex = 0; fileIndex < board[rowIndex].length; fileIndex += 1) {
      const piece = board[rowIndex][fileIndex];
      if (!piece || piece.color !== color) continue;

      const from = coordsToSquare(fileIndex, 8 - rowIndex);
      if (pieceAttacksSquare({ board, from, to: square, piece })) {
        attackers += 1;
      }
    }
  }

  return attackers;
}

function countControlledSquares(
  board: ReturnType<Chess['board']>,
  color: ChessColor,
  squares: readonly string[]
) {
  return squares.reduce((total, square) => total + countAttackers(board, square, color), 0);
}

function countPieceMobility(board: ReturnType<Chess['board']>, square: string) {
  const piece = boardPieceAt(board, square);
  if (!piece || piece.type === 'k') return undefined;

  let mobility = 0;
  for (const file of FILES) {
    for (let rank = 1; rank <= 8; rank += 1) {
      const targetSquare = `${file}${rank}`;
      if (targetSquare === square) continue;

      const targetPiece = boardPieceAt(board, targetSquare);
      if (targetPiece?.color === piece.color) continue;

      if (pieceAttacksSquare({ board, from: square, to: targetSquare, piece })) {
        mobility += 1;
      }
    }
  }

  return mobility;
}

function attackedOpponentPiecesByPiece({
  board,
  from,
  color,
}: {
  board: ReturnType<Chess['board']>;
  from: string;
  color: ChessColor;
}) {
  const piece = boardPieceAt(board, from);
  if (!piece || piece.color !== color) return [];

  const attackedPieces: Array<{ square: string; piece: PieceCode; value: number }> = [];
  for (const file of FILES) {
    for (let rank = 1; rank <= 8; rank += 1) {
      const square = `${file}${rank}`;
      const target = boardPieceAt(board, square);
      if (!target || target.color === color) continue;
      if (!pieceAttacksSquare({ board, from, to: square, piece })) continue;

      attackedPieces.push({
        square,
        piece: target.type,
        value: target.type === 'k' ? 99 : PIECE_VALUES[target.type],
      });
    }
  }

  return attackedPieces.sort((a, b) => b.value - a.value);
}

function raySquaresFrom(square: string, fileStep: number, rankStep: number) {
  const coords = squareToCoords(square);
  if (!coords) return [];

  const squares: string[] = [];
  let file = coords.file + fileStep;
  let rank = coords.rank + rankStep;
  while (file >= 0 && file < 8 && rank >= 1 && rank <= 8) {
    squares.push(coordsToSquare(file, rank));
    file += fileStep;
    rank += rankStep;
  }

  return squares;
}

function slidingDirections(piece: PieceCode | undefined) {
  if (piece === 'b') {
    return [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const;
  }
  if (piece === 'r') {
    return [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
  }
  if (piece === 'q') {
    return [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
  }
  return [] as const;
}

function firstPiecesOnRay(
  board: ReturnType<Chess['board']>,
  from: string,
  fileStep: number,
  rankStep: number,
  limit = 2
): RayPiece[] {
  const pieces: RayPiece[] = [];
  for (const square of raySquaresFrom(from, fileStep, rankStep)) {
    const piece = boardPieceAt(board, square);
    if (!piece) continue;
    pieces.push({ square, piece });
    if (pieces.length >= limit) break;
  }
  return pieces;
}

function collectPawns(board: ReturnType<Chess['board']>, color: ChessColor): PawnInfo[] {
  const pawns: PawnInfo[] = [];

  for (let rowIndex = 0; rowIndex < board.length; rowIndex += 1) {
    for (let fileIndex = 0; fileIndex < board[rowIndex].length; fileIndex += 1) {
      const piece = board[rowIndex][fileIndex];
      if (!piece || piece.color !== color || piece.type !== 'p') continue;

      const rank = 8 - rowIndex;
      pawns.push({
        square: coordsToSquare(fileIndex, rank),
        file: fileIndex,
        rank,
      });
    }
  }

  return pawns;
}

function pawnFileCounts(pawns: PawnInfo[]) {
  return pawns.reduce<Record<number, number>>((counts, pawn) => {
    counts[pawn.file] = (counts[pawn.file] ?? 0) + 1;
    return counts;
  }, {});
}

function isIsolatedPawn(pawn: PawnInfo, friendlyPawns: PawnInfo[]) {
  return !friendlyPawns.some(
    friendlyPawn =>
      friendlyPawn.square !== pawn.square && Math.abs(friendlyPawn.file - pawn.file) === 1
  );
}

function isPassedPawn(pawn: PawnInfo, opponentPawns: PawnInfo[], color: ChessColor) {
  return !opponentPawns.some(opponentPawn => {
    const sameOrAdjacentFile = Math.abs(opponentPawn.file - pawn.file) <= 1;
    const blocksPath =
      color === 'w' ? opponentPawn.rank > pawn.rank : opponentPawn.rank < pawn.rank;
    return sameOrAdjacentFile && blocksPath;
  });
}

function detectPawnStructureDeltaFacts({
  beforeFen,
  afterFen,
  playedBy,
  moveFrom,
  moveTo,
  movedPiece,
}: {
  beforeFen?: string;
  afterFen?: string;
  playedBy: GameAnalysisSide;
  moveFrom?: string;
  moveTo?: string;
  movedPiece?: string;
}): PawnStructureDeltaFacts {
  if (!beforeFen || !afterFen || movedPiece !== 'p' || !moveTo) return {};

  try {
    const movedColor = playedSideColor(playedBy);
    const beforeBoard = new Chess(beforeFen).board();
    const afterBoard = new Chess(afterFen).board();
    const beforeFriendlyPawns = collectPawns(beforeBoard, movedColor);
    const afterFriendlyPawns = collectPawns(afterBoard, movedColor);
    const beforeOpponentPawns = collectPawns(beforeBoard, oppositeColor(movedColor));
    const afterOpponentPawns = collectPawns(afterBoard, oppositeColor(movedColor));
    const beforeFileCounts = pawnFileCounts(beforeFriendlyPawns);
    const afterFileCounts = pawnFileCounts(afterFriendlyPawns);
    const movedPawnAfter = afterFriendlyPawns.find(pawn => pawn.square === moveTo);
    const movedPawnBefore = beforeFriendlyPawns.find(pawn => pawn.square === moveFrom);

    if (!movedPawnAfter) return {};

    const createdDoubledPawn =
      (afterFileCounts[movedPawnAfter.file] ?? 0) > 1 &&
      (afterFileCounts[movedPawnAfter.file] ?? 0) > (beforeFileCounts[movedPawnAfter.file] ?? 0);
    if (createdDoubledPawn) {
      return {
        pawnStructureIssue: 'doubled_pawn',
        pawnStructureSquare: movedPawnAfter.square,
      };
    }

    const createdIsolatedPawn =
      isIsolatedPawn(movedPawnAfter, afterFriendlyPawns) &&
      (!movedPawnBefore || !isIsolatedPawn(movedPawnBefore, beforeFriendlyPawns));
    if (createdIsolatedPawn) {
      return {
        pawnStructureIssue: 'isolated_pawn',
        pawnStructureSquare: movedPawnAfter.square,
      };
    }

    const createdPassedPawn =
      isPassedPawn(movedPawnAfter, afterOpponentPawns, movedColor) &&
      (!movedPawnBefore || !isPassedPawn(movedPawnBefore, beforeOpponentPawns, movedColor));
    if (createdPassedPawn) {
      return {
        passedPawnSquare: movedPawnAfter.square,
        passedPawnRank: movedPawnAfter.rank,
      };
    }
  } catch {
    return {};
  }

  return {};
}

function detectPositionalDeltaFacts({
  beforeFen,
  afterFen,
  playedBy,
  moveFrom,
  moveTo,
}: {
  beforeFen?: string;
  afterFen?: string;
  playedBy: GameAnalysisSide;
  moveFrom?: string;
  moveTo?: string;
}): PositionalDeltaFacts {
  const emptyFacts = {
    centerControlBefore: 0,
    centerControlAfter: 0,
    centerControlDelta: 0,
  };

  if (!beforeFen || !afterFen) return emptyFacts;

  try {
    const beforeBoard = new Chess(beforeFen).board();
    const afterBoard = new Chess(afterFen).board();
    const movedColor = playedSideColor(playedBy);
    const beforeCenterControl = countControlledSquares(beforeBoard, movedColor, CENTER_SQUARES);
    const afterCenterControl = countControlledSquares(afterBoard, movedColor, CENTER_SQUARES);
    const movedBeforePiece = moveFrom ? boardPieceAt(beforeBoard, moveFrom) : null;
    const movedAfterPiece = moveTo ? boardPieceAt(afterBoard, moveTo) : null;
    const homeSquares = movedBeforePiece
      ? (DEVELOPMENT_HOME_SQUARES[movedColor][movedBeforePiece.type] ?? [])
      : [];
    const developedPiece =
      movedBeforePiece &&
      movedAfterPiece &&
      movedBeforePiece.color === movedColor &&
      movedBeforePiece.type === movedAfterPiece.type &&
      homeSquares.includes(moveFrom ?? '')
        ? PIECE_NAMES[movedBeforePiece.type]
        : undefined;
    const pieceActivityBefore = moveFrom ? countPieceMobility(beforeBoard, moveFrom) : undefined;
    const pieceActivityAfter = moveTo ? countPieceMobility(afterBoard, moveTo) : undefined;
    const pieceActivityDelta =
      typeof pieceActivityBefore === 'number' && typeof pieceActivityAfter === 'number'
        ? pieceActivityAfter - pieceActivityBefore
        : undefined;

    return {
      developedPiece,
      developedFrom: developedPiece ? moveFrom : undefined,
      developedTo: developedPiece ? moveTo : undefined,
      centerControlBefore: beforeCenterControl,
      centerControlAfter: afterCenterControl,
      centerControlDelta: afterCenterControl - beforeCenterControl,
      pieceActivityBefore,
      pieceActivityAfter,
      pieceActivityDelta,
    };
  } catch {
    return emptyFacts;
  }
}

function detectMaterialRiskFacts({
  afterFen,
  playedBy,
}: {
  afterFen?: string;
  playedBy: GameAnalysisSide;
}): MaterialRiskFacts | null {
  if (!afterFen) return null;

  try {
    const chess = new Chess(afterFen);
    const board = chess.board();
    const movedColor = playedSideColor(playedBy);
    const opponentColor = oppositeColor(movedColor);
    const risks: MaterialRiskFacts[] = [];

    for (let rowIndex = 0; rowIndex < board.length; rowIndex += 1) {
      for (let fileIndex = 0; fileIndex < board[rowIndex].length; fileIndex += 1) {
        const piece = board[rowIndex][fileIndex];
        if (!piece || piece.color !== movedColor || piece.type === 'k') continue;

        const square = coordsToSquare(fileIndex, 8 - rowIndex);
        const attackers = countAttackers(board, square, opponentColor);
        if (attackers === 0) continue;

        const defenders = countAttackers(board, square, movedColor);
        if (defenders >= attackers) continue;

        risks.push({
          square,
          piece: PIECE_NAMES[piece.type],
          value: PIECE_VALUES[piece.type],
          attackers,
          defenders,
          isHanging: defenders === 0,
        });
      }
    }

    return (
      risks.sort(
        (a, b) =>
          Number(b.isHanging) - Number(a.isHanging) ||
          b.value - a.value ||
          b.attackers - a.attackers ||
          a.defenders - b.defenders
      )[0] ?? null
    );
  } catch {
    return null;
  }
}

function detectOpponentThreatFacts(afterFen?: string): OpponentThreatFacts | null {
  if (!afterFen) return null;

  try {
    const chess = new Chess(afterFen);
    const threats: OpponentThreatFacts[] = chess.moves({ verbose: true }).flatMap(move => {
      const next = new Chess(afterFen);
      next.move(move.san);

      const isCapture =
        Boolean(move.captured) || move.flags.includes('c') || move.flags.includes('e');
      const givesCheck = next.isCheck();
      const givesCheckmate = next.isCheckmate();

      if (!isCapture && !givesCheck && !givesCheckmate) return [];

      const capturedPiece = move.captured ? PIECE_NAMES[move.captured] : undefined;
      const capturedValue = move.captured ? PIECE_VALUES[move.captured] : undefined;
      const kind = givesCheckmate
        ? 'mate'
        : givesCheck && isCapture
          ? 'checking_capture'
          : isCapture
            ? 'capture'
            : 'check';

      return [
        {
          moveSan: move.san,
          kind,
          from: move.from,
          to: move.to,
          capturedPiece,
          capturedValue,
          isCapture,
          givesCheck,
          givesCheckmate,
        },
      ];
    });

    return (
      threats.sort(
        (a, b) =>
          Number(b.givesCheckmate) - Number(a.givesCheckmate) ||
          Number(b.givesCheck && b.isCapture) - Number(a.givesCheck && a.isCapture) ||
          (b.capturedValue ?? 0) - (a.capturedValue ?? 0) ||
          Number(b.givesCheck) - Number(a.givesCheck)
      )[0] ?? null
    );
  } catch {
    return null;
  }
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

function detectLineMotif({
  board,
  from,
  movedColor,
}: {
  board: ReturnType<Chess['board']>;
  from: string;
  movedColor: ChessColor;
}): TacticalMotifFacts {
  const movedPiece = boardPieceAt(board, from);
  const directions = slidingDirections(movedPiece?.type);
  if (!movedPiece || !directions.length) return {};

  for (const [fileStep, rankStep] of directions) {
    const rayPieces = firstPiecesOnRay(board, from, fileStep, rankStep, 2);
    const [first, second] = rayPieces;
    if (!first || first.piece.color === movedColor) continue;

    if (
      first.piece.type !== 'k' &&
      second?.piece.color !== movedColor &&
      second?.piece.type === 'k'
    ) {
      return {
        motif: 'pin',
        targetSquares: [first.square, second.square],
        targetPieces: [PIECE_NAMES[first.piece.type], 'king'],
      };
    }

    if (
      first.piece.type === 'k' &&
      second?.piece.color !== movedColor &&
      second.piece.type !== 'k'
    ) {
      return {
        motif: 'skewer',
        targetSquares: [first.square, second.square],
        targetPieces: ['king', PIECE_NAMES[second.piece.type]],
      };
    }
  }

  return {};
}

function detectDiscoveredAttackMotif({
  beforeFen,
  afterFen,
  moveFrom,
  movedColor,
}: {
  beforeFen?: string;
  afterFen: string;
  moveFrom?: string;
  movedColor: ChessColor;
}): TacticalMotifFacts {
  if (!beforeFen || !moveFrom) return {};

  try {
    const beforeBoard = new Chess(beforeFen).board();
    const afterBoard = new Chess(afterFen).board();
    const targets = ['k', 'q', 'r'] as const;

    for (let rowIndex = 0; rowIndex < afterBoard.length; rowIndex += 1) {
      for (let fileIndex = 0; fileIndex < afterBoard[rowIndex].length; fileIndex += 1) {
        const piece = afterBoard[rowIndex][fileIndex];
        if (!piece || piece.color !== movedColor || !slidingDirections(piece.type).length) continue;

        const from = coordsToSquare(fileIndex, 8 - rowIndex);
        if (from === moveFrom) continue;

        for (const [fileStep, rankStep] of slidingDirections(piece.type)) {
          const ray = raySquaresFrom(from, fileStep, rankStep);
          if (!ray.includes(moveFrom)) continue;

          const firstAfter: RayPiece | undefined = firstPiecesOnRay(
            afterBoard,
            from,
            fileStep,
            rankStep,
            1
          )[0];
          if (!firstAfter || firstAfter.piece.color === movedColor) continue;
          if (!targets.includes(firstAfter.piece.type as (typeof targets)[number])) continue;

          const firstBefore: RayPiece | undefined = firstPiecesOnRay(
            beforeBoard,
            from,
            fileStep,
            rankStep,
            1
          )[0];
          if (firstBefore?.square === moveFrom) {
            return {
              motif: 'discovered_attack',
              targetSquares: [firstAfter.square],
              targetPieces: [PIECE_NAMES[firstAfter.piece.type]],
            };
          }
        }
      }
    }
  } catch {
    return {};
  }

  return {};
}

function detectBackRankMotif({
  board,
  movedColor,
  givesCheck,
  givesCheckmate,
}: {
  board: ReturnType<Chess['board']>;
  movedColor: ChessColor;
  givesCheck: boolean;
  givesCheckmate: boolean;
}): TacticalMotifFacts {
  if (!givesCheck && !givesCheckmate) return {};

  const opponentColor = oppositeColor(movedColor);
  for (let rowIndex = 0; rowIndex < board.length; rowIndex += 1) {
    for (let fileIndex = 0; fileIndex < board[rowIndex].length; fileIndex += 1) {
      const piece = board[rowIndex][fileIndex];
      if (!piece || piece.color !== opponentColor || piece.type !== 'k') continue;

      const rank = 8 - rowIndex;
      const homeRank = opponentColor === 'w' ? 1 : 8;
      if (rank === homeRank) {
        return {
          motif: 'back_rank',
          targetSquares: [coordsToSquare(fileIndex, rank)],
          targetPieces: ['king'],
        };
      }
    }
  }

  return {};
}

function detectTrappedPieceMotif({
  afterFen,
  movedColor,
}: {
  afterFen: string;
  movedColor: ChessColor;
}): TacticalMotifFacts {
  try {
    const chess = new Chess(afterFen);
    const board = chess.board();
    const opponentColor = oppositeColor(movedColor);
    const legalMoves = chess.moves({ verbose: true });
    const trappedPieces: Array<{ square: string; piece: PieceCode; value: number }> = [];

    for (let rowIndex = 0; rowIndex < board.length; rowIndex += 1) {
      for (let fileIndex = 0; fileIndex < board[rowIndex].length; fileIndex += 1) {
        const piece = board[rowIndex][fileIndex];
        if (!piece || piece.color !== opponentColor || !['q', 'r', 'b', 'n'].includes(piece.type)) {
          continue;
        }

        const square = coordsToSquare(fileIndex, 8 - rowIndex);
        const attacked = countAttackers(board, square, movedColor) > 0;
        const escapeMoves = legalMoves.filter(move => move.from === square);
        if (attacked && escapeMoves.length <= 1) {
          trappedPieces.push({ square, piece: piece.type, value: PIECE_VALUES[piece.type] });
        }
      }
    }

    const trappedPiece = trappedPieces.sort((a, b) => b.value - a.value)[0];
    if (trappedPiece) {
      return {
        motif: 'trapped_piece',
        targetSquares: [trappedPiece.square],
        targetPieces: [PIECE_NAMES[trappedPiece.piece]],
      };
    }
  } catch {
    return {};
  }

  return {};
}

function detectTacticalMotif({
  beforeFen,
  moveSan,
}: {
  beforeFen?: string;
  moveSan?: string;
}): TacticalMotifFacts {
  if (!beforeFen || !moveSan) return {};

  try {
    const chess = new Chess(beforeFen);
    const move = chess.move(moveSan);
    if (!move) return {};

    const movedColor = move.color;
    const afterFen = chess.fen();
    const afterBoard = chess.board();
    const attackedPieces = attackedOpponentPiecesByPiece({
      board: afterBoard,
      from: move.to,
      color: movedColor,
    }).filter(piece => piece.value >= PIECE_VALUES.n || piece.piece === 'k');

    if (attackedPieces.length >= 2) {
      return {
        motif: 'fork',
        targetSquares: attackedPieces.slice(0, 3).map(piece => piece.square),
        targetPieces: attackedPieces.slice(0, 3).map(piece => PIECE_NAMES[piece.piece]),
      };
    }

    const backRankMotif = detectBackRankMotif({
      board: afterBoard,
      movedColor,
      givesCheck: chess.isCheck(),
      givesCheckmate: chess.isCheckmate(),
    });
    if (backRankMotif.motif) return backRankMotif;

    const lineMotif = detectLineMotif({
      board: afterBoard,
      from: move.to,
      movedColor,
    });
    if (lineMotif.motif) return lineMotif;

    const discoveredAttackMotif = detectDiscoveredAttackMotif({
      beforeFen,
      afterFen,
      moveFrom: move.from,
      movedColor,
    });
    if (discoveredAttackMotif.motif) return discoveredAttackMotif;

    const trappedPieceMotif = detectTrappedPieceMotif({ afterFen, movedColor });
    if (trappedPieceMotif.motif) return trappedPieceMotif;
  } catch {
    return {};
  }

  return {};
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
  const motif = detectTacticalMotif({ beforeFen, moveSan });
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
          bestMoveTacticalMotif: motif.motif,
          bestMoveTacticalMotifTargets: motif.targetSquares,
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
    bestMoveTacticalMotif: motif.motif,
    bestMoveTacticalMotifTargets: motif.targetSquares,
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

function firstBestMoveFromEvidence(evidence?: CoachEvidence) {
  if (evidence?.kind === 'line') return evidence.moves[0]?.san;
  if (evidence?.kind === 'single_move') return evidence.move.san;
  return undefined;
}

function buildTargetEvidenceForFacts(facts: GameAnalysisMoveFacts): CoachEvidence | undefined {
  if (facts.materialRiskSquare && facts.materialRiskPiece) {
    return {
      kind: 'piece',
      title: facts.materialRiskIsHanging ? 'Show the hanging piece' : 'Show the loose piece',
      pieces: [{ square: facts.materialRiskSquare, role: facts.materialRiskPiece }],
      summary: `${facts.materialRiskPiece} on ${facts.materialRiskSquare} needs attention.`,
    };
  }

  if (facts.opponentThreatMoveSan) {
    return {
      kind: 'single_move',
      title: facts.opponentThreatGivesCheckmate
        ? 'Show the mate threat'
        : 'Show the opponent reply',
      move: {
        san: facts.opponentThreatMoveSan,
        side: facts.playedBy === 'white' ? 'black' : 'white',
        plyIndex: facts.plyIndex + 1,
        isKeyMove: true,
      },
      summary: `${facts.moveSan} gives the opponent ${facts.opponentThreatMoveSan}.`,
    };
  }

  const targetSquares = facts.bestMoveTacticalMotifTargets?.length
    ? facts.bestMoveTacticalMotifTargets
    : facts.playedTacticalMotifTargets?.length
      ? facts.playedTacticalMotifTargets
      : facts.bestMoveTo
        ? [facts.bestMoveTo]
        : facts.moveTo
          ? [facts.moveTo]
          : [];

  if (targetSquares.length) {
    return {
      kind: 'square',
      title: 'Show the key square',
      squares: targetSquares,
      summary: `The important square is ${targetSquares.join(', ')}.`,
    };
  }

  return undefined;
}

function normalizeCoachEvidenceForCandidate({
  facts,
  candidate,
}: {
  facts: GameAnalysisMoveFacts;
  candidate: GameAnalysisCoachCandidate;
}): CoachEvidence | undefined {
  if (candidate.evidence?.kind === 'line') return candidate.evidence;

  const firstBestMove = firstBestMoveFromEvidence(candidate.evidence) ?? facts.bestMoveSan;
  const bestLineEvidence = buildBestMoveEvidence({
    bestMoveSan: firstBestMove,
    bestLine: facts.evidence?.kind === 'line' ? facts.evidence.moves : undefined,
    title: candidate.evidence?.title ?? 'Show the better line',
    summary: candidate.evidence?.summary,
  });

  if (
    bestLineEvidence?.kind === 'line' &&
    (candidate.eventType === 'missed_tactic' ||
      candidate.eventType === 'missed_win' ||
      candidate.eventType === 'advantage_lost' ||
      candidate.eventType === 'game_turning_point' ||
      candidate.eventType === 'blunder' ||
      candidate.eventType === 'mistake')
  ) {
    return bestLineEvidence;
  }

  if (candidate.evidence) return candidate.evidence;

  if (
    candidate.eventType === 'missed_tactic' ||
    candidate.eventType === 'missed_win' ||
    candidate.eventType === 'advantage_lost' ||
    candidate.eventType === 'game_turning_point'
  ) {
    return bestLineEvidence ?? buildTargetEvidenceForFacts(facts);
  }

  return buildTargetEvidenceForFacts(facts) ?? bestLineEvidence;
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

function primaryPolicyWeight(candidate: GameAnalysisCoachCandidate) {
  if (
    candidate.eventType === 'opponent_threat' &&
    candidate.analysisFacts.opponentThreatGivesCheckmate === true
  ) {
    return 9000;
  }

  if (
    candidate.eventType === 'missed_win' &&
    candidate.analysisFacts.bestMoveGivesCheckmate === true
  ) {
    return 8500;
  }

  if (candidate.eventType === 'missed_tactic') return 7000;
  if (candidate.eventType === 'blunder') return 6200;
  return 0;
}

function rankCoachCandidates(candidates: GameAnalysisCoachCandidate[]) {
  const ranked = [...candidates].sort(
    (a, b) => b.priority - a.priority || b.teachingWeight - a.teachingWeight
  );
  const policyPrimary = ranked
    .map((candidate, index) => ({ candidate, index, weight: primaryPolicyWeight(candidate) }))
    .filter(entry => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)[0];

  if (!policyPrimary || policyPrimary.index === 0) return ranked;

  return [policyPrimary.candidate, ...ranked.filter((_, index) => index !== policyPrimary.index)];
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

function gamePhaseFromPly(plyIndex: number): CoachGamePhase {
  if (plyIndex < 16) return 'opening';
  if (plyIndex >= 60) return 'endgame';
  return 'middlegame';
}

export function buildAnalyzedGameFromPgn({
  id,
  pgn,
  initialFen,
}: AnalyzedGameFromPgnInput): AnalyzedGame {
  const chess = initialFen ? new Chess(initialFen) : new Chess();
  chess.loadPgn(pgn);

  const moves = chess.history({ verbose: true }).map(
    (move, index): AnalyzedGameMove => ({
      id: `${id}:${index}`,
      san: move.san,
      plyIndex: index,
      playedBy: move.color === 'w' ? 'white' : 'black',
      phase: gamePhaseFromPly(index),
      hasEngineAnalysis: false,
      beforeFen: move.before,
      afterFen: move.after,
      afterPlayedEvalCp: 0,
    })
  );

  return {
    id,
    pgn,
    initialFen,
    moves,
  };
}

export function applySanMoveToFen(fen: string, san: string): AppliedSanMove {
  const chess = new Chess(fen);
  const beforeFen = chess.fen();
  const move = chess.move(san);

  if (!move) {
    throw new Error(`Illegal SAN move "${san}" for FEN: ${fen}`);
  }

  return {
    san: move.san,
    from: move.from,
    to: move.to,
    promotion: move.promotion,
    playedBy: move.color === 'w' ? 'white' : 'black',
    beforeFen,
    afterFen: chess.fen(),
  };
}

export function applyUciMoveToFen(fen: string, uci: string): AppliedUciMove {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
  const chess = new Chess(fen);
  const beforeFen = chess.fen();
  const move = chess.move({ from, to, promotion });

  if (!move) {
    throw new Error(`Illegal UCI move "${uci}" for FEN: ${fen}`);
  }

  return {
    uci,
    san: move.san,
    from: move.from,
    to: move.to,
    promotion: move.promotion,
    playedBy: move.color === 'w' ? 'white' : 'black',
    beforeFen,
    afterFen: chess.fen(),
  };
}

export function buildSanLineFromUci({
  fen,
  uciMoves,
  startPlyIndex = 0,
  maxMoves = 4,
}: BuildSanLineFromUciInput): CoachEvidenceMove[] {
  const chess = new Chess(fen);
  const moves: CoachEvidenceMove[] = [];

  for (const uci of uciMoves.slice(0, maxMoves)) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
    const move = chess.move({ from, to, promotion });

    if (!move) break;

    moves.push({
      san: move.san,
      side: move.color === 'w' ? 'white' : 'black',
      plyIndex: startPlyIndex + moves.length,
      isKeyMove: moves.length === 0,
    });
  }

  return moves;
}

function moveQualityEventType(
  classification: CoachClassification,
  input: GameAnalysisMoveEventInput
): CoachEventType {
  if (classification === 'brilliant') return 'brilliant_move';
  if (
    input.isOnlyGoodMove &&
    (classification === 'great' ||
      classification === 'best' ||
      classification === 'excellent' ||
      classification === 'good')
  ) {
    return 'only_move';
  }
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
  const playedMotif = detectTacticalMotif({
    beforeFen: input.beforeFen,
    moveSan: input.moveSan,
  });
  const themeTags = uniqueThemeTags([
    ...(input.themeTags ?? []),
    motifToThemeTag(playedMotif.motif),
    motifToThemeTag(bestMoveFacts.bestMoveTacticalMotif),
  ]);
  const materialRisk = detectMaterialRiskFacts({
    afterFen: chessFacts.afterFen,
    playedBy: input.playedBy ?? 'white',
  });
  const opponentThreat = detectOpponentThreatFacts(chessFacts.afterFen);
  const positionalDelta = detectPositionalDeltaFacts({
    beforeFen: input.beforeFen,
    afterFen: chessFacts.afterFen,
    playedBy: input.playedBy ?? 'white',
    moveFrom: chessFacts.moveFrom,
    moveTo: chessFacts.moveTo,
  });
  const pawnStructureDelta = detectPawnStructureDeltaFacts({
    beforeFen: input.beforeFen,
    afterFen: chessFacts.afterFen,
    playedBy: input.playedBy ?? 'white',
    moveFrom: chessFacts.moveFrom,
    moveTo: chessFacts.moveTo,
    movedPiece: chessFacts.movedPiece,
  });

  return {
    gameId: input.gameId,
    moveSan: input.moveSan,
    plyIndex: input.plyIndex,
    playedBy: input.playedBy ?? 'white',
    phase: input.phase,
    hasEngineAnalysis: input.hasEngineAnalysis ?? true,
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
    playedTacticalMotif: playedMotif.motif,
    playedTacticalMotifTargets: playedMotif.targetSquares,
    bestMoveTacticalMotif: bestMoveFacts.bestMoveTacticalMotif,
    bestMoveTacticalMotifTargets: bestMoveFacts.bestMoveTacticalMotifTargets,
    materialRiskSquare: materialRisk?.square,
    materialRiskPiece: materialRisk?.piece,
    materialRiskValue: materialRisk?.value,
    materialRiskAttackers: materialRisk?.attackers,
    materialRiskDefenders: materialRisk?.defenders,
    materialRiskIsHanging: materialRisk?.isHanging,
    opponentThreatMoveSan: opponentThreat?.moveSan,
    opponentThreatKind: opponentThreat?.kind,
    opponentThreatFrom: opponentThreat?.from,
    opponentThreatTo: opponentThreat?.to,
    opponentThreatCapturedPiece: opponentThreat?.capturedPiece,
    opponentThreatCapturedValue: opponentThreat?.capturedValue,
    opponentThreatIsCapture: opponentThreat?.isCapture,
    opponentThreatGivesCheck: opponentThreat?.givesCheck,
    opponentThreatGivesCheckmate: opponentThreat?.givesCheckmate,
    developedPiece: positionalDelta.developedPiece,
    developedFrom: positionalDelta.developedFrom,
    developedTo: positionalDelta.developedTo,
    centerControlBefore: positionalDelta.centerControlBefore,
    centerControlAfter: positionalDelta.centerControlAfter,
    centerControlDelta: positionalDelta.centerControlDelta,
    pieceActivityBefore: positionalDelta.pieceActivityBefore,
    pieceActivityAfter: positionalDelta.pieceActivityAfter,
    pieceActivityDelta: positionalDelta.pieceActivityDelta,
    pawnStructureIssue: pawnStructureDelta.pawnStructureIssue,
    pawnStructureSquare: pawnStructureDelta.pawnStructureSquare,
    passedPawnSquare: pawnStructureDelta.passedPawnSquare,
    passedPawnRank: pawnStructureDelta.passedPawnRank,
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
    secondBestMoveSan: input.secondBestMoveSan,
    secondBestPlayerEvalCp: input.secondBestEvalCp,
    bestMoveGapCp: input.bestMoveGapCp,
    centipawnLoss,
    centipawnGain,
    bestMoveSan: input.bestMoveSan,
    isBestMove: input.isBestMove,
    isOnlyGoodMove: input.isOnlyGoodMove,
    isCriticalMove: input.isCriticalMove,
    isSacrifice: input.isSacrifice,
    missedOpportunityCp: input.missedOpportunityCp,
    themeTags,
    persona: input.persona,
    evidence: input.evidence,
  };
}

function candidateVariables(facts: GameAnalysisMoveFacts): CoachEventVariables {
  return cleanVariables({
    moveSan: facts.moveSan,
    bestMoveSan: facts.bestMoveSan ?? null,
    threatMoveSan: facts.opponentThreatMoveSan ?? null,
    tacticMotif: facts.bestMoveTacticalMotif ?? facts.playedTacticalMotif ?? null,
    evalPawns: formatPawns(facts.afterPlayerEvalCp),
    targetPiece:
      facts.materialRiskPiece ?? facts.opponentThreatCapturedPiece ?? facts.developedPiece ?? null,
    targetSquare:
      facts.materialRiskSquare ??
      facts.opponentThreatTo ??
      facts.developedTo ??
      facts.pawnStructureSquare ??
      facts.passedPawnSquare ??
      facts.moveTo ??
      null,
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
    secondBestMoveSan: facts.secondBestMoveSan ?? null,
    secondBestCp: facts.secondBestPlayerEvalCp ?? null,
    bestMoveGapCp: facts.bestMoveGapCp ?? null,
    isBestMove: facts.isBestMove ?? null,
    isOnlyGoodMove: facts.isOnlyGoodMove ?? null,
    isCriticalMove: facts.isCriticalMove ?? null,
    isSacrifice: facts.isSacrifice ?? null,
    hasEngineAnalysis: facts.hasEngineAnalysis,
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
    playedTacticalMotif: facts.playedTacticalMotif ?? null,
    playedTacticalMotifTargets: facts.playedTacticalMotifTargets ?? null,
    bestMoveTacticalMotif: facts.bestMoveTacticalMotif ?? null,
    bestMoveTacticalMotifTargets: facts.bestMoveTacticalMotifTargets ?? null,
    materialRiskSquare: facts.materialRiskSquare ?? null,
    materialRiskPiece: facts.materialRiskPiece ?? null,
    materialRiskValue: facts.materialRiskValue ?? null,
    materialRiskAttackers: facts.materialRiskAttackers ?? null,
    materialRiskDefenders: facts.materialRiskDefenders ?? null,
    materialRiskIsHanging: facts.materialRiskIsHanging ?? null,
    opponentThreatMoveSan: facts.opponentThreatMoveSan ?? null,
    opponentThreatKind: facts.opponentThreatKind ?? null,
    opponentThreatFrom: facts.opponentThreatFrom ?? null,
    opponentThreatTo: facts.opponentThreatTo ?? null,
    opponentThreatCapturedPiece: facts.opponentThreatCapturedPiece ?? null,
    opponentThreatCapturedValue: facts.opponentThreatCapturedValue ?? null,
    opponentThreatIsCapture: facts.opponentThreatIsCapture ?? null,
    opponentThreatGivesCheck: facts.opponentThreatGivesCheck ?? null,
    opponentThreatGivesCheckmate: facts.opponentThreatGivesCheckmate ?? null,
    developedPiece: facts.developedPiece ?? null,
    developedFrom: facts.developedFrom ?? null,
    developedTo: facts.developedTo ?? null,
    centerControlBefore: facts.centerControlBefore ?? null,
    centerControlAfter: facts.centerControlAfter ?? null,
    centerControlDelta: facts.centerControlDelta ?? null,
    pieceActivityBefore: facts.pieceActivityBefore ?? null,
    pieceActivityAfter: facts.pieceActivityAfter ?? null,
    pieceActivityDelta: facts.pieceActivityDelta ?? null,
    pawnStructureIssue: facts.pawnStructureIssue ?? null,
    pawnStructureSquare: facts.pawnStructureSquare ?? null,
    passedPawnSquare: facts.passedPawnSquare ?? null,
    passedPawnRank: facts.passedPawnRank ?? null,
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

  if (
    !facts.bestMoveGivesCheckmate &&
    !facts.bestMoveGivesCheck &&
    !facts.bestMoveIsCapture &&
    !facts.bestMoveTacticalMotif
  ) {
    return null;
  }

  const eventType = facts.bestMoveGivesCheckmate
    ? 'missed_win'
    : facts.bestMoveGivesCheck || facts.bestMoveIsCapture
      ? 'missed_tactic'
      : missedOpportunityEventType(facts.missedOpportunityCp);
  const motifLabel = facts.bestMoveTacticalMotif?.replace(/_/g, ' ');
  const reason = facts.bestMoveGivesCheckmate
    ? 'missed_forced_mate'
    : facts.bestMoveTacticalMotif
      ? `missed_${facts.bestMoveTacticalMotif}`
      : facts.bestMoveGivesCheck && facts.bestMoveIsCapture
        ? 'missed_forcing_capture'
        : facts.bestMoveGivesCheck
          ? 'missed_checking_resource'
          : 'missed_material_tactic';
  const title = facts.bestMoveGivesCheckmate
    ? 'Show the missed mate'
    : facts.bestMoveTacticalMotif
      ? `Show the missed ${motifLabel}`
      : facts.bestMoveGivesCheck
        ? 'Show the forcing move'
        : 'Show the material tactic';
  const summary = facts.bestMoveGivesCheckmate
    ? `${facts.bestMoveSan} was the forcing mate idea in the position.`
    : facts.bestMoveTacticalMotif
      ? `${facts.bestMoveSan} was the ${motifLabel} idea in the position.`
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
      ...uniqueThemeTags([
        facts.bestMoveGivesCheckmate ? 'mate_threat' : undefined,
        facts.bestMoveGivesCheck ? 'king_safety' : undefined,
        facts.bestMoveGivesCheck ? 'tempo' : undefined,
        facts.bestMoveIsCapture ? 'material' : undefined,
        motifToThemeTag(facts.bestMoveTacticalMotif as TacticalMotifName | undefined),
      ]),
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

function materialRiskCandidate(facts: GameAnalysisMoveFacts): GameAnalysisCoachCandidate | null {
  if (!facts.materialRiskSquare || !facts.materialRiskPiece || !facts.materialRiskValue) {
    return null;
  }

  const classification =
    facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.blunderLossCp
      ? 'blunder'
      : facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.mistakeLossCp
        ? 'mistake'
        : 'inaccuracy';
  const eventType = facts.materialRiskIsHanging ? 'hanging_material' : 'loose_piece';
  const priority =
    (facts.materialRiskIsHanging ? 860 : 620) +
    facts.materialRiskValue * 45 +
    Math.max(0, facts.centipawnLoss);

  return makeCandidate({
    facts,
    eventType,
    classification,
    priority,
    teachingWeight: facts.materialRiskIsHanging ? 85 : 60,
    reason: facts.materialRiskIsHanging ? 'hanging_material_after_move' : 'loose_piece_after_move',
    themeTags: ['material', 'defense'],
    evidence: {
      kind: 'piece',
      title: facts.materialRiskIsHanging ? 'Show the hanging piece' : 'Show the loose piece',
      pieces: [{ square: facts.materialRiskSquare, role: facts.materialRiskPiece }],
      summary: facts.materialRiskIsHanging
        ? `${facts.materialRiskPiece} on ${facts.materialRiskSquare} is attacked and not defended.`
        : `${facts.materialRiskPiece} on ${facts.materialRiskSquare} is under more pressure than defense.`,
    },
  });
}

function playedTacticalMotifCandidate(
  facts: GameAnalysisMoveFacts
): GameAnalysisCoachCandidate | null {
  if (!facts.playedTacticalMotif) return null;
  if (
    facts.hasEngineAnalysis &&
    facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.mistakeLossCp
  ) {
    return null;
  }

  const motifLabel = facts.playedTacticalMotif.replace(/_/g, ' ');
  const targetSquares = facts.playedTacticalMotifTargets ?? (facts.moveTo ? [facts.moveTo] : []);

  return makeCandidate({
    facts,
    eventType: 'tactic_found',
    classification:
      facts.centipawnGain >= COACH_CLASSIFICATION_THRESHOLDS.greatGainCp ? 'great' : 'excellent',
    priority: 1180 + Math.max(0, facts.centipawnGain),
    teachingWeight: 90,
    reason: `played_${facts.playedTacticalMotif}`,
    themeTags: uniqueThemeTags([
      motifToThemeTag(facts.playedTacticalMotif as TacticalMotifName),
      'initiative',
      facts.givesCheck ? 'king_safety' : undefined,
      facts.isCapture ? 'material' : undefined,
    ]),
    evidence: targetSquares.length
      ? {
          kind: 'square',
          title: `Show the ${motifLabel}`,
          squares: targetSquares,
          summary: `${facts.moveSan} creates a ${motifLabel} motif.`,
        }
      : facts.evidence,
  });
}

function opponentThreatCandidate(facts: GameAnalysisMoveFacts): GameAnalysisCoachCandidate | null {
  if (!facts.opponentThreatMoveSan || !facts.opponentThreatKind) return null;

  const capturedValue = facts.opponentThreatCapturedValue ?? 0;
  const isHighValueCapture = capturedValue >= PIECE_VALUES.n;
  const isMeaningfulThreat =
    facts.opponentThreatGivesCheckmate ||
    isHighValueCapture ||
    (facts.opponentThreatGivesCheck &&
      facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.inaccuracyLossCp);

  if (!isMeaningfulThreat) return null;

  const classification = facts.opponentThreatGivesCheckmate
    ? 'blunder'
    : facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.mistakeLossCp
      ? 'mistake'
      : 'inaccuracy';
  const priority =
    (facts.opponentThreatGivesCheckmate
      ? 3000
      : facts.opponentThreatGivesCheck && facts.opponentThreatIsCapture
        ? 1180
        : facts.opponentThreatIsCapture
          ? 980
          : 760) +
    capturedValue * 55 +
    Math.max(0, facts.centipawnLoss);

  return makeCandidate({
    facts,
    eventType: 'opponent_threat',
    classification,
    priority,
    teachingWeight: facts.opponentThreatGivesCheckmate ? 100 : 75,
    reason: facts.opponentThreatGivesCheckmate
      ? 'opponent_mate_reply_after_move'
      : facts.opponentThreatGivesCheck && facts.opponentThreatIsCapture
        ? 'opponent_checking_capture_after_move'
        : facts.opponentThreatIsCapture
          ? 'opponent_capture_after_move'
          : 'opponent_check_after_move',
    themeTags: [
      ...(facts.opponentThreatGivesCheck ? (['king_safety', 'tempo'] as CoachThemeTag[]) : []),
      ...(facts.opponentThreatIsCapture ? (['material'] as CoachThemeTag[]) : []),
      'defense',
    ],
    evidence: {
      kind: 'single_move',
      title: facts.opponentThreatGivesCheckmate
        ? 'Show the mate threat'
        : 'Show the opponent reply',
      move: {
        san: facts.opponentThreatMoveSan,
        side: facts.playedBy === 'white' ? 'black' : 'white',
        plyIndex: facts.plyIndex + 1,
        isKeyMove: true,
        comment: facts.opponentThreatGivesCheckmate
          ? 'This reply would be checkmate.'
          : facts.opponentThreatIsCapture
            ? 'This reply wins material immediately.'
            : 'This reply gives check and takes the initiative.',
      },
      summary: `${facts.moveSan} gives the opponent ${facts.opponentThreatMoveSan}.`,
    },
  });
}

function developmentCandidate(facts: GameAnalysisMoveFacts): GameAnalysisCoachCandidate | null {
  if (!facts.developedPiece || !facts.developedFrom || !facts.developedTo) return null;
  if (facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.mistakeLossCp) return null;

  return makeCandidate({
    facts,
    eventType: 'development',
    classification:
      facts.centipawnGain >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp ? 'excellent' : 'good',
    priority: 520 + Math.max(0, facts.centipawnGain),
    teachingWeight: 50,
    reason: 'minor_piece_developed_from_home_square',
    themeTags: ['development', 'piece_activity'],
    evidence: {
      kind: 'plan',
      title: 'Show the developed piece',
      keyMove: facts.moveSan,
      targetSquares: [facts.developedFrom, facts.developedTo],
      summary: `${facts.moveSan} develops the ${facts.developedPiece} from ${facts.developedFrom} to ${facts.developedTo}.`,
    },
  });
}

function centerControlCandidate(facts: GameAnalysisMoveFacts): GameAnalysisCoachCandidate | null {
  if (!facts.centerControlDelta || facts.centerControlDelta < 2) return null;
  if (facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.mistakeLossCp) return null;

  return makeCandidate({
    facts,
    eventType: 'center_control',
    classification:
      facts.centipawnGain >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp ? 'excellent' : 'good',
    priority: 500 + facts.centerControlDelta * 25 + Math.max(0, facts.centipawnGain),
    teachingWeight: 45,
    reason: 'center_control_increased',
    themeTags: ['center', 'space'],
    evidence: {
      kind: 'square',
      title: 'Show the central squares',
      squares: [...CENTER_SQUARES],
      summary: `${facts.moveSan} increases central control from ${facts.centerControlBefore} to ${facts.centerControlAfter}.`,
    },
  });
}

function pieceActivityCandidate(facts: GameAnalysisMoveFacts): GameAnalysisCoachCandidate | null {
  if (!facts.pieceActivityDelta || facts.pieceActivityDelta < 3) return null;
  if (facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.mistakeLossCp) return null;

  return makeCandidate({
    facts,
    eventType: 'piece_activity',
    classification:
      facts.centipawnGain >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp ? 'excellent' : 'good',
    priority: 490 + facts.pieceActivityDelta * 20 + Math.max(0, facts.centipawnGain),
    teachingWeight: 45,
    reason: 'piece_activity_increased',
    themeTags: ['piece_activity'],
    evidence: facts.moveTo
      ? {
          kind: 'square',
          title: 'Show the active piece',
          squares: [facts.moveTo],
          summary: `${facts.moveSan} increases the moved piece's activity from ${facts.pieceActivityBefore} to ${facts.pieceActivityAfter}.`,
        }
      : facts.evidence,
  });
}

function pawnStructureCandidate(facts: GameAnalysisMoveFacts): GameAnalysisCoachCandidate | null {
  if (!facts.pawnStructureIssue || !facts.pawnStructureSquare) return null;
  if (facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.blunderLossCp) return null;

  const isDoubledPawn = facts.pawnStructureIssue === 'doubled_pawn';

  return makeCandidate({
    facts,
    eventType: 'pawn_structure',
    classification:
      facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.mistakeLossCp
        ? 'mistake'
        : 'inaccuracy',
    priority:
      (isDoubledPawn ? 610 : 560) +
      Math.max(0, facts.centipawnLoss) -
      Math.max(0, facts.centipawnGain),
    teachingWeight: isDoubledPawn ? 65 : 55,
    reason: isDoubledPawn ? 'doubled_pawn_created' : 'isolated_pawn_created',
    themeTags: ['pawn_structure'],
    evidence: {
      kind: 'square',
      title: isDoubledPawn ? 'Show the doubled pawn' : 'Show the isolated pawn',
      squares: [facts.pawnStructureSquare],
      summary: isDoubledPawn
        ? `${facts.moveSan} creates doubled pawns on the file.`
        : `${facts.moveSan} leaves this pawn without neighboring pawn support.`,
    },
  });
}

function passedPawnCandidate(facts: GameAnalysisMoveFacts): GameAnalysisCoachCandidate | null {
  if (!facts.passedPawnSquare || !facts.passedPawnRank) return null;
  if (facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.mistakeLossCp) return null;

  const promotionDistance =
    facts.playedBy === 'white' ? 8 - facts.passedPawnRank : facts.passedPawnRank - 1;

  return makeCandidate({
    facts,
    eventType: 'conversion',
    classification:
      facts.centipawnGain >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp ? 'excellent' : 'good',
    priority: 620 + (7 - promotionDistance) * 35 + Math.max(0, facts.centipawnGain),
    teachingWeight: promotionDistance <= 3 ? 85 : 65,
    reason: 'passed_pawn_created',
    themeTags: ['passed_pawn', 'endgame_conversion'],
    evidence: {
      kind: 'square',
      title: 'Show the passed pawn',
      squares: [facts.passedPawnSquare],
      summary: `${facts.moveSan} creates a passed pawn on ${facts.passedPawnSquare}.`,
    },
  });
}

function advantageLostCandidate(facts: GameAnalysisMoveFacts): GameAnalysisCoachCandidate | null {
  if (!facts.hasEngineAnalysis || typeof facts.beforePlayerEvalCp !== 'number') return null;
  if (facts.beforePlayerEvalCp < 180 || facts.afterPlayerEvalCp > 80) return null;
  if (facts.centipawnLoss < COACH_CLASSIFICATION_THRESHOLDS.missOpportunityCp) return null;

  const classification =
    facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.blunderLossCp
      ? 'blunder'
      : facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.mistakeLossCp
        ? 'mistake'
        : 'inaccuracy';

  return makeCandidate({
    facts,
    eventType: 'advantage_lost',
    classification,
    priority: 1280 + facts.centipawnLoss,
    teachingWeight: 90,
    reason: 'advantage_lost_by_eval_swing',
    themeTags: ['initiative', 'defense'],
    evidence: facts.evidence ?? buildBestMoveEvidence({ bestMoveSan: facts.bestMoveSan }),
  });
}

function gameTurningPointCandidate(
  facts: GameAnalysisMoveFacts
): GameAnalysisCoachCandidate | null {
  if (!facts.hasEngineAnalysis || typeof facts.beforePlayerEvalCp !== 'number') return null;

  const evalDelta = facts.afterPlayerEvalCp - facts.beforePlayerEvalCp;
  const changedLeader =
    facts.beforePlayerEvalCp <= -50 && facts.afterPlayerEvalCp >= 50
      ? true
      : facts.beforePlayerEvalCp >= 50 && facts.afterPlayerEvalCp <= -50;
  const largeSwing = Math.abs(evalDelta) >= 250;
  if (!changedLeader && !largeSwing) return null;

  const positive = evalDelta > 0;
  return makeCandidate({
    facts,
    eventType: 'game_turning_point',
    classification: positive
      ? evalDelta >= COACH_CLASSIFICATION_THRESHOLDS.greatGainCp
        ? 'great'
        : 'excellent'
      : facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.blunderLossCp
        ? 'blunder'
        : 'mistake',
    priority: 1180 + Math.abs(evalDelta),
    teachingWeight: 85,
    reason: changedLeader ? 'eval_leader_changed' : 'large_eval_swing',
    themeTags: positive ? ['initiative'] : ['defense'],
    evidence: facts.evidence ?? buildBestMoveEvidence({ bestMoveSan: facts.bestMoveSan }),
  });
}

function defensiveResourceCandidate(
  facts: GameAnalysisMoveFacts
): GameAnalysisCoachCandidate | null {
  if (!facts.hasEngineAnalysis || typeof facts.beforePlayerEvalCp !== 'number') return null;

  const underPressure = facts.beforePlayerEvalCp <= -150;
  const savedPosition =
    facts.centipawnGain >= 100 || (facts.isOnlyGoodMove && facts.centipawnLoss <= 20);
  if (!underPressure || !savedPosition) return null;

  return makeCandidate({
    facts,
    eventType: 'defensive_resource',
    classification: facts.isOnlyGoodMove ? 'great' : 'excellent',
    priority: 1120 + facts.centipawnGain + (facts.isOnlyGoodMove ? 140 : 0),
    teachingWeight: facts.isOnlyGoodMove ? 95 : 80,
    reason: facts.isOnlyGoodMove
      ? 'only_defensive_resource_found'
      : 'defensive_eval_recovery_found',
    themeTags: ['defense'],
    evidence: facts.evidence ?? buildBestMoveEvidence({ bestMoveSan: facts.bestMoveSan }),
  });
}

function advantagePreservedCandidate(
  facts: GameAnalysisMoveFacts
): GameAnalysisCoachCandidate | null {
  if (!facts.hasEngineAnalysis || typeof facts.beforePlayerEvalCp !== 'number') return null;
  if (facts.beforePlayerEvalCp < 180 || facts.afterPlayerEvalCp < 180) return null;
  if (facts.centipawnLoss > COACH_CLASSIFICATION_THRESHOLDS.goodLossCp) return null;

  return makeCandidate({
    facts,
    eventType: 'advantage_preserved',
    classification: facts.isBestMove ? 'best' : 'good',
    priority: 610 + Math.max(0, facts.afterPlayerEvalCp - 180),
    teachingWeight: 60,
    reason: 'advantage_preserved_without_counterplay',
    themeTags: ['simplification'],
    evidence: facts.evidence,
  });
}

function simplificationCandidate(facts: GameAnalysisMoveFacts): GameAnalysisCoachCandidate | null {
  if (!facts.isCapture || facts.phase === 'opening') return null;
  if (
    facts.afterPlayerEvalCp < 250 ||
    facts.centipawnLoss > COACH_CLASSIFICATION_THRESHOLDS.goodLossCp
  ) {
    return null;
  }

  return makeCandidate({
    facts,
    eventType: 'time_to_simplify',
    classification: 'good',
    priority: 700 + Math.max(0, facts.afterPlayerEvalCp - 250),
    teachingWeight: 65,
    reason: 'simplification_while_winning',
    themeTags: ['simplification', 'endgame_conversion', 'material'],
    evidence: facts.moveTo
      ? {
          kind: 'piece',
          title: 'Show the simplifying capture',
          pieces: [{ square: facts.moveTo, role: 'trade_square' }],
          summary: `${facts.moveSan} trades material while keeping a winning position.`,
        }
      : facts.evidence,
  });
}

function endgameTransitionCandidate(
  facts: GameAnalysisMoveFacts
): GameAnalysisCoachCandidate | null {
  if (facts.phase !== 'endgame' || !facts.isCapture) return null;
  if (facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.mistakeLossCp) return null;

  return makeCandidate({
    facts,
    eventType: 'endgame_transition',
    classification:
      facts.centipawnLoss <= COACH_CLASSIFICATION_THRESHOLDS.goodLossCp ? 'good' : 'inaccuracy',
    priority: 540 + Math.max(0, facts.centipawnGain),
    teachingWeight: 45,
    reason: 'capture_changes_endgame_shape',
    themeTags: ['endgame_conversion', 'pawn_structure'],
    evidence: facts.moveTo
      ? {
          kind: 'piece',
          title: 'Show the endgame transition',
          pieces: [{ square: facts.moveTo, role: 'transition_square' }],
          summary: `${facts.moveSan} changes the material balance as the game moves into an endgame.`,
        }
      : facts.evidence,
  });
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

  const playedMotif = playedTacticalMotifCandidate(facts);
  if (playedMotif) {
    candidates.push(playedMotif);
  }

  const riskCandidate = materialRiskCandidate(facts);
  if (riskCandidate) {
    candidates.push(riskCandidate);
  }

  const threatCandidate = opponentThreatCandidate(facts);
  if (threatCandidate) {
    candidates.push(threatCandidate);
  }

  const development = developmentCandidate(facts);
  if (development) {
    candidates.push(development);
  }

  const centerControl = centerControlCandidate(facts);
  if (centerControl) {
    candidates.push(centerControl);
  }

  const pieceActivity = pieceActivityCandidate(facts);
  if (pieceActivity) {
    candidates.push(pieceActivity);
  }

  const pawnStructure = pawnStructureCandidate(facts);
  if (pawnStructure) {
    candidates.push(pawnStructure);
  }

  const passedPawn = passedPawnCandidate(facts);
  if (passedPawn) {
    candidates.push(passedPawn);
  }

  const missedTacticCandidate = missedTacticalIdea(facts);
  if (missedTacticCandidate) {
    candidates.push(missedTacticCandidate);
  }

  const advantageLost = advantageLostCandidate(facts);
  if (advantageLost) {
    candidates.push(advantageLost);
  }

  const turningPoint = gameTurningPointCandidate(facts);
  if (turningPoint) {
    candidates.push(turningPoint);
  }

  const defensiveResource = defensiveResourceCandidate(facts);
  if (defensiveResource) {
    candidates.push(defensiveResource);
  }

  const simplification = simplificationCandidate(facts);
  if (simplification) {
    candidates.push(simplification);
  }

  const endgameTransition = endgameTransitionCandidate(facts);
  if (endgameTransition) {
    candidates.push(endgameTransition);
  }

  const advantagePreserved = advantagePreservedCandidate(facts);
  if (advantagePreserved) {
    candidates.push(advantagePreserved);
  }

  if (
    facts.hasEngineAnalysis &&
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

  if (
    facts.hasEngineAnalysis &&
    facts.centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.inaccuracyLossCp
  ) {
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

  if (facts.hasEngineAnalysis && (facts.isBestMove || facts.centipawnLoss <= 10)) {
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
  } else if (
    facts.hasEngineAnalysis &&
    facts.centipawnGain >= COACH_CLASSIFICATION_THRESHOLDS.excellentGainCp
  ) {
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

  return rankCoachCandidates(candidates);
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
    evidence: normalizeCoachEvidenceForCandidate({ facts, candidate }),
    source: candidate.themeTags.length ? 'tactical_detector' : 'engine_analysis',
    contentVersion: 1,
  };
}

function hasOverlappingTeachingPoint(primary: CoachEvent, candidate: CoachEvent) {
  if (primary.eventType === candidate.eventType) return true;

  const primaryReason = String(primary.analysisFacts.candidateReason ?? '');
  const candidateReason = String(candidate.analysisFacts.candidateReason ?? '');
  if (primaryReason && primaryReason === candidateReason) return true;

  if (
    primary.eventType === 'missed_tactic' &&
    (candidate.eventType === 'missed_win' || candidate.eventType === 'blunder')
  ) {
    return candidate.eventType !== 'blunder';
  }

  if (
    primary.eventType === 'hanging_material' &&
    candidate.eventType === 'opponent_threat' &&
    primary.analysisFacts.materialRiskSquare === candidate.analysisFacts.opponentThreatTo
  ) {
    return false;
  }

  return false;
}

export function selectComplementaryGameAnalysisEvent(events: CoachEvent[]): CoachEvent | null {
  const [primary, ...candidates] = events;
  if (!primary) return null;

  return (
    candidates.find(candidate => {
      if (!(COMPLEMENTARY_EVENT_TYPES as readonly CoachEventType[]).includes(candidate.eventType)) {
        return false;
      }
      if (hasOverlappingTeachingPoint(primary, candidate)) return false;
      return true;
    }) ?? null
  );
}

function summaryThemeFromEvents(events: CoachEvent[]) {
  const themeCounts = new Map<CoachThemeTag, number>();
  for (const event of events) {
    for (const themeTag of event.themeTags) {
      themeCounts.set(themeTag, (themeCounts.get(themeTag) ?? 0) + 1);
    }
  }

  const [topTheme] =
    [...themeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
  if (topTheme) return topTheme.replace(/_/g, ' ');

  const firstMajorEvent = events.find(
    event => event.severity === 'critical' || event.severity === 'major'
  );
  if (firstMajorEvent) return firstMajorEvent.eventType.replace(/_/g, ' ');

  return 'move quality';
}

function bestAndWorstMoveFacts(events: CoachEvent[]) {
  const sortedByPriority = [...events].sort((a, b) => {
    const bPriority = Number(b.analysisFacts.candidatePriority ?? 0);
    const aPriority = Number(a.analysisFacts.candidatePriority ?? 0);
    return bPriority - aPriority;
  });
  const worst = sortedByPriority.find(event =>
    ['blunder', 'mistake', 'missed_tactic', 'missed_win', 'opponent_threat'].includes(
      event.eventType
    )
  );
  const best = sortedByPriority.find(event =>
    ['brilliant_move', 'great_move', 'best_move', 'only_move', 'tactic_found'].includes(
      event.eventType
    )
  );
  const turningPoint = sortedByPriority.find(event => event.eventType === 'game_turning_point');

  return {
    bestMoveSan: best?.variables.moveSan ?? null,
    worstMoveSan: worst?.variables.moveSan ?? null,
    turningPointPly: turningPoint?.plyIndex ?? null,
  };
}

function buildSummaryEvent({
  gameId,
  eventType,
  phase,
  events,
  persona,
}: {
  gameId: string;
  eventType: 'phase_summary' | 'game_summary';
  phase?: CoachGamePhase;
  events: CoachEvent[];
  persona?: CoachPersona;
}): CoachEvent {
  const moveFacts = bestAndWorstMoveFacts(events);
  const summaryTheme = summaryThemeFromEvents(events);

  return {
    id: `game:${gameId}:${eventType}${phase ? `:${phase}` : ''}`,
    domain: 'game_analysis',
    subject: {
      kind: 'game',
      id: gameId,
    },
    plyIndex: events[0]?.plyIndex ?? 0,
    eventType,
    classification: 'complete',
    tone: 'complete',
    severity: 'info',
    persona: persona ?? 'neutral',
    phase,
    themeTags: [...new Set(events.flatMap(event => event.themeTags))],
    messageKey: '',
    spokenKey: '',
    variables: cleanVariables({
      summaryTheme,
      bestMoveSan: moveFacts.bestMoveSan,
      worstMoveSan: moveFacts.worstMoveSan,
      turningPointPly: moveFacts.turningPointPly,
    }),
    analysisFacts: cleanAnalysisFacts({
      summaryTheme,
      eventCount: events.length,
      bestMoveSan: moveFacts.bestMoveSan,
      worstMoveSan: moveFacts.worstMoveSan,
      turningPointPly: moveFacts.turningPointPly,
    }),
    source: 'engine_analysis',
    contentVersion: SUMMARY_EVENT_VERSION,
  };
}

export function buildGameAnalysisSummaryEvents({
  game,
  persona,
}: GameAnalysisEventsFromGameInput): CoachEvent[] {
  const moveEvents = game.moves.flatMap(move =>
    buildGameAnalysisMoveEventsFromAnalyzedGameMove({ game, move, persona })
  );
  if (!moveEvents.length) return [];

  const summaries: CoachEvent[] = [];
  for (const phase of COACH_GAME_PHASES) {
    const phaseEvents = moveEvents.filter(event => event.phase === phase);
    if (phaseEvents.length) {
      summaries.push(
        buildSummaryEvent({
          gameId: game.id,
          eventType: 'phase_summary',
          phase,
          events: phaseEvents,
          persona,
        })
      );
    }
  }

  summaries.push(
    buildSummaryEvent({
      gameId: game.id,
      eventType: 'game_summary',
      events: moveEvents,
      persona,
    })
  );

  return summaries;
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
  const alternativePlayerEvals = input.bestMoveAlternatives
    ?.map(alternative => ({
      ...alternative,
      playerEvalCp: toPlayerPerspective(alternative.evalCp, input.playedBy),
    }))
    .filter(
      (alternative): alternative is GameAnalysisMoveAlternative & { playerEvalCp: number } =>
        typeof alternative.playerEvalCp === 'number'
    )
    .sort((a, b) => b.playerEvalCp - a.playerEvalCp);
  const secondBestAlternative = alternativePlayerEvals?.find(
    alternative => alternative.san !== input.bestMoveSan
  );
  const bestMoveGapCp =
    typeof bestPlayerEval === 'number' && typeof secondBestAlternative?.playerEvalCp === 'number'
      ? Math.max(0, bestPlayerEval - secondBestAlternative.playerEvalCp)
      : undefined;

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
  const isOnlyGoodMove =
    input.isOnlyGoodMove ?? Boolean(isBestMove && bestMoveGapCp && bestMoveGapCp >= 150);
  const isCriticalMove =
    input.isCriticalMove ??
    Boolean(
      (typeof bestMoveGapCp === 'number' && bestMoveGapCp >= 150) ||
      centipawnLoss >= COACH_CLASSIFICATION_THRESHOLDS.missOpportunityCp
    );
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
    hasEngineAnalysis: input.hasEngineAnalysis ?? true,
    beforeFen: input.beforeFen,
    beforeEvalCp: beforePlayerEval,
    afterEvalCp: playedPlayerEval,
    centipawnLoss,
    centipawnGain,
    bestMoveSan: input.bestMoveSan,
    secondBestMoveSan: secondBestAlternative?.san,
    secondBestEvalCp: secondBestAlternative?.playerEvalCp,
    bestMoveGapCp,
    isBestMove,
    isOnlyGoodMove,
    isCriticalMove,
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
    hasEngineAnalysis: move.hasEngineAnalysis,
    beforeFen: move.beforeFen,
    beforeEvalCp: move.beforeEvalCp,
    afterPlayedEvalCp: move.afterPlayedEvalCp,
    afterBestEvalCp: move.afterBestEvalCp,
    bestMoveSan: move.bestMoveSan,
    bestLine: move.bestLine,
    bestMoveAlternatives: move.bestMoveAlternatives,
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
  includeSummaries = false,
}: GameAnalysisEventsFromGameInput): CoachEvent[] {
  const moveEvents = game.moves.flatMap(move =>
    buildGameAnalysisMoveEventsFromAnalyzedGameMove({ game, move, persona })
  );
  if (!includeSummaries) return moveEvents;
  return [...moveEvents, ...buildGameAnalysisSummaryEvents({ game, persona })];
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
