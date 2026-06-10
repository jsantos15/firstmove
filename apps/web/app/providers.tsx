'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// ─── Auth Context ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

const PUBLIC_AUTH_SKIP_PATHS = ['/', '/openings', '/auth/callback'];

function pathMatches(pathname: string, path: string) {
  return pathname === path;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const skipAuth = PUBLIC_AUTH_SKIP_PATHS.some(path => pathMatches(pathname, path));
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (skipAuth) return;

    const supabase = createClient();

    // Load existing session on mount
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
      })
      .catch(error => {
        console.warn(
          `Supabase session load failed: ${error instanceof Error ? error.message : String(error)}`
        );
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });

    // Keep state in sync when auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [skipAuth]);

  const value = skipAuth
    ? { user: null, session: null, loading: false }
    : { user, session, loading };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Query Client ─────────────────────────────────────────────────────────────

function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// ─── Combined Providers ───────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}
