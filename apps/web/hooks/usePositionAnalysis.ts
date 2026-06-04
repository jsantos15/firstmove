'use client';

import { useState, useEffect } from 'react';

interface PositionAnalysis {
  bestMoveUci: string | null;
  depth: number | null;
  isAnalyzing: boolean;
  isDone: boolean;
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
      // Fresh position — reset everything.
      setBestMoveUci(null);
      setDepth(null);
    }
    setIsAnalyzing(false);
    setIsDone(false);

    let es: EventSource | null = null;

    const timer = setTimeout(() => {
      setIsAnalyzing(true);
      es = new EventSource(
        `/api/analysis/position?fen=${encodeURIComponent(fen)}&movetime=${movetime}`
      );

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type: string;
            move?: string;
            depth?: number;
          };
          if (data.type === 'update') {
            if (data.move) setBestMoveUci(data.move);
            if (data.depth != null) setDepth(data.depth);
          } else if (data.type === 'bestmove' && data.move) {
            setBestMoveUci(data.move);
          } else if (data.type === 'done') {
            setIsAnalyzing(false);
            setIsDone(true);
            es?.close();
          }
        } catch {}
      };

      es.onerror = () => {
        setIsAnalyzing(false);
        es?.close();
      };
    }, isExtension ? 0 : 150);

    return () => {
      clearTimeout(timer);
      es?.close();
      setIsAnalyzing(false);
    };
  }, [fen, extendKey]);

  return { bestMoveUci, depth, isAnalyzing, isDone };
}
