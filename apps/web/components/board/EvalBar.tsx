'use client';

const EVAL_BAR_CP_LIMIT = 600;

function formatEvalLabel(evalCp: number): string {
  if (Math.abs(evalCp) >= 9000) return '#';
  if (Math.abs(evalCp) < 10) return '0.0';
  const pawns = Math.abs(evalCp) / 100;
  return `${evalCp > 0 ? '+' : '-'}${pawns.toFixed(1)}`;
}

export function EvalBar({
  evalCp,
  displayPerspective = 'white',
  reserveSpace = false,
  size,
}: {
  evalCp?: number;
  displayPerspective?: 'white' | 'black';
  reserveSpace?: boolean;
  size: number;
}) {
  const bottomColor = displayPerspective;
  const bottomClassName = bottomColor === 'white' ? 'bg-zinc-100' : 'bg-[#181818]';
  const topClassName = bottomColor === 'white' ? 'bg-[#181818]' : 'bg-zinc-100';
  const barStyle = { height: size };

  if (typeof evalCp !== 'number' || !Number.isFinite(evalCp)) {
    return reserveSpace ? (
      <div
        className={`relative ml-2 hidden w-7 shrink-0 overflow-hidden rounded-md border border-white/15 ${topClassName} shadow-inner shadow-black/40 sm:block`}
        style={barStyle}
        title="Engine evaluation loading"
        aria-label="Engine evaluation loading"
      >
        <div className={`absolute inset-x-0 bottom-0 h-1/2 opacity-70 ${bottomClassName}`} />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-amber-400/45" />
      </div>
    ) : null;
  }

  const clamped = Math.max(-EVAL_BAR_CP_LIMIT, Math.min(EVAL_BAR_CP_LIMIT, evalCp));
  const whiteHeight = 50 + (clamped / EVAL_BAR_CP_LIMIT) * 45;
  const bottomHeight = bottomColor === 'white' ? whiteHeight : 100 - whiteHeight;
  const bottomColorEvalCp = bottomColor === 'white' ? evalCp : -evalCp;
  const label = formatEvalLabel(bottomColorEvalCp);
  const labelOnBottom = bottomColorEvalCp >= 0;
  const perspectiveLabel = bottomColor === 'white' ? 'White' : 'Black';

  return (
    <div
      className={`relative ml-2 hidden w-7 shrink-0 overflow-hidden rounded-md border border-white/15 ${topClassName} shadow-inner shadow-black/40 sm:block`}
      style={barStyle}
      title={`Engine evaluation for ${perspectiveLabel}: ${label}`}
      aria-label={`Engine evaluation for ${perspectiveLabel} ${label}`}
    >
      <div
        className={`absolute inset-x-0 bottom-0 transition-[height] duration-300 ${bottomClassName}`}
        style={{ height: `${bottomHeight}%` }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-amber-400/45" />
      <div
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 text-[10px] font-semibold tabular-nums ${
          labelOnBottom
            ? bottomColor === 'white' ? 'bottom-1 text-zinc-950' : 'bottom-1 text-zinc-100'
            : bottomColor === 'white' ? 'top-1 text-zinc-100' : 'top-1 text-zinc-950'
        }`}
      >
        {label}
      </div>
    </div>
  );
}
