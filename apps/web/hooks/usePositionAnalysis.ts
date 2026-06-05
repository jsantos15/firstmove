'use client';

import { useState, useEffect } from 'react';

// Stockfish WASM served as a static asset from public/stockfish/.
// Running the engine as a browser Web Worker moves all memory pressure
// to the browser tab — the Node.js dev/prod server is never involved.
const WORKER_SCRIPT = '/stockfish/stockfish-17.1-lite-single-03e3232.js';

interface PositionAnalysis {
  bestMoveUci: string | null;
  depth: number | null;
  isAnalyzing: boolean;
  isDone: boolean;
}

// Singleton worker — one instance for the page lifetime.
// Reusing it across FEN changes avoids repeated init overhead (~150ms).
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

/**
 * @param fen       Position to analyze.
 * @param extendKey Increment to trigger a 20-second extension on the same FEN.
 *                  Reset to 0 when FEN changes to restart with the default 8 seconds.
 */
export function usePositionAnalysis(fen: string, extendKey = 0): PositionAnalysis {
  const [bestMoveUci, setBestMoveUci] = useState<string | null>(null);
  const [depth, setDepth] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const isExtension = extendKey > 0;
    const movetime = isExtension ? 20000 : 8000;

    if (!isExtension) {
      setBestMoveUci(null);
      setDepth(null);
    }
    setIsAnalyzing(false);
    setIsDone(false);

    // Cancel any in-progress search before starting a new one.
    sharedWorker?.postMessage('stop');

    let cancelled = false;
    let onMessage: ((e: MessageEvent) => void) | null = null;

    const timer = setTimeout(async () => {
      await ensureWorker();
      if (cancelled) return;

      setIsAnalyzing(true);

      onMessage = (e: MessageEvent) => {
        if (cancelled) return;
        const line = typeof e.data === 'string' ? e.data : String(e.data);

        if (line.startsWith('info ')) {
          const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
          if (multipvMatch && Number(multipvMatch[1]) !== 1) return;
          const depthMatch = line.match(/\bdepth\s+(\d+)/);
          const pvMatch = line.match(/\bpv\s+(\S+)/);
          if (depthMatch) setDepth(Number(depthMatch[1]));
          if (pvMatch) setBestMoveUci(pvMatch[1]);
        } else if (line.startsWith('bestmove ')) {
          const match = line.match(/^bestmove\s+(\S+)/);
          const move = match?.[1] && match[1] !== '(none)' ? match[1] : null;
          if (move) setBestMoveUci(move);
          setIsAnalyzing(false);
          setIsDone(true);
          if (onMessage) sharedWorker!.removeEventListener('message', onMessage);
          onMessage = null;
        }
      };

      sharedWorker!.addEventListener('message', onMessage);
      sharedWorker!.postMessage(`position fen ${fen}`);
      sharedWorker!.postMessage(`go movetime ${movetime}`);
    }, isExtension ? 0 : 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (onMessage) sharedWorker?.removeEventListener('message', onMessage);
      sharedWorker?.postMessage('stop');
      setIsAnalyzing(false);
    };
  }, [fen, extendKey]);

  return { bestMoveUci, depth, isAnalyzing, isDone };
}
