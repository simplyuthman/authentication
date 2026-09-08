import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

export function middleware(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE.name)?.value;

  // Protect /dashboard route: if no session cookie, redirect server-side to /auth
  if (!sessionId && request.nextUrl.pathname.startsWith('/dashboard')) {
    const authUrl = new URL('/auth', request.url);
    return NextResponse.redirect(authUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
