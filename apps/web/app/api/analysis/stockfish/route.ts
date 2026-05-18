import { NextResponse } from 'next/server';
import type { AnalyzedGame } from '@firstmove/core';
import { enrichAnalyzedGameWithStockfish } from '@/lib/server/stockfishAnalysis';

export const runtime = 'nodejs';
export const maxDuration = 60;

type StockfishAnalysisRequest = {
  game?: AnalyzedGame;
  depth?: number;
  maxMoves?: number;
};

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StockfishAnalysisRequest;
    if (!body.game || !Array.isArray(body.game.moves)) {
      return NextResponse.json({ error: 'Missing analyzed game payload.' }, { status: 400 });
    }

    const result = await enrichAnalyzedGameWithStockfish({
      game: body.game,
      depth: boundedInteger(body.depth, 8, 1, 14),
      maxMoves: boundedInteger(body.maxMoves, 40, 1, 80),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Stockfish analysis failed.',
      },
      { status: 500 }
    );
  }
}
