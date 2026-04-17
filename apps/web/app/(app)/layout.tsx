import { Sidebar } from '@/components/ui/Sidebar';
import { UserMenu } from '@/components/ui/UserMenu';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />

      {/* Right column */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">

        {/* Global top bar — h-16 matches sidebar logo height so dividers align */}
        <div className="h-16 shrink-0 border-b border-white/5 flex items-center justify-end px-6">
          <UserMenu />
        </div>

        {/* Page content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>

      </div>
    </div>
  );
}
