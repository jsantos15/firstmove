import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@firstmove/supabase';

/**
 * Browser Supabase client — stores auth tokens in cookies so server
 * components and middleware can read the session.
 * Use this in Client Components and hooks.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
