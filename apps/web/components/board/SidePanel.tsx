'use client';

interface SidePanelProps {
  topBar?: React.ReactNode;
  coach: React.ReactNode;
  children: React.ReactNode;
}

export function SidePanel({ topBar, coach, children }: SidePanelProps) {
  return (
    <div className="w-104 lg:w-114 shrink-0 h-full rounded-xl border border-white/5 bg-(--bg-panel) overflow-hidden flex flex-col">
      {/* Top row — flex so button children can be flex-1 */}
      <div className="h-15 shrink-0 border-b border-white/5 flex">
        {topBar}
      </div>

      {/* Coach — height = 1 board square (board area = 100% - 120px topBar+bottomBar, / 8 squares) */}
      <div className="shrink-0 overflow-hidden" style={{ height: 'calc((100% - 120px) / 8)' }}>
        {coach}
      </div>

      {/* Middle content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {children}
      </div>
    </div>
  );
}
