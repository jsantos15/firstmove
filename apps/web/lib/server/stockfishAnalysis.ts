import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import type { AnalyzedGame, AnalyzedGameMove } from '@firstmove/core';
import {
  applySanMoveToFen,
  applyUciMoveToFen,
  buildSanLineFromUci,
} from '@firstmove/core';

type StockfishEngine = {
  send(command: string, onDone?: (line: string) => void, onStream?: (line: string) => void): void;
  quit(): void;
};

type StockfishScore = {
  type: 'cp' | 'mate';
  value: number;
};

type StockfishInfo = {
  depth: number | null;
  multipv: number;
  score: StockfishScore | null;
  pv: string[];
};

type FenAnalysis = {
  fen: string;
  depth: number | null;
  evalCp?: number;
  bestMoveUci?: string;
  pv: string[];
  lines: Array<{
    multipv: number;
    evalCp?: number;
    bestMoveUci?: string;
    pv: string[];
    depth: number | null;
  }>;
};

export type EnrichAnalyzedGameInput = {
  game: AnalyzedGame;
  depth?: number;
  maxMoves?: number;
};

export type EnrichAnalyzedGameResult = {
  game: AnalyzedGame;
  analyzedMoves: number;
  requestedMoves: number;
  maxMoves: number;
  depth: number;
};

const require = createRequire(import.meta.url);
const loadEngine = require('stockfish/examples/loadEngine.js') as (enginePath: string) => StockfishEngine;
const MATE_SCORE_CP = 100_000;
const MULTIPV_COUNT = 3;

function resolveStockfishSrcPath() {
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'stockfish', 'src'),
    path.join(process.cwd(), '..', '..', 'node_modules', '.pnpm', 'stockfish@17.1.0', 'node_modules', 'stockfish', 'src'),
    path.join(path.dirname(require.resolve('stockfish/package.json')), 'src'),
  ];

  const stockfishSrcPath = candidates.find(candidate => fs.existsSync(candidate));
  if (!stockfishSrcPath) {
    throw new Error('Could not resolve Stockfish 17.1 assets from node_modules.');
  }

  return stockfishSrcPath;
}

function resolveLiteSingleEnginePath() {
  const stockfishSrc = resolveStockfishSrcPath();
  const entry = fs
    .readdirSync(stockfishSrc)
    .find(name => /^stockfish-17\.1-lite-single-.*\.js$/.test(name));

  if (!entry) {
    throw new Error(`Could not find Stockfish 17.1 lite-single engine in ${stockfishSrc}`);
  }

  return path.join(stockfishSrc, entry);
}

function parseInfoLine(line: string): StockfishInfo | null {
  if (!line.startsWith('info ')) return null;

  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);

  return {
    depth: depthMatch ? Number(depthMatch[1]) : null,
    multipv: multipvMatch ? Number(multipvMatch[1]) : 1,
    score: scoreMatch
      ? {
          type: scoreMatch[1] as StockfishScore['type'],
          value: Number(scoreMatch[2]),
        }
      : null,
    pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : [],
  };
}

function fenSideToMove(fen: string) {
  return fen.split(/\s+/)[1] === 'b' ? 'black' : 'white';
}

function scoreToWhiteEvalCp(score: StockfishScore | null, fen: string) {
  if (!score) return undefined;

  const sideMultiplier = fenSideToMove(fen) === 'white' ? 1 : -1;
  if (score.type === 'cp') return score.value * sideMultiplier;

  const mateScore = Math.sign(score.value) * (MATE_SCORE_CP - Math.min(Math.abs(score.value), 999));
  return mateScore * sideMultiplier;
}

function sendCommand(engine: StockfishEngine, command: string) {
  return new Promise<string>(resolve => {
    engine.send(command, resolve);
  });
}

async function analyzeFen(engine: StockfishEngine, fen: string, depth: number): Promise<FenAnalysis> {
  const latestInfoByMultipv = new Map<number, StockfishInfo>();

  await sendCommand(engine, 'ucinewgame');
  await sendCommand(engine, `position fen ${fen}`);

  const bestmoveLine = await new Promise<string>(resolve => {
    engine.send(`go depth ${depth}`, resolve, line => {
      const info = parseInfoLine(line);
      if (!info || !info.score) return;

      const latestInfo = latestInfoByMultipv.get(info.multipv);
      if (!latestInfo || (info.depth ?? 0) >= (latestInfo.depth ?? 0)) {
        latestInfoByMultipv.set(info.multipv, info);
      }
    });
  });

  const finalInfo = latestInfoByMultipv.get(1) ?? null;
  const bestMoveMatch = bestmoveLine.match(/^bestmove\s+(\S+)/);
  const bestMoveUci =
    bestMoveMatch?.[1] && bestMoveMatch[1] !== '(none)' ? bestMoveMatch[1] : undefined;
  const lines = [...latestInfoByMultipv.values()]
    .sort((a, b) => a.multipv - b.multipv)
    .map(info => ({
      multipv: info.multipv,
      evalCp: scoreToWhiteEvalCp(info.score, fen),
      bestMoveUci: info.pv[0],
      pv: info.pv,
      depth: info.depth,
    }));

  return {
    fen,
    depth: finalInfo?.depth ?? null,
    evalCp: scoreToWhiteEvalCp(finalInfo?.score ?? null, fen),
    bestMoveUci,
    pv: finalInfo?.pv ?? [],
    lines,
  };
}

async function enrichMove({
  engine,
  move,
  depth,
}: {
  engine: StockfishEngine;
  move: AnalyzedGameMove;
  depth: number;
}): Promise<AnalyzedGameMove> {
  if (!move.beforeFen) return move;

  const beforeFen = move.beforeFen;
  const playedMove = applySanMoveToFen(beforeFen, move.san);
  const before = await analyzeFen(engine, beforeFen, depth);
  const afterPlayed = await analyzeFen(engine, playedMove.afterFen, depth);
  const bestMove = before.bestMoveUci ? applyUciMoveToFen(beforeFen, before.bestMoveUci) : null;
  const afterBest = bestMove ? await analyzeFen(engine, bestMove.afterFen, depth) : null;
  const bestMoveAlternatives = before.lines.flatMap(line => {
    const bestMoveUci = line.bestMoveUci;
    if (!bestMoveUci) return [];

    try {
      const appliedAlternative = applyUciMoveToFen(beforeFen, bestMoveUci);
      return [{ san: appliedAlternative.san, evalCp: line.evalCp }];
    } catch {
      return [];
    }
  });
  const bestLine = buildSanLineFromUci({
    fen: beforeFen,
    uciMoves: before.pv.length ? before.pv : before.bestMoveUci ? [before.bestMoveUci] : [],
    startPlyIndex: move.plyIndex,
    maxMoves: 4,
  });

  return {
    ...move,
    hasEngineAnalysis: true,
    afterFen: playedMove.afterFen,
    beforeEvalCp: before.evalCp,
    afterPlayedEvalCp: afterPlayed.evalCp ?? move.afterPlayedEvalCp,
    afterBestEvalCp: afterBest?.evalCp,
    bestMoveSan: bestMove?.san,
    bestLine: bestLine.length ? bestLine : undefined,
    bestMoveAlternatives: bestMoveAlternatives.length ? bestMoveAlternatives : undefined,
    isCriticalMove:
      typeof afterBest?.evalCp === 'number' && typeof afterPlayed.evalCp === 'number'
        ? Math.abs(afterBest.evalCp - afterPlayed.evalCp) >= 150
        : move.isCriticalMove,
  };
}

export async function enrichAnalyzedGameWithStockfish({
  game,
  depth = 8,
  maxMoves = game.moves.length,
}: EnrichAnalyzedGameInput): Promise<EnrichAnalyzedGameResult> {
  const engine = loadEngine(resolveLiteSingleEnginePath());
  const boundedMoves = game.moves.slice(0, Math.max(0, maxMoves));

  try {
    await sendCommand(engine, 'uci');
    await sendCommand(engine, `setoption name MultiPV value ${MULTIPV_COUNT}`);
    await sendCommand(engine, 'isready');

    const enrichedMoves: AnalyzedGameMove[] = [];
    for (const move of boundedMoves) {
      enrichedMoves.push(await enrichMove({ engine, move, depth }));
    }

    return {
      game: {
        ...game,
        moves: [...enrichedMoves, ...game.moves.slice(boundedMoves.length)],
      },
      analyzedMoves: enrichedMoves.length,
      requestedMoves: game.moves.length,
      maxMoves,
      depth,
    };
  } finally {
    engine.quit();
  }
}
