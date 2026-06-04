import type { NextRequest } from 'next/server';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const maxDuration = 12;

type StockfishEngine = {
  send(command: string, onDone?: (line: string) => void, onStream?: (line: string) => void): void;
  stop_moves(): void;
  quit(): void;
};

const _require = createRequire(import.meta.url);
const loadEngine = _require('stockfish/examples/loadEngine.js') as (p: string) => StockfishEngine;

function resolveEnginePath(): string {
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'stockfish', 'src'),
    path.join(
      process.cwd(),
      '..', '..', 'node_modules', '.pnpm',
      'stockfish@17.1.0', 'node_modules', 'stockfish', 'src'
    ),
    path.join(path.dirname(_require.resolve('stockfish/package.json')), 'src'),
  ];
  const src = candidates.find(c => fs.existsSync(c));
  if (!src) throw new Error('Cannot resolve Stockfish assets');
  const entry = fs.readdirSync(src).find(name => /^stockfish-17\.1-lite-single-.*\.js$/.test(name));
  if (!entry) throw new Error('Cannot find Stockfish lite-single engine');
  return path.join(src, entry);
}

function parseBestMove(line: string): string | null {
  if (!line.startsWith('info ')) return null;
  const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
  if (multipvMatch && Number(multipvMatch[1]) !== 1) return null;
  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const pvMatch = line.match(/\bpv\s+(\S+)/);
  if (!depthMatch || !pvMatch) return null;
  return pvMatch[1];
}

let cachedEnginePath: string | null = null;
function getEnginePath(): string {
  if (!cachedEnginePath) cachedEnginePath = resolveEnginePath();
  return cachedEnginePath;
}

// ─── Singleton ────────────────────────────────────────────────────────────────
// Only one Stockfish instance is ever active at a time. When a new request
// arrives it synchronously kills whatever was running before starting.
let activeCancel: (() => void) | null = null;

function killActive() {
  const cancel = activeCancel;
  activeCancel = null;
  cancel?.();
}

export async function GET(request: NextRequest) {
  const fen = request.nextUrl.searchParams.get('fen');
  if (!fen) return new Response('Missing fen', { status: 400 });

  let enginePath: string;
  try {
    enginePath = getEnginePath();
  } catch (err) {
    return new Response((err as Error).message, { status: 500 });
  }

  // Kill previous analysis immediately, before spawning anything new.
  killActive();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const engine = loadEngine(enginePath);
      let finished = false;
      let goResolve: (() => void) | null = null;

      const enqueue = (data: object) => {
        if (finished) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        if (activeCancel === finish) activeCancel = null;
        const r = goResolve;
        goResolve = null;
        r?.();
        try { engine.quit(); } catch {}
        try { controller.close(); } catch {}
      };

      // Register this analysis as the active one so the next request can kill it.
      activeCancel = finish;

      // Also clean up when the client disconnects.
      request.signal.addEventListener('abort', finish, { once: true });

      try {
        await new Promise<void>(r => engine.send('uci', () => r()));
        if (finished) return;
        await new Promise<void>(r => engine.send('isready', () => r()));
        if (finished) return;

        engine.send(`position fen ${fen}`);

        await new Promise<void>(resolve => {
          goResolve = resolve;
          engine.send(
            'go movetime 8000',
            (bestmoveLine) => {
              if (!finished) {
                const match = bestmoveLine.match(/^bestmove\s+(\S+)/);
                const move = match?.[1] && match[1] !== '(none)' ? match[1] : null;
                if (move) enqueue({ type: 'bestmove', move });
                enqueue({ type: 'done' });
              }
              finish();
            },
            (line) => {
              if (finished) return;
              const move = parseBestMove(line);
              if (move) enqueue({ type: 'update', move });
            }
          );
        });
      } catch {
        finish();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
