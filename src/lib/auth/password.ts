/**
 * lib/auth/password.ts — Password hashing and verification.
 *
 * RULES (from AGENTS.md §2 and .agents/rules/05-auth-mechanics.md):
 * - This is the ONLY file that imports or calls bcryptjs.
 * - No route handler, page component, or utility may hash a password directly.
 * - Cost factor is a named constant — never an inline literal.
 * - Never use a general-purpose hash (MD5, SHA-256, etc.) for passwords.
 */

import bcrypt from 'bcryptjs';

/**
 * bcrypt cost factor — locked at 12.
 * Source: PRD §6 Tech Req 1 / AGENTS.md §2 / .agents/rules/05-auth-mechanics.md
 */
const BCRYPT_COST_FACTOR = 12;

/**
 * Hashes a plaintext password using bcrypt.
 * The plaintext password is not stored or logged at any point.
 *
 * @param plaintext - The raw password from the user's form submission.
 * @returns A bcrypt hash string beginning with $2b$.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST_FACTOR);
}

/**
 * Compares a plaintext password against a stored bcrypt hash.
 * Safe against timing attacks via bcrypt's constant-time comparison.
 *
 * @param plaintext - The raw password from the sign-in form.
 * @param hash      - The stored bcrypt hash from User.passwordHash.
 * @returns true if the password matches; false otherwise.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
