export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-white tracking-tight">
            First<span className="text-amber-400">Move</span>
          </span>
          <p className="text-sm text-gray-500 mt-1">Learn chess openings</p>
        </div>

        {/* Auth card */}
        <div className="rounded-2xl border border-white/5 bg-[#1a1d27] p-8 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  );
}
