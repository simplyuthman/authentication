import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { VerifyEmailSchema } from '@/lib/validation/auth.schemas';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Validate input schema
    const validation = VerifyEmailSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { email, code } = validation.data;

    let targetUserId: string | null = null;

    if (email) {
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
      if (!user) {
        return NextResponse.json(
          { error: 'Invalid verification code or email.' },
          { status: 400 },
        );
      }
      targetUserId = user.id;
    }

    // 2. Query the latest unconsumed verification code
    const verificationCode = await prisma.verificationCode.findFirst({
      where: {
        ...(targetUserId ? { userId: targetUserId } : {}),
        consumedAt: null,
      },
      orderBy: {
        lastSentAt: 'desc',
      },
      include: {
        user: true,
      },
    });

    if (!verificationCode) {
      return NextResponse.json(
        { error: 'No pending verification code found. Please request a new code.' },
        { status: 400 },
      );
    }

    // 3. Check DB expiry timestamp (FR4, Tech Req 5 — independent of client display)
    if (verificationCode.expiresAt < new Date()) {
      return NextResponse.json(
        {
          error: 'Verification code has expired. Please request a new code.',
          expired: true,
        },
        { status: 400 },
      );
    }

    // 4. Compare code hash
    const isValidCode = await verifyPassword(code, verificationCode.codeHash);
    if (!isValidCode) {
      await prisma.verificationCode.update({
        where: { id: verificationCode.id },
        data: { attempts: { increment: 1 } },
      });

      return NextResponse.json(
        { error: 'Invalid verification code.' },
        { status: 400 },
      );
    }

    // 5. Atomic verification update in database
    await prisma.$transaction([
      prisma.verificationCode.update({
        where: { id: verificationCode.id },
        data: { consumedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: verificationCode.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    // 6. Create session and set session cookie (FR3)
    const sessionId = await createSession(verificationCode.userId);

    const response = NextResponse.json(
      {
        success: true,
        message: 'Email verified successfully.',
        user: {
          id: verificationCode.user.id,
          email: verificationCode.user.email,
          fullName: verificationCode.user.fullName,
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
      { error: 'An unexpected error occurred during email verification.' },
      { status: 500 },
    );
  }
}
