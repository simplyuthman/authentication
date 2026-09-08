/**
 * lib/auth/session.ts — Session creation, retrieval, deletion, and cookie config.
 *
 * RULES (from AGENTS.md §2 and .agents/rules/05-auth-mechanics.md):
 * - Sessions are database-backed via the Session table. Never JWTs.
 * - Fixed 7-day lifetime set once at creation. Never silently extended on activity.
 *   (Whether the lifetime should be sliding is an Open Question — PRD §13.
 *    This implementation uses fixed lifetime as the conservative default.)
 * - Cookie name, httpOnly, Secure, and SameSite are locked values.
 */

import { prisma } from '@/lib/prisma';
import type { Session } from '@prisma/client';

// ---------------------------------------------------------------------------
// Named constants — never use inline literals for these values
// Source: .agents/rules/05-auth-mechanics.md §Named Constants
// ---------------------------------------------------------------------------

/** Fixed session lifetime: 7 days in milliseconds. */
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Session cookie configuration.
 * All four properties are locked — do not change any of them.
 * Source: AGENTS.md §2 / PRD §6 Tech Req 4
 */
export const SESSION_COOKIE = {
  name: 'session_id',
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  // maxAge in seconds (used by Next.js cookies API)
  maxAge: 60 * 60 * 24 * 7,
} as const;

// ---------------------------------------------------------------------------
// Session operations
// ---------------------------------------------------------------------------

/**
 * Creates a new Session row and returns the session ID to be stored in the cookie.
 *
 * The session ID is a cryptographically random UUID. It is an opaque token;
 * the server looks it up in the Session table on every request.
 *
 * @param userId - The ID of the User this session belongs to.
 * @returns The randomly generated session ID string.
 */
export async function createSession(userId: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      expiresAt,
    },
  });

  return sessionId;
}

/**
 * Retrieves a valid (non-expired) Session row by its ID.
 *
 * Expiry is checked against the database timestamp, not a client value.
 * Source: AGENTS.md §3 rule 5 / PRD FR4
 *
 * @param sessionId - The session ID value read from the request cookie.
 * @returns The Session row if it exists and has not expired; null otherwise.
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!session) return null;

  // Server-side expiry check — never rely on the client to know when a session dies.
  if (session.expiresAt < new Date()) {
    // Clean up the expired row to avoid accumulation.
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {
      // Silently ignore — the row may have been deleted by another request.
    });
    return null;
  }

  return session;
}

/**
 * Deletes a Session row by its ID.
 * Called on sign-out. The row must be deleted server-side — clearing the cookie
 * alone is not sufficient (AGENTS.md §3 rule 9 / PRD FR9).
 *
 * @param sessionId - The session ID value read from the request cookie.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {
    // Silently ignore if the row no longer exists (already signed out elsewhere).
  });
}
