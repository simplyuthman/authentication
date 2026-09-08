/**
 * lib/rateLimit.ts — Shared rate limiting helper.
 *
 * RULES (from AGENTS.md §2, §3 rule 10, and .agents/rules/05-auth-mechanics.md):
 * - Rate limiting: 5 requests per 15-minute sliding window.
 * - Keyed by composite key: route:ip:email.
 * - Applied to exactly four endpoints: signin, signup, forgot-password (password-reset-request), resend-code (verification-resend).
 * - State stored in PostgreSQL RateLimitAttempt table — NEVER Redis or in-memory.
 */

import { prisma } from '@/lib/prisma';
import {
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from '@/lib/constants';

export type RateLimitedRoute =
  | 'signin'
  | 'signup'
  | 'password-reset-request'
  | 'verification-resend';

export interface RateLimitParams {
  req: Request;
  route: RateLimitedRoute;
  email?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Extracts client IP from incoming request headers.
 */
function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

/**
 * Checks sliding-window rate limit against the RateLimitAttempt Postgres table.
 *
 * Runs BEFORE handler logic.
 * Exceeding RATE_LIMIT_MAX_REQUESTS (5) in RATE_LIMIT_WINDOW_MS (15m) returns allowed: false.
 */
export async function checkRateLimit({
  req,
  route,
  email = 'anonymous',
}: RateLimitParams): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const normalizedEmail = email.trim().toLowerCase();
  const key = `${route}:${ip}:${normalizedEmail}`;
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

  // 1. Record current attempt
  await prisma.rateLimitAttempt.create({
    data: {
      key,
      route,
      createdAt: now,
    },
  });

  // 2. Count attempts in sliding window
  const count = await prisma.rateLimitAttempt.count({
    where: {
      key,
      route,
      createdAt: {
        gte: windowStart,
      },
    },
  });

  const resetInSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
  const allowed = count <= RATE_LIMIT_MAX_REQUESTS;
  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - count);

  return {
    allowed,
    remaining,
    resetInSeconds,
  };
}
