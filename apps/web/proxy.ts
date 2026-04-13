import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that don't require authentication
const PUBLIC_PATHS = ['/', '/login', '/signup', '/auth/callback', '/openings'];

// Auth pages that authenticated users should be bounced away from
const AUTH_ONLY_PATHS = ['/login', '/signup'];

export async function proxy(request: NextRequest) {
  // Start with a pass-through response that carries the request cookies
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write updated cookies to both the request and the response so the
          // session refresh is visible to both server and client.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: always call getUser() — never getSession() — in middleware.
  // getUser() validates the token with the Supabase server and refreshes it
  // if expired. getSession() only reads the local cookie and can be stale.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));

  // Unauthenticated user hitting a protected route → send to login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Authenticated user hitting a login/signup page → send to app
  if (user && AUTH_ONLY_PATHS.some(p => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/openings';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
