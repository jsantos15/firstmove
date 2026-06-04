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
  if (!line.match(/\bdepth\s+\d+/) || !line.match(/\bpv\s+\S+/)) return null;
  return line.match(/\bpv\s+(\S+)/)?.[1] ?? null;
}

let cachedEnginePath: string | null = null;
function getEnginePath(): string {
  if (!cachedEnginePath) cachedEnginePath = resolveEnginePath();
  return cachedEnginePath;
}

// ─── Singleton ────────────────────────────────────────────────────────────────
// Only one Stockfish instance ever runs. Each new request kills the previous one
// synchronously before starting.
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

  // Kill whatever was running — synchronously, before touching the engine.
  killActive();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const engine = loadEngine(enginePath);
      let finished = false;

      // Single resolve tracked at module level — always points to whichever
      // await is currently blocked (uci, isready, or go). finish() calls it
      // to guarantee the async function exits in every phase.
      let pendingResolve: (() => void) | null = null;

      const enqueue = (data: object) => {
        if (finished) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        if (activeCancel === finish) activeCancel = null;
        const r = pendingResolve;
        pendingResolve = null;
        r?.();                        // unblock whichever await is pending
        try { engine.quit(); } catch {}
        try { controller.close(); } catch {}
      };

      activeCancel = finish;
      request.signal.addEventListener('abort', finish, { once: true });

      // Awaits any engine command while remaining cancellable via finish().
      const waitFor = (cmd: string): Promise<void> =>
        new Promise<void>(resolve => {
          pendingResolve = resolve;
          engine.send(cmd, () => {
            if (!finished) pendingResolve = null;
            resolve();
          });
        });

      try {
        await waitFor('uci');
        if (finished) return;
        await waitFor('isready');
        if (finished) return;

        engine.send(`position fen ${fen}`);

        await new Promise<void>(resolve => {
          pendingResolve = resolve;
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
