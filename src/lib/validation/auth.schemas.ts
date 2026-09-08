/**
 * lib/validation/auth.schemas.ts — Single source of truth for all input validation.
 *
 * RULES (from .agents/rules/06-validation.md):
 * - All zod schemas live here and ONLY here.
 * - Server route handlers import and call .safeParse() on these schemas.
 * - Client forms import the same schema objects via @hookform/resolvers/zod.
 * - Never write a validation rule in any other file.
 * - Never write a second copy of the password rule.
 * - Use z.infer<typeof Schema> for TypeScript types — no hand-maintained duplicates.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared rules (used by multiple schemas — defined once, never duplicated)
// ---------------------------------------------------------------------------

/**
 * Password validation rule.
 * Policy: minimum 8 characters, no forced complexity.
 * Source: PRD §11 Assumptions / AGENTS.md §2 Auth mechanics.
 * This constant is the ONLY definition of the password rule in this codebase.
 */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters');

export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .regex(EMAIL_REGEX, 'Enter a valid email address (e.g. name@example.com)');

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------
export const SignupSchema = z.object({
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .refine(
      (val) => val.trim().split(/\s+/).filter(Boolean).length >= 2,
      'Full name must contain at least two words',
    ),
  email: emailSchema,
  password: passwordSchema,
});

export type SignupInput = z.infer<typeof SignupSchema>;

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------
export const SigninSchema = z.object({
  email: emailSchema,
  // Sign-in password is not validated for complexity — any non-empty string
  // is attempted against the stored hash (wrong passwords are caught by bcrypt).
  password: z.string().min(1, 'Password is required'),
});

export type SigninInput = z.infer<typeof SigninSchema>;

// ---------------------------------------------------------------------------
// Verify email (6-digit numeric code)
// ---------------------------------------------------------------------------
export const VerifyEmailSchema = z.object({
  email: emailSchema.optional(),
  code: z
    .string()
    .length(6, 'Verification code must be 6 digits')
    .regex(/^\d{6}$/, 'Verification code must contain only digits'),
});

export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

// ---------------------------------------------------------------------------
// Resend verification code
// ---------------------------------------------------------------------------
export const ResendCodeSchema = z.object({
  email: emailSchema,
});

export type ResendCodeInput = z.infer<typeof ResendCodeSchema>;

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------
export const ForgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------
export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
