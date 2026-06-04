'use client';

import { useState, useEffect } from 'react';

const DEBOUNCE_MS = 400;

interface PositionAnalysis {
  bestMoveUci: string | null;
  isAnalyzing: boolean;
}

export function usePositionAnalysis(fen: string): PositionAnalysis {
  const [bestMoveUci, setBestMoveUci] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    setBestMoveUci(null);
    setIsAnalyzing(false);

    let es: EventSource | null = null;

    // Debounce: don't spawn a Stockfish process for every rapid navigation event.
    // Only start analysis after the user settles on a position.
    const timer = setTimeout(() => {
      setIsAnalyzing(true);
      es = new EventSource(`/api/analysis/position?fen=${encodeURIComponent(fen)}`);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as { type: string; move?: string };
          if ((data.type === 'update' || data.type === 'bestmove') && data.move) {
            setBestMoveUci(data.move);
          }
          if (data.type === 'done') {
            setIsAnalyzing(false);
            es?.close();
          }
        } catch {}
      };

      es.onerror = () => {
        setIsAnalyzing(false);
        es?.close();
      };
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      es?.close();
      setIsAnalyzing(false);
    };
  }, [fen]);

  return { bestMoveUci, isAnalyzing };
}
