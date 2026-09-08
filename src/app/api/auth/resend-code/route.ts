import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { ResendCodeSchema } from '@/lib/validation/auth.schemas';
import { hashPassword } from '@/lib/auth/password';
import { sendEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  RESEND_COOLDOWN_MS,
  VERIFICATION_CODE_EXPIRY_MS,
  VERIFICATION_CODE_LENGTH,
} from '@/lib/constants';

function generateVerificationCode(): string {
  const min = Math.pow(10, VERIFICATION_CODE_LENGTH - 1);
  const max = Math.pow(10, VERIFICATION_CODE_LENGTH) - 1;
  const num = crypto.randomInt(min, max + 1);
  return num.toString();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Schema Validation
    const validation = ResendCodeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { email } = validation.data;

    // 2. Rate Limiting (Tech Req 3 / FR12)
    const rateLimit = await checkRateLimit({
      req,
      route: 'verification-resend',
      email,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many resend attempts. Please try again later.',
          retryAfter: rateLimit.resetInSeconds,
        },
        { status: 429 },
      );
    }

    // 3. User lookup
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // Do not reveal account absence or return generic
      return NextResponse.json(
        { error: 'No account found with this email address.' },
        { status: 404 },
      );
    }

    if (user.emailVerifiedAt) {
      return NextResponse.json(
        { error: 'This email is already verified. Please sign in.' },
        { status: 400 },
      );
    }

    // 4. Server-Side Cooldown Check (FR5, Tech Req 6)
    const latestCode = await prisma.verificationCode.findFirst({
      where: { userId: user.id },
      orderBy: { lastSentAt: 'desc' },
    });

    if (latestCode) {
      const elapsedMs = Date.now() - latestCode.lastSentAt.getTime();
      if (elapsedMs < RESEND_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000);
        return NextResponse.json(
          {
            error: `Please wait ${remainingSeconds}s before requesting a new code.`,
            remainingSeconds,
          },
          { status: 429 },
        );
      }
    }

    // 5. Invalidate old unconsumed codes and issue new code
    await prisma.verificationCode.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const rawCode = generateVerificationCode();
    const codeHash = await hashPassword(rawCode);
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS);

    await prisma.verificationCode.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt,
        lastSentAt: new Date(),
      },
    });

    // 6. Log email
    await sendEmail(
      user.email,
      'Your new verification code',
      `Your verification code is: ${rawCode}. It will expire in 15 minutes.`,
    );

    return NextResponse.json(
      {
        success: true,
        message: 'A new verification code has been sent.',
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'An unexpected error occurred while resending code.' },
      { status: 500 },
    );
  }
}
