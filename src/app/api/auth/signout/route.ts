import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteSession, SESSION_COOKIE } from '@/lib/auth/session';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE.name)?.value;

    if (sessionId) {
      // 1. Invalidate session in database (AGENTS.md §3 rule 9 / FR9)
      await deleteSession(sessionId);
    }

    // 2. Clear session cookie
    const response = NextResponse.json(
      { success: true, message: 'Signed out successfully' },
      { status: 200 },
    );

    response.cookies.set({
      name: SESSION_COOKIE.name,
      value: '',
      httpOnly: SESSION_COOKIE.httpOnly,
      secure: SESSION_COOKIE.secure,
      sameSite: SESSION_COOKIE.sameSite,
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'An unexpected error occurred during sign out.' },
      { status: 500 },
    );
  }
}
