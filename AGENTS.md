# AGENTS.md

Rules of engagement for any AI coding agent (this file is written for Antigravity) building the Authentication Slice. This file tells you **how to behave**. It does not tell you what to build — that is `PRD.md`. Read `PRD.md` for features, screens, and requirement numbers (FR1–FR13, Technical Requirements 1–11, Success Metrics 1–11). Read this file for the rules you may not break while building them.

If anything here appears to conflict with `PRD.md`, this file wins on *behavior* (tools, scope, sequencing, protection rules); `PRD.md` wins on *feature intent*. If the conflict is real and not just apparent, stop and flag it — do not silently pick a side.

---

## 1. What This Project Is

This is a standalone authentication slice: create account, sign in, forgot password, reset password, and email verification, ending at a placeholder dashboard. It is not part of a larger application. It ships no feature outside authentication.

- **Who it's for:** a single, unprivileged user type, identified by email only. There is no admin, no team, no roles.
- **Version being built:** the whole slice, in one pass, in the phase order defined in `PRD.md` Section 12 (Phase 1 → Phase 7). There is no v2 to plan for and no future phase to build ahead of.
- **Source of truth:** `PRD.md`. If you are unsure what a screen should do, what a field means, or what "done" looks like for a feature, `PRD.md` has the answer. This file never overrides a feature decision made there — it only constrains how you go about building it.
- **This file's job:** stop you from picking your own tools, rearranging the system your own way, building later-phase features early, or quietly relaxing a business/security rule because the happy path still works without it.

---

## 2. What Is Locked

Everything below is a decision that has already been made. Do not swap it, upgrade it, "improve" it, or replace it with something you consider better practice. If you believe one of these is genuinely wrong, say so and stop — do not silently override it.

**Stack**
- Next.js, TypeScript, Prisma, PostgreSQL. No other framework, ORM, or database, anywhere in this slice.
- Local development database is Docker-based PostgreSQL. Do not point development at a hosted provider.

**Data model**
- Use exactly the five Prisma models defined in `PRD.md` Section 9: `User`, `Session`, `VerificationCode`, `PasswordResetToken`, `RateLimitAttempt`. Do not add, remove, or rename a model or a field that carries a documented decision without flagging it first.
- Every field comment in that schema documents *why* the field exists. Preserve the behavior the comment describes, not just the field name.

**Auth mechanics**
- Password hashing: bcrypt (via `bcryptjs`), cost factor 12, isolated in `lib/auth/password.ts`. Never use a general-purpose hash (MD5, SHA-256, etc.) for passwords, under any justification.
- Sessions: database-backed via the `Session` table. Never implement sessions as JWTs. Fixed 7-day lifetime, set once at creation. Never silently extend a session on activity.
- Session cookie: name `session_id`, `httpOnly`, `Secure`, `SameSite=Lax`. Do not change any of these four properties.
- Verification codes: 6-digit numeric, stored as `codeHash` (never store the raw code), 15-minute expiry.
- Resend cooldown: 60 seconds, enforced server-side.
- Password reset tokens: stored as `tokenHash` (never store the raw token), 60-minute expiry, single use.
- Rate limiting: 5 requests per 15-minute window, keyed by IP + email together, applied to exactly four endpoints — signin, signup, password-reset-request, verification-resend. State stored in the `RateLimitAttempt` Postgres table. Never use Redis, an in-memory store, or any other cache layer for this.
- Password policy: minimum 8 characters, no forced complexity rules, enforced server-side via schema.

**Validation**
- All input schemas are `zod`, defined once in `lib/validation/*.ts`, imported directly by API route handlers as the source of truth, and reused client-side via `@hookform/resolvers/zod` with React Hook Form. Do not write a second, divergent copy of any validation rule on the client.

**Email**
- Email delivery goes through a pluggable interface. In development it logs to console. Do not wire up a real provider — that integration is explicitly out of scope for this slice.

---

## 3. What Must Never Happen

Every rule below protects a user or the integrity of the system. **Breaking any rule on this list means the task has failed, even if the feature appears to work in the browser.** This is the exact distinction the PRD draws between the "Applicant" persona (who only uses the UI as intended) and the "Reviewer" persona (who calls endpoints directly, replays cookies, and inspects the database) — you are being graded as the Reviewer would test it, not as the Applicant would use it.

1. **Never store or log a plaintext password, verification code, or reset token, anywhere** — not in the database, not in application logs, not in a network response. Only `passwordHash`, `codeHash`, and `tokenHash` may exist. *(Tech Req 1; Success Metric 2)*
2. **Never trust client-side validation.** Every route must independently re-validate every input against the shared `zod` schema, even if the browser already checked it. *(Tech Req 2)*
3. **Never let a duplicate signup create a second account.** Rely on the database unique constraint on `email`; catch the conflict and return the same success-shaped response. Do not build idempotency any other way (no separate idempotency-key table). *(FR2; Tech Req 8, 9; Success Metric 3)*
4. **Never reveal whether an email is registered.** Sign-in failures return the identical generic message for "wrong password" and "no such account." Forgot-password requests return the identical generic confirmation whether or not the email exists. Signup is the one exception — it may state plainly that an email is already registered. *(FR7, FR10)*
5. **Never check expiry only in the UI.** Verification-code and password-reset-token expiry must be enforced against the database timestamp on every attempt, independent of what the client displayed or believed. *(FR4; Tech Req 5)*
6. **Never enforce the resend cooldown only by disabling a button.** The 60-second cooldown must be checked server-side against `lastSentAt` before issuing a new code. *(FR5; Tech Req 6)*
7. **Never let a password reset token be used twice, or used after expiry.** Both checks — single-use and time-limit — must happen inside the same transaction that updates the password, so there is no window between checking and updating. *(FR11; Tech Req 7)*
8. **Never protect a route only on the client.** Every protected route (the dashboard) must perform a server-side session check before any content is rendered or returned. A client-side-only redirect that briefly flashes protected content, or that still returns data to a direct request, is a failure regardless of how it looks in a browser. *(FR8; Tech Req 10)*
9. **Never leave a session alive after sign-out.** Sign-out must delete the `Session` row server-side. A replayed old cookie must fail to reach the dashboard afterward. *(FR9)*
10. **Never apply rate limiting to only some of the four required endpoints.** Signin, signup, password-reset-request, and verification-resend must all be covered by the same shared rate-limit check. Partial coverage (e.g. forgetting resend) is a failure even if the other three work. *(FR12; Tech Req 3)*
11. **Never enforce email uniqueness only in application code.** The database-level `@unique` constraint is the actual guarantee; application code may check it for UX, but must not be the only thing preventing a duplicate. *(Tech Req 8)*
12. **Never build outside the five screens and the placeholder dashboard.** No landing page, no marketing page, no dashboard feature beyond the user's name and a sign-out button, no profile editing, no account settings, no social sign-in, no two-factor authentication, no admin or multi-role functionality. If it is not one of the five screens or the one-line dashboard, it does not belong in this slice, no matter how small or "obviously useful" it seems.
13. **Never build a later phase before an earlier one is complete.** Follow the phase order in `PRD.md` Section 12 exactly: data model and infrastructure, then signup/session, then email verification, then sign-in/protected routing, then password reset, then rate limiting, then the accessibility pass. Do not implement Phase 5 behavior while Phase 2 is still unfinished, even if it would be convenient to do while you're "in the area."
14. **Never commit `.env` or a real secret.** Only `.env.example` with commented placeholders may be committed.

---

## 4. How The Work Is Arranged

Follow this layout. Do not invent a parallel structure for the same responsibility (e.g. a second validation location, a per-route rate-limit implementation, a per-screen input component).

```
/prisma
  schema.prisma              # the five locked models — see Section 2
  migrations/

/src
  /app
    /(auth)
      /signup/page.tsx
      /signin/page.tsx
      /forgot-password/page.tsx
      /reset-password/page.tsx
      /verify-email/page.tsx
    /dashboard/page.tsx       # placeholder dashboard only — name + sign-out
    /api/auth
      /signup/route.ts
      /signin/route.ts
      /signout/route.ts
      /verify-email/route.ts
      /resend-code/route.ts
      /forgot-password/route.ts
      /reset-password/route.ts
    layout.tsx
    middleware.ts             # server-side protected-route check lives here

  /components
    /forms
      FormField.tsx           # ONE shared labeled-input component, used by all five screens

  /lib
    /auth
      password.ts             # bcrypt hashing only — nowhere else hashes a password
      session.ts               # session create / destroy / read, cookie config
      requireSession.ts        # the shared server-side session guard
    /validation
      auth.schemas.ts          # all zod schemas — single source, imported both server and client
    rateLimit.ts                # the one shared rate-limit helper, called by all four limited routes
    email.ts                    # pluggable email interface + dev console logger
    prisma.ts                   # single Prisma client instance

  /types

.env.example                  # committed, placeholders only
.env                          # never committed
docker-compose.yml            # local Postgres for development
```

**Separation rules:**
- Password hashing lives only in `lib/auth/password.ts`. No route or component hashes a password directly.
- The rate-limit check lives only in `lib/rateLimit.ts` and is called at the top of each of the four limited routes. No route re-implements its own counting logic.
- The session guard lives only in `lib/auth/requireSession.ts` / `middleware.ts`. No screen or route improvises its own "is this user logged in" check.
- Validation schemas live only in `lib/validation/auth.schemas.ts`. Client-side forms import the same schema object — they do not restate the rules.
- API route handlers (`/api/auth/*`) do the validating, hashing, and DB writes. Page components (`/app/(auth)/*`) do the rendering and form wiring. Do not put database calls inside a page component when a route handler exists for that action, and do not put rendering logic inside a route handler.

---

## 5. How The Code Should Look

- **Runtime:** current Node.js LTS. Do not target an EOL Node version or an unstable/canary release.
- **TypeScript:** `strict: true`. No `any` unless you leave a comment explaining exactly why nothing narrower works. Prefer types inferred from the `zod` schemas (`z.infer<typeof Schema>`) over hand-written duplicate types.
- **Style:** ESLint + Prettier, default Next.js config, no custom rule-bending. Format on save; do not hand-format around the linter.
- **Naming:** files and folders follow the layout in Section 4 exactly. Functions and variables are named for what they do, not abbreviated for typing speed.
- **No magic numbers.** Cooldowns, expiries, and thresholds (15 minutes, 60 seconds, 60 minutes, 5 requests, cost factor 12) are named constants in one config location, not inline literals scattered across files.
- **No commented-out code and no dead code.** If something was tried and abandoned, remove it; git history is the record, not a comment block.
- **No stray `console.log`.** The only intentional console output is the dev email logger described in `lib/email.ts`, and it should read like a log line, not a debug print.
- **Errors:** every route returns a typed, consistent error shape. No unhandled promise rejections, no bare `catch {}` blocks that swallow an error silently.
- **Commits:** incremental and scoped to one phase-step at a time, matching the phase order in Section 3, rule 13 — not one giant commit at the end.

---

## 6. What Counts As Done

Before declaring this slice finished, produce this checklist filled in with a pass/fail against the actual running system — not a restatement of intent:

- [ ] `npm run build` completes with zero errors and zero TypeScript errors.
- [ ] `npm run lint` completes with zero errors.
- [ ] All five screens are reachable and complete their flow end to end (FR1, FR3, FR6, FR10, FR11).
- [ ] Duplicate signup, submitted twice, produces exactly one `User` row — verified via a direct duplicate `curl` call, not just the UI (FR2; Success Metric 3).
- [ ] `users` table contains only bcrypt hashes — no plaintext password anywhere (Success Metric 2).
- [ ] An expired verification code is rejected based on the database timestamp, demonstrated independent of the browser (FR4; Success Metric 4).
- [ ] The resend endpoint enforces its cooldown when called directly, not only via the UI button (FR5; Success Metric 5).
- [ ] A used or expired password-reset token is rejected on a second attempt (FR11; Success Metric 6).
- [ ] Each of the four rate-limited endpoints returns HTTP 429 after 5 requests in 15 minutes, verified by direct repeated calls (FR12; Success Metric 7).
- [ ] A direct, cookie-less (or expired-cookie) request to the dashboard route returns a redirect, not dashboard content, tested without a browser (FR8; Success Metric 8).
- [ ] Sign-out followed by replaying the old session cookie fails to reach the dashboard (FR9; Success Metric 9).
- [ ] Every form field passes a keyboard-only and screen-reader label/focus check across all five screens (FR13; Success Metric 10).
- [ ] `.env` is not committed; `.env.example` exists with placeholders only.
- [ ] Nothing exists in the repository outside the five screens, the placeholder dashboard, and their supporting API routes (Section 3, rule 12).

If any box cannot honestly be checked, the slice is not done — say so plainly rather than reporting completion.

---

## 7. What The Agent Does When Unsure

- **Never invent a feature or expand scope to fill a gap.** If `PRD.md` doesn't specify something, prefer the smallest change that satisfies the explicit requirement in front of you, and say what you assumed.
- **Never guess your way through a locked choice.** If you think the stack, a library, or a locked value (cookie name, expiry, cost factor) should be different, stop and ask — do not quietly substitute your own judgment and keep going.
- **Never patch around a failing rule with more code.** If a Section 3 rule seems hard to satisfy cleanly, that is a signal to slow down and re-read the requirement, not a signal to bolt on a workaround, a special case, or a second code path. No spaghetti — one clear implementation per responsibility, per Section 4.
- **When two instructions conflict**, prefer `PRD.md` for what a feature should do and this file for how to build it, exactly as stated in the header. If the conflict isn't resolved by that rule, stop and flag it instead of picking silently.
- **When you're genuinely blocked**, leave a clearly marked note (a TODO referencing the PRD section or Open Question it relates to) instead of shipping a guess as if it were a decision.