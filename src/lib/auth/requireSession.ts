/**
 * lib/auth/requireSession.ts — Shared server-side session guard.
 *
 * RULES (from AGENTS.md §2 and .agents/rules/03-security-invariants.md):
 * - This is the ONLY place that performs the "is this user logged in?" check.
 * - No page component or route handler may improvise its own session check.
 * - The guard must run server-side before any protected content is rendered.
 *   A client-side-only redirect is a security failure (AGENTS.md §3 rule 8).
 *
 * Usage in Next.js middleware (middleware.ts):
 *   const session = await requireSession(request);
 *
 * Usage in a Server Component or Route Handler:
 *   const session = await requireSession(request);
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, SESSION_COOKIE } from '@/lib/auth/session';
import type { Session } from '@prisma/client';

/**
 * Reads the session_id cookie, validates the session against the database,
 * and returns the Session row if valid.
 *
 * If no valid session exists, redirects the user to /signin server-side.
 * The redirect happens before any response body is sent — no content leaks.
 *
 * @returns The valid Session row.
 */
export async function requireSession(): Promise<Session> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE.name)?.value;

  if (!sessionId) {
    redirect('/auth');
  }

  const session = await getSession(sessionId);

  if (!session) {
    // Session expired or does not exist — send to auth page.
    redirect('/auth');
  }

  return session;
}
