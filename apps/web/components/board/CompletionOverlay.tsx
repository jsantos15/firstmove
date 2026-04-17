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
  'Clean execution — practice makes permanent.',
  'Nice work. One step closer to mastery.',
  'The board remembers what you repeat.',
];

export function CompletionOverlay({ variationName, moveCount, onPracticeAgain }: CompletionOverlayProps) {
  const [message] = useState(() => MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg-base)]/80 backdrop-blur-sm transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className={`flex w-72 flex-col items-center gap-5 rounded-2xl border border-white/10 bg-[var(--bg-panel)] p-8 text-center shadow-2xl transition-all duration-300 ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        {/* Icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-green-400/30 bg-green-400/10">
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

        {/* Text */}
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-bold text-white">Line Complete!</h2>
          <p className="text-sm font-medium text-amber-400">{variationName}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {moveCount} moves · {message}
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={onPracticeAgain}
          className="w-full rounded-lg border border-green-500/30 bg-green-500/20 px-5 py-2.5 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/30"
        >
          ↺ Practice again
        </button>
      </div>
    </div>
  );
}
