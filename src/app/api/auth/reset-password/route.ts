import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { ResetPasswordSchema } from '@/lib/validation/auth.schemas';
import { hashPassword } from '@/lib/auth/password';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Schema Validation
    const validation = ResetPasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { token, password } = validation.data;

    // 2. Hash incoming token to match stored tokenHash (never stored as raw token)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // 3. Find token in database
    const resetTokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetTokenRecord) {
      return NextResponse.json(
        { error: 'Invalid or expired password reset link.' },
        { status: 400 },
      );
    }

    // 4. Single-use check (FR11, Tech Req 7)
    if (resetTokenRecord.usedAt !== null) {
      return NextResponse.json(
        { error: 'This password reset link has already been used.' },
        { status: 400 },
      );
    }

    // 5. Expiry check against database timestamp (FR11, Tech Req 7)
    if (resetTokenRecord.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Password reset link has expired. Please request a new one.' },
        { status: 400 },
      );
    }

    // 6. Hash new password via bcrypt
    const passwordHash = await hashPassword(password);

    // 7. Atomic transaction: update password and mark token used simultaneously
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetTokenRecord.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetTokenRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        message: 'Your password has been reset successfully. You may now sign in.',
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'An unexpected error occurred while resetting password.' },
      { status: 500 },
    );
  }
}
