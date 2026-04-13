'use client';

import Link from 'next/link';
import { useAuth } from '@/app/providers';
import { useSignOut } from '@/hooks/useAuth';

export function UserMenu() {
  const { user } = useAuth();
  const signOut = useSignOut();

  if (!user) {
    return (
      <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
        Sign in
      </Link>
    );
  }

  const initial = (user.user_metadata?.full_name as string)?.[0]
    ?? user.email?.[0]?.toUpperCase()
    ?? '?';

  return (
    <div className="flex items-center gap-3">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-xs font-semibold text-amber-400 select-none">
        {initial}
      </div>

      <button
        onClick={() => signOut.mutate()}
        disabled={signOut.isPending}
        className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
      >
        {signOut.isPending ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
