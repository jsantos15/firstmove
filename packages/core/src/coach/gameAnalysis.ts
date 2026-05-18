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
    threatMoveSan: facts.opponentThreatMoveSan ?? null,
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
