import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { SignupSchema } from '@/lib/validation/auth.schemas';
import { hashPassword } from '@/lib/auth/password';
import { sendEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  VERIFICATION_CODE_EXPIRY_MS,
  VERIFICATION_CODE_LENGTH,
} from '@/lib/constants';

/**
 * Generates a cryptographically secure numeric verification code.
 */
function generateVerificationCode(): string {
  const min = Math.pow(10, VERIFICATION_CODE_LENGTH - 1);
  const max = Math.pow(10, VERIFICATION_CODE_LENGTH) - 1;
  const num = crypto.randomInt(min, max + 1);
  return num.toString();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Schema Validation (Tech Req 2)
    const validation = SignupSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { email, fullName, password } = validation.data;

    // 2. Rate Limiting (Tech Req 3 / FR12)
    const rateLimit = await checkRateLimit({
      req,
      route: 'signup',
      email,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many signup attempts. Please try again later.',
          retryAfter: rateLimit.resetInSeconds,
        },
        { status: 429 },
      );
    }

    // 3. Password Hashing (Tech Req 1)
    const passwordHash = await hashPassword(password);

    // 4. User Insertion with DB-level unique constraint handling (FR2, Tech Req 8, 9)
    let user;
    try {
      user = await prisma.user.create({
        data: {
          fullName: fullName.trim(),
          email: email.toLowerCase().trim(),
          passwordHash,
          emailVerifiedAt: null,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Idempotent response for duplicate email
        return NextResponse.json(
          {
            success: true,
            message: 'Verification code sent.',
            email: email.toLowerCase().trim(),
          },
          { status: 200 },
        );
      }
      throw err;
    }

    // 5. Generate and store verification code
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

    // 6. Send transactional verification email (dev console logger)
    await sendEmail(
      user.email,
      'Verify your email address',
      `Your verification code is: ${rawCode}. It will expire in 15 minutes.`,
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Account created. Verification code sent.',
        email: user.email,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[SIGNUP-ERROR]:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during signup.' },
      { status: 500 },
    );
  }
}
