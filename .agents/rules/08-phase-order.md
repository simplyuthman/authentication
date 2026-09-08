# Rule: Phased Build Order

> Source authority: `PRD.md §12 (Phased Roadmap)`, `AGENTS.md §3 rule 13`

This slice ships as a single deliverable, but the implementation must follow a strict build
order. **Do not implement Phase N+1 behavior while Phase N is unfinished.**

Violating this order — even "just to get something working while in the area" — is a failure.
See `AGENTS.md §3 rule 13`.

---

## Phase Map

| Phase | Name | Deliverables | Must Be Complete Before |
|---|---|---|---|
| **1** | Data model and infrastructure | Prisma schema, Docker Compose, zod schemas | Phase 2 |
| **2** | Core account creation and session | Signup route, bcrypt hashing, idempotency, session/cookie, sign-out | Phase 3 |
| **3** | Email verification | Code generation + hashing, verify-email route, resend route + cooldown, expiry enforcement | Phase 4 |
| **4** | Sign-in and protected routing | Sign-in route, generic error messaging, server-side session guard, placeholder dashboard | Phase 5 |
| **5** | Password reset | Forgot-password route (enumeration-safe), token generation + hashing, reset-password route (atomic single-use + expiry) | Phase 6 |
| **6** | Rate limiting | Shared `lib/rateLimit.ts` applied to all four routes, verified by direct repeated calls | Phase 7 |
| **7** | Accessibility and hardening | `FormField` component + focus states across all five screens, full Success Metrics checklist | — |

---

## Phase 1 — Data Model and Infrastructure

**Goal:** Establish the non-negotiable foundation before any application logic exists.

Deliverables:
- `prisma/schema.prisma` with exactly five models (`User`, `Session`, `VerificationCode`,
  `PasswordResetToken`, `RateLimitAttempt`) as defined in `04-data-model.md`
- `docker-compose.yml` for local PostgreSQL
- Initial migration: `npx prisma migrate dev --name init`
- `lib/prisma.ts` — single Prisma Client instance
- `lib/validation/auth.schemas.ts` — all zod schemas (see `06-validation.md`)
- `.env.example` with commented placeholders; `.env` in `.gitignore`

Phase 1 is complete when:
- `npx prisma validate` passes with no errors
- `npx prisma migrate status` shows the migration applied
- `lib/validation/auth.schemas.ts` exists and exports all six schemas

---

## Phase 2 — Core Account Creation and Session

**Goal:** A user can sign up; the duplicate-email case is handled idempotently; sessions and
cookies work; sign-out deletes the session row.

Deliverables:
- `lib/auth/password.ts` — `hashPassword` and `verifyPassword` functions
- `lib/auth/session.ts` — session creation, session read, cookie config (`SESSION_COOKIE`)
- `src/app/api/auth/signup/route.ts` — validates input, hashes password, handles DB unique
  violation, returns success-shaped response
- `src/app/api/auth/signout/route.ts` — deletes `Session` row, clears cookie
- `src/app/(auth)/signup/page.tsx` — signup form wired to the API
- Signup form uses the shared `SignupSchema` via `@hookform/resolvers/zod`

Phase 2 is complete when:
- Two simultaneous POST requests to `/api/auth/signup` produce exactly one `User` row
- `User.passwordHash` in the DB begins with `$2b$` (bcrypt prefix)
- Sign-out deletes the `Session` row (verify via direct DB query)

---

## Phase 3 — Email Verification

**Goal:** A signed-up user can verify their email via a 6-digit code; codes expire; resend is
rate-cooldown-enforced server-side; a valid code creates a session.

Deliverables:
- Code generation utility (secure random 6-digit numeric code)
- `src/app/api/auth/verify-email/route.ts` — checks `codeHash`, expiry, `consumedAt`;
  sets `emailVerifiedAt`; creates `Session`
- `src/app/api/auth/resend-code/route.ts` — checks `lastSentAt` cooldown; invalidates
  previous code; generates new code; updates `lastSentAt`
- `lib/email.ts` — pluggable interface + dev console logger
- `src/app/(auth)/verify-email/page.tsx` — 6-digit code form

Phase 3 is complete when:
- An expired code (based on `expiresAt` in DB) is rejected — testable by direct API call
- Resend within 60 seconds of last send is rejected — testable by direct API call
- Successful code entry sets `consumedAt` and `emailVerifiedAt` in the DB
- `VerificationCode.codeHash` in DB is a bcrypt hash, not the raw 6-digit code

---

## Phase 4 — Sign-in and Protected Routing

**Goal:** A verified user can sign in; generic error messaging prevents account enumeration;
the dashboard is unreachable without a valid server-side session; unverified users are blocked.

Deliverables:
- `src/app/api/auth/signin/route.ts` — password comparison; returns identical error for
  wrong password vs. no account; rejects unverified accounts with a distinct message
- `lib/auth/requireSession.ts` — shared session guard
- `src/app/middleware.ts` — calls `requireSession` for the `/dashboard` route
- `src/app/dashboard/page.tsx` — displays user name + sign-out button only
- `src/app/(auth)/signin/page.tsx` — sign-in form

Phase 4 is complete when:
- `curl http://localhost:3000/dashboard` (no cookie) returns a redirect, not 200
- Sign-in with wrong password and sign-in with unknown email return identically shaped responses
- Unverified users cannot reach the dashboard

---

## Phase 5 — Password Reset

**Goal:** A user can request a password reset, follow the emailed link, and set a new password;
the token is single-use and expires after 60 minutes; the request reveals nothing about whether
an email is registered.

Deliverables:
- `src/app/api/auth/forgot-password/route.ts` — always returns generic confirmation; if email
  exists, generates token, stores `tokenHash`, sends (logs) reset link
- `src/app/api/auth/reset-password/route.ts` — hashes incoming token, checks `tokenHash`
  match, checks `usedAt IS NULL`, checks `expiresAt`, atomically updates `passwordHash`
  and sets `usedAt` in a single transaction
- `src/app/(auth)/forgot-password/page.tsx`
- `src/app/(auth)/reset-password/page.tsx`

Phase 5 is complete when:
- Forgot-password request for a non-existent email returns the same response as for an
  existing email (no enumeration)
- A reset token used once cannot be used a second time (verified by direct API call)
- An expired token is rejected (verify by manipulating `expiresAt` in DB)
- `PasswordResetToken.tokenHash` in DB is a hash, not the raw token

---

## Phase 6 — Rate Limiting

**Goal:** All four required endpoints enforce the 5-request-per-15-minute limit, verified by
direct repeated calls — not just by looking at the UI.

Deliverables:
- `lib/rateLimit.ts` — shared helper: writes to `RateLimitAttempt`, runs sliding-window COUNT
  query, returns `{ allowed: boolean }`
- Rate-limit call added at the top of each of the four routes:
  - `/api/auth/signin`
  - `/api/auth/signup`
  - `/api/auth/forgot-password`
  - `/api/auth/resend-code`

Phase 6 is complete when (for each of the four routes):
- Requests 1–5 succeed (or fail for business logic reasons) with non-429 status
- Request 6 within the same 15-minute window returns HTTP 429
- This is tested by direct repeated `curl` calls, not by using the UI

---

## Phase 7 — Accessibility and Hardening

**Goal:** Structural accessibility across all five screens; full run-through of the
Success Metrics checklist.

Deliverables:
- `components/forms/FormField.tsx` — shared labeled-input component with:
  - `<label htmlFor={id}>` paired with `<input id={id}>`
  - Visible `:focus-visible` outline style
  - Error message rendered as a sibling element
- All five auth screen forms refactored to use `FormField`
- Complete run-through of every item in the `09-done-checklist.md` with pass/fail evidence

Phase 7 is complete when every item in `09-done-checklist.md` is honestly checkable as ✅ pass.
