'use client';

import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useBoardSettings, type BoardSettings } from '@/hooks/useBoardSettings';
import { createClient } from '@/lib/supabase/client';
import type { Json } from '@firstmove/supabase';

/**
 * Bridges useBoardSettings' localStorage-only store to the signed-in account, so board
 * theme/pieces/sounds/engine prefs follow the user across devices and browser profiles
 * instead of resetting to defaults anywhere localStorage is empty (e.g. a fresh incognito
 * window). No UI — mounted once near the root, alongside AuthProvider.
 *
 * Account settings are authoritative once signed in: pulled down once per sign-in
 * (overlaying whatever this device's localStorage already had, same expectation as any
 * other per-account preference), then every local change is pushed back up, debounced.
 *
 * Deliberately does NOT use useAuth() — that context reports `user: null` on a handful of
 * routes (PUBLIC_AUTH_SKIP_PATHS in providers.tsx, e.g. /openings — the post-login
 * redirect target) purely to skip subscribing to the auth listener there, regardless of
 * whether someone is actually signed in. Fine for page-scoped gating, but this component
 * is mounted globally and needs the real session on every route (hit this directly: right
 * after sign-in, the app redirects through /openings, which made useAuth() falsely report
 * signed-out mid-flow and silently drop the sync). Keeping its own subscription trades a
 * second auth listener for correctness.
 */
export function BoardSettingsSync() {
  const [user, setUser] = useState<User | null>(null);
  const { settings, setSettings, hydrated } = useBoardSettings();
  const pulledForUserRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      pulledForUserRef.current = null;
      return;
    }
    if (!hydrated || pulledForUserRef.current === user.id) return;
    pulledForUserRef.current = user.id;

    let cancelled = false;
    createClient()
      .from('user_profiles')
      .select('board_settings')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const saved = data?.board_settings as Partial<BoardSettings> | null | undefined;
        if (saved && Object.keys(saved).length > 0) setSettings(saved);
      });
    return () => {
      cancelled = true;
    };
  }, [user, hydrated, setSettings]);

  useEffect(() => {
    if (!user || !hydrated) return;
    // Debounced so rapid changes (e.g. dragging the engine move-time slider) collapse
    // into one write instead of one per tick. Includes the redundant write right after
    // the pull above re-applies the same data — harmless, not worth extra bookkeeping.
    const timeout = setTimeout(() => {
      createClient()
        .from('user_profiles')
        // BoardSettings is a flat, JSON-serializable shape (strings/booleans/numbers
        // only) — safe to hand to a jsonb column; it just isn't structurally an index
        // signature, which is all TS objects here.
        .upsert({ user_id: user.id, board_settings: settings as unknown as Json }, { onConflict: 'user_id' })
        .then(({ error }) => {
          if (error) console.error('Failed to sync board settings:', error);
        });
    }, 500);
    return () => clearTimeout(timeout);
  }, [user, hydrated, settings]);

  return null;
}
