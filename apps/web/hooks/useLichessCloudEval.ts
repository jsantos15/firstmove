'use client';

import { useState, useEffect, useRef } from 'react';

const cache = new Map<string, number | null>();
const DEBOUNCE_MS = 300;
const MATE_CP = 9999;

export function useLichessCloudEval(fen: string | undefined): number | undefined {
  const [evalCp, setEvalCp] = useState<number | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    const setEvalLater = (nextEvalCp: number | undefined) => {
      queueMicrotask(() => {
        if (!cancelled) setEvalCp(nextEvalCp);
      });
    };

    if (!fen) {
      setEvalLater(undefined);
      return () => {
        cancelled = true;
      };
    }

    if (cache.has(fen)) {
      const cached = cache.get(fen);
      setEvalLater(typeof cached === 'number' ? cached : undefined);
      return () => {
        cancelled = true;
      };
    }

    setEvalLater(undefined);

    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=1`;
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          cache.set(fen, null);
          return;
        }

        const data = await res.json() as { pvs?: { cp?: number; mate?: number }[] };
        const pv = data.pvs?.[0];

        let cp: number | null = null;
        if (typeof pv?.cp === 'number') {
          cp = pv.cp;
        } else if (typeof pv?.mate === 'number') {
          cp = pv.mate > 0 ? MATE_CP : -MATE_CP;
        }

        cache.set(fen, cp);
        if (typeof cp === 'number' && !cancelled) setEvalCp(cp);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          cache.set(fen, null);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fen]);

  return evalCp;
}
