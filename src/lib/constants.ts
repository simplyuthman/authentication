/**
 * lib/constants.ts — Canonical named constants for the authentication slice.
 *
 * Source authority: AGENTS.md §5 (No Magic Numbers), .agents/rules/05-auth-mechanics.md
 */

/** Cost factor for bcrypt hashing (locked at 12) */
export const BCRYPT_COST_FACTOR = 12;

/** Fixed session lifetime: 7 days in milliseconds */
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** Verification code length (6 digits) */
export const VERIFICATION_CODE_LENGTH = 6;

/** Verification code expiry window: 15 minutes in milliseconds */
export const VERIFICATION_CODE_EXPIRY_MS = 15 * 60 * 1000;

/** Resend verification code cooldown: 60 seconds in milliseconds */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/** Password reset token expiry window: 60 minutes in milliseconds */
export const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;

/** Maximum allowed attempts per rate limit window (5 requests) */
export const RATE_LIMIT_MAX_REQUESTS = 5;

/** Rate limit sliding window duration: 15 minutes in milliseconds */
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
