import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { signInWithEmail, signInWithGoogle, signOut, signUpWithEmail } from '@/lib/supabase/auth';

/**
 * Sign-in mutation. On success redirects to /openings.
 */
export function useSignIn() {
  const router = useRouter();

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signInWithEmail(email, password),
    onSuccess: () => {
      router.push('/openings');
      router.refresh();
    },
  });
}

/**
 * Sign-up mutation. Returns the Supabase data so the caller can show a
 * "check your email" message.
 */
export function useSignUp() {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signUpWithEmail(email, password),
  });
}

/**
 * Google OAuth mutation. Redirects to Google — no manual navigation needed.
 */
export function useSignInWithGoogle() {
  return useMutation({
    mutationFn: signInWithGoogle,
  });
}

/**
 * Sign-out mutation. Clears the session and redirects to /login.
 */
export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.clear();
      router.push('/login');
      router.refresh();
    },
  });
}
