'use client';

import type { CoachFeedback, CoachFeedbackTone } from '@/lib/coachFeedback';

const TONE_STYLES: Record<CoachFeedbackTone, string> = {
  neutral: 'border-sky-400/30 bg-sky-400/12 text-sky-200',
  positive: 'border-emerald-400/30 bg-emerald-400/12 text-emerald-200',
  payoff: 'border-amber-400/35 bg-amber-400/15 text-amber-200',
  warning: 'border-orange-400/35 bg-orange-400/15 text-orange-200',
  negative: 'border-red-400/35 bg-red-400/15 text-red-200',
  complete: 'border-green-400/35 bg-green-400/15 text-green-200',
};

export function CoachFeedbackCard({
  feedback,
  onDismiss,
}: {
  feedback: CoachFeedback;
  onDismiss: () => void;
}) {
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speak = () => {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(feedback.spokenText);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 w-72 max-w-[calc(100%-1.5rem)]">
      <div className="pointer-events-auto rounded-xl border border-white/10 bg-[var(--bg-panel)]/95 p-3 shadow-xl shadow-black/35 backdrop-blur">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${TONE_STYLES[feedback.tone]}`}>
              {feedback.label}
            </span>
            <h3 className="mt-2 text-sm font-semibold text-white">{feedback.title}</h3>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Dismiss coach feedback"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
            </svg>
          </button>
        </div>

        <p className="text-xs leading-relaxed text-gray-400">{feedback.message}</p>

        {canSpeak && (
          <button
            type="button"
            onClick={speak}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-white/20 hover:text-white"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
              <path d="M8.25 2.8a.75.75 0 0 1 .75.75v8.9a.75.75 0 0 1-1.207.594L4.935 10.85H3.25A1.75 1.75 0 0 1 1.5 9.1V6.9c0-.966.784-1.75 1.75-1.75h1.685l2.858-2.194A.75.75 0 0 1 8.25 2.8Z" />
              <path d="M11.03 5.47a.75.75 0 0 1 1.06 0 3.575 3.575 0 0 1 0 5.06.75.75 0 0 1-1.06-1.06 2.075 2.075 0 0 0 0-2.94.75.75 0 0 1 0-1.06Z" />
            </svg>
            Listen
          </button>
        )}
      </div>
    </div>
  );
}
