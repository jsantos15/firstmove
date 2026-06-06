'use client';

interface SidePanelProps {
  topBar?: React.ReactNode;
  coach: React.ReactNode;
  bottomBar?: React.ReactNode;
  children: React.ReactNode;
}

export function SidePanel({ topBar, coach, bottomBar, children }: SidePanelProps) {
  return (
    <div className="w-104 lg:w-114 shrink-0 h-full rounded-xl border border-white/5 bg-(--bg-panel) overflow-hidden flex flex-col">
      {/* Top row — flex so button children can be flex-1 */}
      <div className="h-15 shrink-0 border-b border-white/5 flex">
        {topBar}
      </div>

      {/* Coach — height = 1 board square */}
      <div className="shrink-0 overflow-hidden" style={{ height: 'calc((100% - 164px) / 8)' }}>
        {coach}
      </div>

      {/* Middle content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {children}
      </div>

      {/* Bottom row */}
      {bottomBar && (
        <div className="shrink-0">
          {bottomBar}
        </div>
      )}
    </div>
  );
}
