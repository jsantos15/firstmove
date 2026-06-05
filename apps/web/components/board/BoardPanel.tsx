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
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onBoardSizeChange);
  callbackRef.current = onBoardSizeChange;

  useEffect(() => {
    const el = boardAreaRef.current;
    if (!el) return;
    const update = () => {
      // Use the smaller of available width and height so the board stays square
      // and shrinks correctly when horizontal space is constrained (e.g. DevTools open).
      const size = Math.min(el.clientWidth, el.clientHeight);
      if (size > 0) callbackRef.current(size);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);

  return (
    // No shrink-0 — the panel must be able to yield horizontal space so the board
    // shrinks instead of being clipped when the viewport narrows.
    <div className="h-full overflow-hidden rounded-xl border border-white/5 bg-(--bg-panel) flex flex-col select-none">
      {/* Top row — always h-15 to align with sidebar */}
      <div className="shrink-0 h-15" style={{ width: boardSize }}>
        {topBar}
      </div>

      {/* Middle row: board area + eval bar as flex siblings so the board area's
          clientWidth reflects only the space available to the board, not the eval bar. */}
      <div className="min-h-0 flex-1 flex items-center">
        <div
          ref={boardAreaRef}
          className="relative flex-1 min-w-0 self-stretch flex items-center"
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

      {/* Bottom row */}
      {bottomBar != null && (
        <div className="shrink-0" style={{ width: boardSize }}>
          {bottomBar}
        </div>
      )}
    </div>
  );
}
