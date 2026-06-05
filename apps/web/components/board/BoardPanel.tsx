'use client';

import { useEffect, useRef } from 'react';
import { EvalBar } from './EvalBar';

interface BoardPanelProps {
  topBar?: React.ReactNode;
  bottomBar?: React.ReactNode;
  evalCp?: number;
  displayPerspective?: 'white' | 'black';
  reserveEvalSpace?: boolean;
  boardSize: number;
  onBoardSizeChange: (size: number) => void;
  ringClass?: string;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}

export function BoardPanel({
  topBar,
  bottomBar,
  evalCp,
  displayPerspective = 'white',
  reserveEvalSpace = false,
  boardSize,
  onBoardSizeChange,
  ringClass = 'ring-1 ring-white/10',
  overlay,
  children,
}: BoardPanelProps) {
  const middleRowRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onBoardSizeChange);
  callbackRef.current = onBoardSizeChange;

  useEffect(() => {
    const el = middleRowRef.current;
    if (!el) return;
    const update = () => {
      // Subtract eval bar (w-7=28px + ml-2=8px) from available width.
      // Use height directly — the middle row stretches to fill remaining panel height.
      const size = Math.min(el.clientWidth - 36, el.clientHeight);
      if (size > 0) callbackRef.current(size);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);

  return (
    // flex-1 min-w-0: fills all remaining horizontal space at full width, AND shrinks
    // below natural content size when the viewport is narrow (e.g. DevTools open).
    <div className="flex-1 min-w-0 h-full overflow-hidden rounded-xl border border-white/5 bg-(--bg-panel) flex flex-col select-none">
      {/* Top row — centered over the board+eval column */}
      <div className="shrink-0 h-15 flex justify-center">
        <div className="h-full" style={{ width: boardSize + 36 }}>
          {topBar}
        </div>
      </div>

      {/* Middle row: board area + eval bar as flex siblings so boardAreaRef.clientWidth
          reflects only the board's available space, not the eval bar. Centered so the
          square board sits in the middle of a wider panel. */}
      <div ref={middleRowRef} className="min-h-0 flex-1 flex justify-center items-center">
        <div
          className="relative self-stretch flex items-center justify-center"
          style={{ width: boardSize }}
        >
          <div className={`overflow-hidden transition-all duration-150 ${ringClass}`}>
            {children}
          </div>
          {overlay}
        </div>
        <EvalBar
          evalCp={evalCp}
          displayPerspective={displayPerspective}
          reserveSpace={reserveEvalSpace}
          size={boardSize}
        />
      </div>

      {/* Bottom row — centered to match board+eval column */}
      {bottomBar != null && (
        <div className="shrink-0 flex justify-center">
          <div style={{ width: boardSize + 36 }}>
            {bottomBar}
          </div>
        </div>
      )}
    </div>
  );
}
