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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onBoardSizeChange);
  callbackRef.current = onBoardSizeChange;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const size = el.clientHeight;
      if (size > 0) callbackRef.current(size);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);

  return (
    <div className="shrink-0 h-full overflow-hidden rounded-xl border border-white/5 bg-(--bg-panel) flex flex-col select-none">
      {/* Top row — always h-15 to align with sidebar */}
      <div className="shrink-0 h-15" style={{ width: boardSize }}>
        {topBar}
      </div>

      {/* Board area — ResizeObserver target; eval bar is an in-flow flex sibling */}
      <div ref={wrapperRef} className="relative min-h-0 flex-1 flex items-center">
        <div className={`overflow-hidden rounded-xl transition-all duration-150 ${ringClass}`}>
          {children}
        </div>
        {overlay}
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
