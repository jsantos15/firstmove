import { createClient } from './client';

/**
 * Web-specific auth helpers — all use the SSR browser client so tokens
 * are stored in cookies and readable by proxy / server components.
 */

export async function signInWithEmail(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Route the confirmation link through our callback so the session
      // is exchanged and cookies are set before landing on the app.
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function updateDisplayName(fullName: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.updateUser({
    data: { full_name: fullName.trim() },
  });
  if (error) throw error;
  return data;
}

export async function updatePassword(newPassword: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}
