import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// ─── Environment Variables ────────────────────────────────────────────────────
// These are read from the environment at runtime.
// Web: set in apps/web/.env.local
// Mobile: call configureSupabase from application code with EXPO_PUBLIC_* values.

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

let runtimeConfig: SupabaseConfig | null = null;
let client: SupabaseClient<Database> | null = null;

export function configureSupabase(config: SupabaseConfig) {
  runtimeConfig = config;
  client = null;
}

// ─── Supabase Client ──────────────────────────────────────────────────────────
// Single shared client instance. Import this in both web and mobile apps. The
// proxy keeps existing query/auth imports lazy so mobile can configure first.

const isWebBrowser =
  'window' in globalThis && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

function getConfig(): SupabaseConfig {
  const url = runtimeConfig?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = runtimeConfig?.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase environment variables. Check your .env.local or configureSupabase call.'
    );
  }

  return { url, anonKey };
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!client) {
    const { url, anonKey } = getConfig();

    client = createClient<Database>(url, anonKey, {
      auth: {
        persistSession: !isWebBrowser,
        autoRefreshToken: !isWebBrowser,
        detectSessionInUrl: !isWebBrowser,
      },
    });
  }

  return client;
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseClient(), prop, receiver);
  },
});
