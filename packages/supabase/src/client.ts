import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// ─── Environment Variables ────────────────────────────────────────────────────
// These are read from the environment at runtime.
// Web: set in apps/web/.env.local
// Mobile: set via Expo's environment variable system (app.config.ts extra field)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check your .env.local or app.config.ts.'
  );
}

// ─── Supabase Client ──────────────────────────────────────────────────────────
// Single shared client instance. Import this in both web and mobile apps.

const isWebBrowser =
  'window' in globalThis && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: !isWebBrowser,
    autoRefreshToken: !isWebBrowser,
    detectSessionInUrl: !isWebBrowser,
  },
});
