import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { ForgotPasswordSchema } from '@/lib/validation/auth.schemas';
import { sendEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rateLimit';
import { RESET_TOKEN_EXPIRY_MS } from '@/lib/constants';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Validate input schema
    const validation = ForgotPasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { email } = validation.data;

    // 2. Rate Limiting (FR12, Tech Req 3)
    const rateLimit = await checkRateLimit({
      req,
      route: 'password-reset-request',
      email,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many password reset requests. Please try again later.',
          retryAfter: rateLimit.resetInSeconds,
        },
        { status: 429 },
      );
    }

    // 3. User lookup
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // 4. Always return identical generic confirmation response (FR10 — no account enumeration)
    const genericResponse = {
      success: true,
      message:
        'If an account exists with this email address, password reset instructions have been sent.',
    };

    if (user) {
      // Generate random 32-byte hex token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

      // Store hashed token in database
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      // Send transactional reset email (logs in dev)
      const resetLink = `http://localhost:3000/reset-password?token=${rawToken}`;
      await sendEmail(
        user.email,
        'Reset your password',
        `Click here to reset your password: ${resetLink} (Link expires in 60 minutes)`,
      );
    }

    return NextResponse.json(genericResponse, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 },
    );
  }
}
