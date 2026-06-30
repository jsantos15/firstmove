'use client';

import { useState, useEffect, useRef } from 'react';

const WORKER_SCRIPT = '/stockfish/stockfish-17.1-lite-single-03e3232.js';
const MIN_DISPLAY_DEPTH = 8;
/** Auto-analysis stops at this depth (unless time runs out first). */
const TARGET_DEPTH = 25;

export const ENGINE_DISPLAY_NAME = 'SF 17.1 lite';

export interface EngineLine {
  bestMoveUci: string | null;
  evalCp: number | null;
  pvUci: string[];
  depth: number | null;
}

interface PositionAnalysis {
  lines: EngineLine[];
  // Convenience aliases for lines[0]
  bestMoveUci: string | null;
  evalCp: number | null;
  depth: number | null;
  isAnalyzing: boolean;
  isDone: boolean;
}

interface CachedAnalysis {
  lines: EngineLine[];
  maxDepth: number;
  /** True when analysis reached TARGET_DEPTH — suppresses auto re-analysis on revisit. */
  reachedTarget: boolean;
}

let sharedWorker: Worker | null = null;
let workerReadyPromise: Promise<void> | null = null;

/** Per-position analysis cache keyed by `${fen}:${numLines}`. Persists the session. */
const analysisCache = new Map<string, CachedAnalysis>();

function cacheKey(fen: string, numLines: number): string {
  return `${fen}:${numLines}`;
}

function ensureWorker(): Promise<void> {
  if (workerReadyPromise) return workerReadyPromise;
  sharedWorker = new Worker(WORKER_SCRIPT);
  workerReadyPromise = new Promise<void>(resolve => {
    function onInit(e: MessageEvent) {
      const line = typeof e.data === 'string' ? e.data : String(e.data);
      if (line === 'uciok') sharedWorker!.postMessage('isready');
      else if (line === 'readyok') {
        sharedWorker!.removeEventListener('message', onInit);
        resolve();
      }
    }
    sharedWorker!.addEventListener('message', onInit);
    sharedWorker!.postMessage('uci');
  });
  return workerReadyPromise;
}

function emptyLine(preserveEvalCp?: number | null): EngineLine {
  return { bestMoveUci: null, evalCp: preserveEvalCp ?? null, pvUci: [], depth: null };
}

export function usePositionAnalysis(
  fen: string,
  extendKey = 0,
  numLines = 1,
  movetime = 8000,
  enabled = true,
): PositionAnalysis {
  const key = cacheKey(fen, numLines);

  // Initialize from cache on first mount so revisited positions load instantly.
  const [lines, setLines] = useState<EngineLine[]>(() => {
    const c = analysisCache.get(key);
    return c?.lines ?? [emptyLine()];
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDone, setIsDone] = useState(() => {
    const c = analysisCache.get(key);
    return c?.reachedTarget ?? false;
  });

  // Read movetime via ref so the slider value is always current inside the closure
  // without restarting analysis on every drag tick.
  const movetimeRef = useRef(movetime);
  movetimeRef.current = movetime;

  // Tracks the highest depth line[0] has reached; used as baseline for extensions
  // and as the starting point when resuming a partially-analyzed position.
  const lastDepthRef = useRef(0);

  // Detects FEN changes within the effect to prevent a stale extendKey from being
  // mistaken for a genuine extension request on a new position.
  const prevFenRef = useRef<string>('');

  useEffect(() => {
    if (!enabled) {
      sharedWorker?.postMessage('stop');
      setLines(Array.from({ length: numLines }, () => emptyLine()));
      setIsAnalyzing(false);
      setIsDone(false);
      return;
    }

    const cached = analysisCache.get(key);
    const fenChanged = fen !== prevFenRef.current;
    prevFenRef.current = fen;

    // An extension only makes sense for the same FEN going deeper.
    const isExtension = !fenChanged && extendKey > 0;

    // Position is already fully analyzed — show cache, skip engine.
    if (cached?.reachedTarget && !isExtension) {
      setLines(cached.lines);
      setIsAnalyzing(false);
      setIsDone(true);
      lastDepthRef.current = cached.maxDepth;
      sharedWorker?.postMessage('stop');
      return;
    }

    // Load cached lines immediately so the UI shows prior progress while engine catches up.
    if (cached) {
      setLines(cached.lines);
      if (!isExtension) {
        lastDepthRef.current = cached.maxDepth;
      }
    } else if (!isExtension) {
      lastDepthRef.current = 0;
      setLines(prev =>
        Array.from({ length: numLines }, (_, i) =>
          i === 0 ? emptyLine(prev[0]?.evalCp) : emptyLine()
        )
      );
    }

    setIsAnalyzing(false);
    setIsDone(false);
    sharedWorker?.postMessage('stop');

    let cancelled = false;
    let onMessage: ((e: MessageEvent) => void) | null = null;

    // Depths already covered — filter during hash-table re-traversal so the
    // depth counter never appears to go backwards.
    const extensionBaseDepth = isExtension
      ? lastDepthRef.current
      : (cached?.maxDepth ?? 0);

    const timer = setTimeout(async () => {
      await ensureWorker();
      if (cancelled) return;
      setIsAnalyzing(true);

      onMessage = (e: MessageEvent) => {
        if (cancelled) return;
        const line = typeof e.data === 'string' ? e.data : String(e.data);

        if (line.startsWith('info ')) {
          const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
          const mvIdx = multipvMatch ? Number(multipvMatch[1]) - 1 : 0;
          if (mvIdx >= numLines) return;

          const depthMatch = line.match(/\bdepth\s+(\d+)/);
          const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
          const pvMatch = line.match(/\bpv\s+(.+)$/);

          const lineDepth = depthMatch ? Number(depthMatch[1]) : 0;

          // Skip depths already covered — prevents the counter from counting backward
          // as Stockfish re-traverses cached hash entries.
          if (lineDepth <= extensionBaseDepth) return;

          const pvMoves = pvMatch ? pvMatch[1].trim().split(/\s+/).slice(0, 8) : [];

          let newEvalCp: number | null = null;
          if (scoreMatch && lineDepth >= MIN_DISPLAY_DEPTH) {
            const type = scoreMatch[1];
            const value = Number(scoreMatch[2]);
            const rawCp = type === 'mate' ? (value > 0 ? 9999 : -9999) : value;
            const sideToMove = fen.split(' ')[1];
            newEvalCp = sideToMove === 'b' ? -rawCp : rawCp;
          }

          setLines(prev => {
            const next = [...prev];
            while (next.length <= mvIdx) next.push(emptyLine());
            const cur = next[mvIdx];
            // Math.max prevents depth from decreasing under concurrent rendering.
            const newDepth = lineDepth > 0 ? Math.max(lineDepth, cur.depth ?? 0) : cur.depth;
            next[mvIdx] = {
              bestMoveUci: pvMoves[0] ?? cur.bestMoveUci,
              evalCp: newEvalCp !== null ? newEvalCp : cur.evalCp,
              pvUci: pvMoves.length > 0 ? pvMoves : cur.pvUci,
              depth: newDepth,
            };
            if (mvIdx === 0 && lineDepth > lastDepthRef.current) {
              lastDepthRef.current = lineDepth;
              // Incrementally update cache so navigating away mid-analysis preserves progress.
              analysisCache.set(key, {
                lines: next,
                maxDepth: lineDepth,
                reachedTarget: lineDepth >= TARGET_DEPTH,
              });
            }
            return next;
          });
        } else if (line.startsWith('bestmove ')) {
          // For go infinite (extension), bestmove is not meaningful here — the listener
          // stays alive for info updates and cleanup handles the stop when the user
          // navigates away. isDone comes from cache on the next revisit.
          // This also prevents a stale bestmove (none) from an idle-stop (fired before
          // our go command) from incorrectly marking the extension as done.
          if (isExtension) return;
          const match = line.match(/^bestmove\s+(\S+)/);
          const move = match?.[1] && match[1] !== '(none)' ? match[1] : null;

          setLines(prev => {
            const next = [...prev];
            if (move && next.length > 0 && !next[0].bestMoveUci) {
              next[0] = { ...next[0], bestMoveUci: move };
            }
            // Final cache commit.
            analysisCache.set(key, {
              lines: next,
              maxDepth: lastDepthRef.current,
              reachedTarget: lastDepthRef.current >= TARGET_DEPTH,
            });
            return next;
          });

          setIsAnalyzing(false);
          setIsDone(true);
          if (onMessage) sharedWorker!.removeEventListener('message', onMessage);
          onMessage = null;
        }
      };

      sharedWorker!.addEventListener('message', onMessage);
      sharedWorker!.postMessage(`setoption name MultiPV value ${numLines}`);
      sharedWorker!.postMessage(`position fen ${fen}`);

      // Extensions run indefinitely — engine keeps going until the user navigates
      // away (cleanup sends stop), preserving whatever depth was reached in cache.
      // Auto-analysis: user-selected time OR TARGET_DEPTH, whichever first.
      const cmd = isExtension
        ? `go infinite`
        : `go movetime ${movetimeRef.current} depth ${TARGET_DEPTH}`;

      sharedWorker!.postMessage(cmd);
    }, isExtension ? 0 : 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (onMessage) sharedWorker?.removeEventListener('message', onMessage);
      sharedWorker?.postMessage('stop');
      setIsAnalyzing(false);
    };
  }, [fen, extendKey, numLines, enabled, key]);

  const line0 = lines[0];
  return {
    lines,
    bestMoveUci: line0?.bestMoveUci ?? null,
    evalCp: line0?.evalCp ?? null,
    depth: line0?.depth ?? null,
    isAnalyzing,
    isDone,
  };
}
