'use client';

import { useEffect, useState } from 'react';

interface CompletionOverlayProps {
  variationName: string;
  moveCount: number;
  onPracticeAgain: () => void;
}

const MESSAGES = [
  'Repetition is how openings become instinct.',
  'Solid. Keep drilling to lock it in.',
  'Clean execution. Run it again to make it automatic.',
  'Nice work. One more rep and it gets easier.',
];

export function CompletionOverlay({
  variationName,
  moveCount,
  onPracticeAgain,
}: CompletionOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [message] = useState(() => MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg-base)]/82 backdrop-blur-sm transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className={`w-80 rounded-2xl border border-white/10 bg-[var(--bg-panel)] p-8 text-center shadow-2xl transition-all duration-300 ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-green-400/30 bg-green-400/10">
          <svg
            className="h-8 w-8 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-white">Line Complete</h2>
        <p className="mt-1 text-sm font-medium text-amber-400">{variationName}</p>
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          {moveCount} moves. {message}
        </p>

        <button
          onClick={onPracticeAgain}
          className="mt-6 w-full rounded-lg border border-green-500/30 bg-green-500/20 px-5 py-2.5 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/30"
        >
          Practice again
        </button>
      </div>
    </div>
  );
}
