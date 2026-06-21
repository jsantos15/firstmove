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
  /** Optional cap on board size from the parent page (e.g. when viewport is narrow). */
  maxWidth?: number;
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
  maxWidth,
  ringClass = 'ring-1 ring-white/10',
  overlay,
  children,
}: BoardPanelProps) {
  const middleRowRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onBoardSizeChange);
  callbackRef.current = onBoardSizeChange;

  const maxWidthRef = useRef(maxWidth);
  maxWidthRef.current = maxWidth;

  useEffect(() => {
    const el = middleRowRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      const max = maxWidthRef.current;
      const size = max !== undefined ? Math.min(h, max) : h;
      if (size > 0) callbackRef.current(size);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);

  // Re-evaluate when the external maxWidth cap changes (e.g. viewport resized).
  useEffect(() => {
    if (!middleRowRef.current) return;
    const h = middleRowRef.current.clientHeight;
    const size = maxWidth !== undefined ? Math.min(h, maxWidth) : h;
    if (size > 0) callbackRef.current(size);
  }, [maxWidth]);

  return (
    <div className="shrink-0 h-full overflow-hidden rounded-xl border border-white/5 bg-(--bg-panel) flex flex-col select-none">
      {/* Top row — centered over the board+eval column */}
      <div className="shrink-0 h-15 flex justify-center">
        <div className="h-full" style={{ width: boardSize + 36 }}>
          {topBar}
        </div>
      </div>

      {/* Middle row: board square and eval bar. Board centered within the panel. */}
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

      {/* Bottom row — full panel width so content can align to the panel edge */}
      {bottomBar != null && (
        <div className="shrink-0 w-full">
          {bottomBar}
        </div>
      )}
    </div>
  );
}
