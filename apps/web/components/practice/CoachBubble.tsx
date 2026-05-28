'use client';

import Image from 'next/image';
import type { CoachFeedback } from '@/lib/coachFeedback';

interface CoachBubbleProps {
  feedback: CoachFeedback | null;
  fallbackText: string;
  dark?: boolean;
}

const TONE_STYLES = {
  neutral: {
    badge: 'border-zinc-200 bg-zinc-100 text-zinc-700',
    title: 'text-zinc-900',
  },
  positive: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    title: 'text-emerald-900',
  },
  payoff: {
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    title: 'text-violet-900',
  },
  warning: {
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    title: 'text-amber-950',
  },
  negative: {
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    title: 'text-rose-900',
  },
  complete: {
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    title: 'text-sky-900',
  },
} as const;

const TONE_STYLES_DARK = {
  neutral: { badge: 'border-white/15 bg-white/5 text-gray-300', title: 'text-gray-200' },
  positive: { badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', title: 'text-emerald-200' },
  payoff: { badge: 'border-violet-500/30 bg-violet-500/10 text-violet-300', title: 'text-violet-200' },
  warning: { badge: 'border-amber-500/30 bg-amber-500/10 text-amber-300', title: 'text-amber-200' },
  negative: { badge: 'border-rose-500/30 bg-rose-500/10 text-rose-300', title: 'text-rose-200' },
  complete: { badge: 'border-sky-500/30 bg-sky-500/10 text-sky-300', title: 'text-sky-200' },
} as const;

export function CoachBubble({ feedback, fallbackText, dark = false }: CoachBubbleProps) {
  const tone = feedback?.tone ?? 'neutral';
  const styles = dark ? TONE_STYLES_DARK[tone] : TONE_STYLES[tone];

  if (dark) {
    return (
      <div className="h-23 shrink-0 flex items-start gap-1 px-4 py-3">
        <div className="flex w-20 shrink-0 items-start">
          <div className="relative h-20 w-20">
            <Image
              src="/coaches/jazmin.png"
              alt="Jazmin, your opening coach"
              fill
              sizes="80px"
              className="object-contain object-bottom drop-shadow-lg"
              priority
              unoptimized
            />
          </div>
        </div>
        <div
          className="relative min-h-0 min-w-0 flex-1 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5"
          aria-live="polite"
        >
          {feedback ? (
            <div className="flex min-w-0 flex-col gap-1 overflow-hidden">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 ${styles.badge}`}
                >
                  {feedback.label}
                </span>
                <span className={`min-w-0 truncate text-xs font-semibold ${styles.title}`}>
                  {feedback.title}
                </span>
              </div>
              <p className="min-w-0 overflow-hidden text-[12px] leading-4 text-gray-400">
                {feedback.message}
              </p>
            </div>
          ) : (
            <p className="overflow-hidden text-xs leading-5 text-gray-500">
              {fallbackText}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-23 shrink-0">
      <div className="flex h-full items-start gap-1">
        <div className="flex w-22 shrink-0 items-start">
          <div className="relative h-23 w-24">
            <Image
              src="/coaches/jazmin.png"
              alt="Jazmin, your opening coach"
              fill
              sizes="96px"
              className="object-contain object-bottom drop-shadow-lg"
              priority
              unoptimized
            />
          </div>
        </div>

        <div
          className="relative h-23 min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 shadow-lg shadow-black/20"
          aria-live="polite"
        >
          <div className="absolute -left-1.75 top-8 h-4 w-4 rotate-45 border-b border-l border-zinc-200 bg-white" />
          {feedback ? (
            <div className="flex h-full min-w-0 flex-col gap-1 overflow-hidden">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 ${styles.badge}`}
                >
                  {feedback.label}
                </span>
                <span className={`min-w-0 truncate text-xs font-semibold ${styles.title}`}>
                  {feedback.title}
                </span>
              </div>
              <p className="min-w-0 overflow-hidden text-[13px] leading-5 text-zinc-700">
                {feedback.message}
              </p>
            </div>
          ) : (
            <p className="max-h-full overflow-hidden text-sm leading-5 text-zinc-700">
              {fallbackText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
