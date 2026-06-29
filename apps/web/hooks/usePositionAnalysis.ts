'use client';

import { useState, useEffect, useRef } from 'react';

const WORKER_SCRIPT = '/stockfish/stockfish-17.1-lite-single-03e3232.js';
const MIN_DISPLAY_DEPTH = 8;
const EXTEND_DEPTH_STEP = 5;

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

let sharedWorker: Worker | null = null;
let workerReadyPromise: Promise<void> | null = null;

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

export function usePositionAnalysis(fen: string, extendKey = 0, numLines = 1, movetime = 8000, enabled = true): PositionAnalysis {
  const [lines, setLines] = useState<EngineLine[]>(() => [emptyLine()]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDone, setIsDone] = useState(false);

  // Keep refs so closures capture them without going stale.
  const numLinesRef = useRef(numLines);
  numLinesRef.current = numLines;
  // movetime is read via ref so the slider change doesn't restart the current analysis.
  const movetimeRef = useRef(movetime);
  movetimeRef.current = movetime;
  // Tracks the highest depth line[0] has reached; used by extensions to target deeper.
  const lastDepthRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      sharedWorker?.postMessage('stop');
      setLines(Array.from({ length: numLines }, () => emptyLine()));
      setIsAnalyzing(false);
      setIsDone(false);
      return;
    }
    const isExtension = extendKey > 0;
    const mt = movetimeRef.current;

    if (!isExtension) {
      lastDepthRef.current = 0;
      // Keep line 0's evalCp so the bar doesn't jump while the new search ramps up.
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

    const timer = setTimeout(async () => {
      await ensureWorker();
      if (cancelled) return;

      setIsAnalyzing(true);

      // For extensions, ignore info lines at or below this depth so the UI never
      // appears to count back down to 1 while Stockfish re-traverses cached nodes.
      const extensionBaseDepth = isExtension ? lastDepthRef.current : 0;

      onMessage = (e: MessageEvent) => {
        if (cancelled) return;
        const line = typeof e.data === 'string' ? e.data : String(e.data);

        if (line.startsWith('info ')) {
          const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
          // 0-based index; default to 0 when there is no multipv token
          const mvIdx = multipvMatch ? Number(multipvMatch[1]) - 1 : 0;
          if (mvIdx >= numLinesRef.current) return;

          const depthMatch = line.match(/\bdepth\s+(\d+)/);
          const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
          const pvMatch = line.match(/\bpv\s+(.+)$/);

          const lineDepth = depthMatch ? Number(depthMatch[1]) : 0;

          // During an extension skip depths the engine has already covered —
          // Stockfish re-traverses them using cached hash entries (fast, not useful to show).
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
            next[mvIdx] = {
              bestMoveUci: pvMoves[0] ?? cur.bestMoveUci,
              evalCp: newEvalCp !== null ? newEvalCp : cur.evalCp,
              pvUci: pvMoves.length > 0 ? pvMoves : cur.pvUci,
              depth: lineDepth > 0 ? lineDepth : cur.depth,
            };
            if (mvIdx === 0 && lineDepth > lastDepthRef.current) {
              lastDepthRef.current = lineDepth;
            }
            return next;
          });
        } else if (line.startsWith('bestmove ')) {
          const match = line.match(/^bestmove\s+(\S+)/);
          const move = match?.[1] && match[1] !== '(none)' ? match[1] : null;
          if (move) {
            setLines(prev => {
              const next = [...prev];
              if (next.length > 0 && !next[0].bestMoveUci) {
                next[0] = { ...next[0], bestMoveUci: move };
              }
              return next;
            });
          }
          setIsAnalyzing(false);
          setIsDone(true);
          if (onMessage) sharedWorker!.removeEventListener('message', onMessage);
          onMessage = null;
        }
      };

      sharedWorker!.addEventListener('message', onMessage);
      sharedWorker!.postMessage(`setoption name MultiPV value ${numLines}`);
      sharedWorker!.postMessage(`position fen ${fen}`);
      if (isExtension) {
        // Combine depth + movetime: stops at whichever limit is hit first.
        const targetDepth = lastDepthRef.current + EXTEND_DEPTH_STEP;
        sharedWorker!.postMessage(`go depth ${targetDepth} movetime ${mt}`);
      } else {
        sharedWorker!.postMessage(`go movetime ${mt}`);
      }
    }, isExtension ? 0 : 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (onMessage) sharedWorker?.removeEventListener('message', onMessage);
      sharedWorker?.postMessage('stop');
      setIsAnalyzing(false);
    };
  }, [fen, extendKey, numLines, enabled]);

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
