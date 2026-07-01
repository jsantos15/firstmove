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


export function CoachBubble({ feedback, fallbackText, dark = false }: CoachBubbleProps) {
  const tone = feedback?.tone ?? 'neutral';
  const styles = TONE_STYLES[tone];

  if (dark) {
    return (
      <div className="flex items-end gap-0 pl-3 pr-3 py-2">
        {/* Coach image — fixed height so Next.js fill works */}
        <div className="relative shrink-0 w-16" style={{ height: '68px' }}>
          <Image
            src="/coaches/jazmin.png"
            alt="Jazmin, your opening coach"
            fill
            sizes="64px"
            className="object-contain object-bottom drop-shadow-lg"
            priority
            unoptimized
          />
        </div>
        {/* White speech bubble — height wraps content */}
        <div
          className="relative min-w-0 flex-1 rounded-xl bg-white px-3 py-2 shadow-sm ml-2"
          aria-live="polite"
        >
          {/* Speech bubble pointer toward coach */}
          <svg
            className="absolute -left-3.5 top-1/2 -translate-y-1/2"
            width="14"
            height="22"
            viewBox="0 0 14 22"
            fill="white"
          >
            <path d="M 14 4 Q 7 12 0 11 Q 7 18 14 18 Z" />
          </svg>
          {feedback ? (
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 ${TONE_STYLES[tone].badge}`}>
                  {feedback.label}
                </span>
                <span className={`min-w-0 truncate text-xs font-semibold ${TONE_STYLES[tone].title}`}>
                  {feedback.title}
                </span>
              </div>
              <p className="min-w-0 text-[12px] leading-4 text-zinc-600 line-clamp-2">
                {feedback.message}
              </p>
            </div>
          ) : (
            <p className="text-xs leading-4 text-zinc-600 line-clamp-2">
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
