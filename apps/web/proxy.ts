import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/', '/auth/callback', '/openings', '/analysis'];
const AUTH_ONLY_PATHS = ['/login', '/signup'];

function pathMatches(pathname: string, path: string) {
  return pathname === path;
}

function publicPathMatches(pathname: string, path: string) {
  if (path === '/openings') {
    return pathname === path || pathname.startsWith(`${path}/`);
  }
  return pathMatches(pathname, path);
}

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(path => publicPathMatches(pathname, path));
}

function isAuthPath(pathname: string) {
  return AUTH_ONLY_PATHS.some(path => pathMatches(pathname, path));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publicPath = isPublicPath(pathname);
  const authPath = isAuthPath(pathname);

  if (publicPath && !authPath) {
    return NextResponse.next({ request });
  }

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

  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    console.warn(
      `Supabase auth check failed in proxy: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!user && !publicPath && !authPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && authPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/openings';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
