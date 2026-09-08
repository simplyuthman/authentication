# Rule: Authentication Mechanics

> Source authority: `AGENTS.md §2 (What Is Locked — Auth mechanics)`
> Feature intent: `PRD.md §6 (Technical Requirements)`, `PRD.md §11 (Assumptions)`

Every value in this rule (cost factor, expiry windows, cookie attributes, code format, rate
limits) is a **locked decision**. Do not substitute, tune, or "improve" any value without
flagging it. If you believe a value is wrong, stop and say so — do not silently override it.

---

## Password Hashing

| Property | Value |
|---|---|
| Library | `bcryptjs` (pure JS — no native bindings) |
| Cost factor | `12` |
| Implementation location | `lib/auth/password.ts` — **exclusively** |
| Stored field | `User.passwordHash` |

```ts
// lib/auth/password.ts — the ONLY place passwords are hashed
import bcrypt from 'bcryptjs';

const COST_FACTOR = 12; // Named constant — never inline this number

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, COST_FACTOR);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
```

**Never use:** MD5, SHA-1, SHA-256, SHA-512, or any general-purpose hash function for passwords.

---

## Session Management

| Property | Value |
|---|---|
| Storage | PostgreSQL `Session` table — **never JWTs** |
| Cookie name | `session_id` (exact name; do not rename) |
| Cookie `HttpOnly` | `true` |
| Cookie `Secure` | `true` |
| Cookie `SameSite` | `Lax` (not `Strict` — reset links from email clients need this) |
| Session lifetime | Fixed **7 days** from creation |
| Lifetime extension | **Never** — sessions are not silently extended on activity |
| On sign-out | Delete the `Session` row AND clear the cookie |

```ts
// lib/auth/session.ts — cookie config as a named constant
export const SESSION_COOKIE = {
  name: 'session_id',
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
} as const;
```

The session ID is an opaque, randomly generated token (e.g. `crypto.randomUUID()` or
`crypto.getRandomValues()`). It must not be a JWT or a predictable value.

---

## Verification Codes

| Property | Value |
|---|---|
| Format | 6-digit numeric string (e.g. `"483921"`) |
| Storage | Hashed as `codeHash` in `VerificationCode` — raw code never stored |
| Expiry | 15 minutes from generation (`expiresAt = now() + 15 min`) |
| Resend cooldown | 60 seconds, enforced server-side against `lastSentAt` |
| On resend | Previous unconsumed code is invalidated; `lastSentAt` is updated |
| On success | `consumedAt` is set; a `Session` is created and cookie is issued |

Named constants (must be defined in a single config location):
```ts
export const VERIFICATION_CODE_EXPIRY_MS = 15 * 60 * 1000;   // 15 minutes
export const RESEND_COOLDOWN_MS          = 60 * 1000;         // 60 seconds
export const VERIFICATION_CODE_LENGTH    = 6;
```

---

## Password Reset Tokens

| Property | Value |
|---|---|
| Format | Cryptographically random URL-safe token (e.g. base64url from `crypto.getRandomValues()`) |
| Storage | Hashed as `tokenHash` in `PasswordResetToken` — raw token never stored |
| Expiry | 60 minutes from generation (`expiresAt = now() + 60 min`) |
| Single-use | `usedAt` is set atomically in the same transaction as the password update |
| After use | Same token rejected on any subsequent attempt (`usedAt IS NOT NULL`) |

Named constants:
```ts
export const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 60 minutes
```

---

## Rate Limiting

| Property | Value |
|---|---|
| Window | 15 minutes (sliding) |
| Threshold | 5 requests per window |
| Keying | `"route:ip:email"` composite key |
| Storage | `RateLimitAttempt` PostgreSQL table — **never Redis, never in-memory** |
| Response on limit | HTTP `429 Too Many Requests` with retry indication |
| Implementation | Shared `lib/rateLimit.ts` helper — called at the top of all four limited routes |

**All four routes must be covered — missing one is a failure:**
- `/api/auth/signin`
- `/api/auth/signup`
- `/api/auth/forgot-password`
- `/api/auth/resend-code`

Named constants:
```ts
export const RATE_LIMIT_MAX_REQUESTS = 5;
export const RATE_LIMIT_WINDOW_MS    = 15 * 60 * 1000; // 15 minutes
```

The rate-limit helper must run before any other logic in the route:
```ts
// ✅ Correct call order in a limited route
export async function POST(req: Request) {
  const rateLimitResult = await checkRateLimit({ route: 'signin', ip, email });
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  // ... rest of handler logic
}
```

---

## Email Delivery

| Property | Value |
|---|---|
| Interface | Pluggable (abstract interface in `lib/email.ts`) |
| Development behavior | Console logger — logs a formatted line, not a debug dump |
| Production integration | Out of scope for this slice — do not wire up a real provider |

```ts
// lib/email.ts — development logger format
console.log(`[EMAIL] To: ${to} | Subject: ${subject} | Body: ${text}`);
// NOT: console.log(emailData); // unstructured debug print
```

---

## Password Policy

| Property | Value |
|---|---|
| Minimum length | 8 characters |
| Complexity rules | None (no forced uppercase, numbers, special chars) |
| Enforcement | Server-side, via the shared zod schema in `lib/validation/auth.schemas.ts` |

---

## Magic Numbers — Named Constants Required

All threshold and expiry values must be defined as **named constants in a single config location**
(e.g. `lib/constants.ts` or co-located in each `lib/auth/*.ts` file), never as inline literals.

**Locked values:**
| Constant Name | Value |
|---|---|
| `BCRYPT_COST_FACTOR` | `12` |
| `SESSION_LIFETIME_MS` | `7 * 24 * 60 * 60 * 1000` (7 days) |
| `VERIFICATION_CODE_EXPIRY_MS` | `15 * 60 * 1000` (15 min) |
| `VERIFICATION_CODE_LENGTH` | `6` |
| `RESEND_COOLDOWN_MS` | `60 * 1000` (60 sec) |
| `RESET_TOKEN_EXPIRY_MS` | `60 * 60 * 1000` (60 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `5` |
| `RATE_LIMIT_WINDOW_MS` | `15 * 60 * 1000` (15 min) |
