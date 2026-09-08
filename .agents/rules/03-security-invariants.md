# Rule: Security Invariants — What Must Never Happen

> Source authority: `AGENTS.md §3 (What Must Never Happen)`
> Feature intent: `PRD.md §6 (Technical Requirements)`, `PRD.md §8 (Risks)`

These are inviolable security and correctness rules. **Breaking any rule here means the slice has
failed, even if the feature appears to work correctly in a browser.** The Reviewer persona (who
calls API endpoints directly, replays cookies, and inspects the database) determines whether these
hold — not the Applicant persona who uses the UI normally.

---

## The Invariant List

### 1 — Never store or log plaintext secrets

**AGENTS.md §3 rule 1 / Tech Req 1 / Success Metric 2**

The database, application logs, and network responses must never contain:
- A plaintext password (only `passwordHash` — bcrypt output)
- A raw verification code (only `codeHash` — bcrypt hash of the 6-digit code)
- A raw reset token (only `tokenHash` — bcrypt or SHA-256 hash of the URL token)

Verification:
```bash
# No plaintext password in users table
SELECT "passwordHash" FROM "User" LIMIT 5; -- must start with $2b$
```

---

### 2 — Never trust client-side validation

**AGENTS.md §3 rule 2 / Tech Req 2**

Every route handler must independently re-validate every input against the shared zod schema
(`lib/validation/auth.schemas.ts`), regardless of whether the browser already validated it.
A valid-looking browser submission with a tampered body must be caught server-side.

```ts
// ✅ Correct — always validate on the server
const result = SignupSchema.safeParse(await req.json());
if (!result.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
```

---

### 3 — Never create a second account for a duplicate email

**AGENTS.md §3 rule 3 / FR2 / Tech Req 8, 9 / Success Metric 3**

Two simultaneous or rapid-succession signup requests for the same email must always result in
exactly one `User` row. The mechanism is the DB-level `@unique` constraint, not an
application-level check-then-insert. The handler catches the Prisma unique-violation error and
returns the same success-shaped response.

Verification:
```bash
curl -s -X POST /api/auth/signup -d '{"email":"test@example.com","password":"Test1234!"}' &
curl -s -X POST /api/auth/signup -d '{"email":"test@example.com","password":"Test1234!"}' &
wait
# Then: SELECT COUNT(*) FROM "User" WHERE email = 'test@example.com'; -- must be 1
```

---

### 4 — Never reveal whether an email is registered (account enumeration)

**AGENTS.md §3 rule 4 / FR7, FR10**

| Endpoint | Correct Behavior |
|---|---|
| Sign-in (wrong password) | Generic "Invalid credentials" — identical to "no account" response |
| Sign-in (no account) | Generic "Invalid credentials" — identical to "wrong password" response |
| Forgot-password (email exists) | Generic "If an account exists, a link has been sent" |
| Forgot-password (no account) | Exact same generic response as above |
| Signup (email already exists) | **Exception** — may state "An account with that email already exists" |

The only exception is signup, where user-facing feedback about a duplicate is acceptable.

---

### 5 — Never enforce code/token expiry only in the UI

**AGENTS.md §3 rule 5 / FR4 / Tech Req 5**

Verification code expiry (`VerificationCode.expiresAt`) and reset token expiry
(`PasswordResetToken.expiresAt`) are checked against the **database timestamp** on every
server-side attempt. A browser countdown or disabled button is cosmetic only — the server
does not care what the UI displayed.

---

### 6 — Never enforce the resend cooldown only by disabling a button

**AGENTS.md §3 rule 6 / FR5 / Tech Req 6**

The 60-second resend cooldown is checked server-side against `VerificationCode.lastSentAt`
before a new code is issued. A direct `curl` call to `/api/auth/resend-code` during the
cooldown window must be rejected — the server does not rely on the button being disabled.

---

### 7 — Never allow a reset token to be used twice or after expiry

**AGENTS.md §3 rule 7 / FR11 / Tech Req 7**

Both checks — single-use (`usedAt IS NULL`) and time-limit (`expiresAt > NOW()`) — must happen
**inside the same transaction** that sets the new `passwordHash` and stamps `usedAt`.
This eliminates the race condition between a valid check and the update that consumes the token.

```ts
// ✅ Correct — atomic check and update
await prisma.$transaction(async (tx) => {
  const token = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!token || token.usedAt || token.expiresAt < new Date()) throw new InvalidTokenError();
  await tx.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
  await tx.user.update({ where: { id: token.userId }, data: { passwordHash: newHash } });
});
```

---

### 8 — Never protect a route only on the client

**AGENTS.md §3 rule 8 / FR8 / Tech Req 10**

The dashboard route must perform a server-side session check before any content is rendered
or returned. A client-side-only redirect (e.g., using `useEffect` or `router.push`) that
briefly renders protected content, or still returns data to a direct `curl` request, is a failure.

Verification:
```bash
# Must return a redirect (3xx), not 200 with dashboard content
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard
# Expected: 307 (or similar redirect), not 200
```

---

### 9 — Never leave a session alive after sign-out

**AGENTS.md §3 rule 9 / FR9**

Sign-out must:
1. Delete the `Session` row from the database (not merely clear the cookie)
2. Clear the `session_id` cookie

After sign-out, replaying the old cookie value must fail to reach the dashboard because the
session no longer exists server-side.

Verification:
```bash
# 1. Sign in, capture the Set-Cookie value
# 2. Sign out
# 3. Replay the captured cookie — must get a redirect, not dashboard content
curl -s -H "Cookie: session_id=<old_value>" http://localhost:3000/dashboard
```

---

### 10 — Never apply rate limiting to fewer than four endpoints

**AGENTS.md §3 rule 10 / FR12 / Tech Req 3**

All four of these routes must invoke the shared `lib/rateLimit.ts` helper at their very top,
before any other logic executes:

- `/api/auth/signin`
- `/api/auth/signup`
- `/api/auth/forgot-password`
- `/api/auth/resend-code`

Missing even one endpoint (most likely `resend-code`) constitutes a failure even if the other
three work correctly.

---

### 11 — Never enforce email uniqueness only in application code

**AGENTS.md §3 rule 11 / Tech Req 8**

The `@unique` constraint on `User.email` in the Prisma schema generates a Postgres unique index.
This is the actual enforcement mechanism. Application code may check for UX reasons, but the
database constraint must exist and be active.

---

### 12 — Never build outside the five screens and placeholder dashboard

**AGENTS.md §3 rule 12**

No feature, page, or endpoint may exist in this repository that isn't one of:
- Five auth screens + their seven API route handlers
- One placeholder dashboard (name + sign-out only)
- Supporting lib/ utilities

---

### 13 — Never build a later phase before an earlier one is complete

**AGENTS.md §3 rule 13**

Follow the phase order from `PRD.md §12` exactly. Phase 5 (password reset) must not be
implemented while Phase 2 (signup/session) is unfinished. See `08-phase-order.md`.

---

### 14 — Never commit `.env` or a real secret

**AGENTS.md §3 rule 14**

Only `.env.example` (with commented placeholder values) may be committed to version control.
The actual `.env` file must be listed in `.gitignore`.
