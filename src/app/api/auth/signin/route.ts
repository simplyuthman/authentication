import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SigninSchema } from '@/lib/validation/auth.schemas';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Validate input schema
    const validation = SigninSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { email, password } = validation.data;

    // 2. Rate Limiting (FR12, Tech Req 3)
    const rateLimit = await checkRateLimit({
      req,
      route: 'signin',
      email,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many sign in attempts. Please try again later.',
          retryAfter: rateLimit.resetInSeconds,
        },
        { status: 429 },
      );
    }

    // 3. User lookup
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // 4. Verification of credentials (FR7 — identical generic message for wrong password and no account)
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 },
      );
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 },
      );
    }

    // 5. Unverified accounts blocked (PRD FR6 / Phase 4)
    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        {
          error: 'Please verify your email address before signing in.',
          unverified: true,
          email: user.email,
        },
        { status: 403 },
      );
    }

    // 6. Create active session in database and issue session cookie
    const sessionId = await createSession(user.id);

    const response = NextResponse.json(
      {
        success: true,
        message: 'Signed in successfully.',
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
      },
      { status: 200 },
    );

    response.cookies.set({
      name: SESSION_COOKIE.name,
      value: sessionId,
      httpOnly: SESSION_COOKIE.httpOnly,
      secure: SESSION_COOKIE.secure,
      sameSite: SESSION_COOKIE.sameSite,
      maxAge: SESSION_COOKIE.maxAge,
      path: '/',
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'An unexpected error occurred during sign in.' },
      { status: 500 },
    );
  }
}
