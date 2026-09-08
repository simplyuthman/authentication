**Product Requirements Document**

**Authentication Slice**

*Standalone auth slice — Next.js · TypeScript · Prisma · PostgreSQL*

# 1\. Product Summary

This slice is a complete, standalone authentication system: create account, sign in, forgot password, reset password, and email verification, ending at a placeholder dashboard. It is not part of a larger application and ships no features beyond authentication itself.

The build is locked to Next.js, TypeScript, Prisma, and PostgreSQL. Every screen and behavior maps to one of eleven mandatory engineering requirements covering password hashing, validation, rate limiting, session handling, verification-code and token expiry, database-level constraints, idempotency, protected routing, and accessible form markup.

The dashboard this slice ends at is intentionally minimal: the signed-in user's name and a sign-out button, nothing else. Its purpose is to prove the session is real, not to demonstrate product functionality.

# 2\. Problem Statement

A production application needs an authentication layer that is correct under adversarial conditions, not just under normal use: it must survive duplicate submissions, direct API calls that bypass the UI, brute-force attempts against login and verification endpoints, and users who navigate directly to protected URLs without a valid session.

Most auth implementations fail quietly in ways that only surface under exactly these conditions: validation that exists only in the browser, expiry that exists only as a UI countdown, rate limits that were added to one endpoint and forgotten on another, and "protected" routes that are hidden client-side but still return data if called directly. This PRD defines a slice narrow enough that every one of those failure modes can be built correctly, verified directly against the database and the API, and explained line by line.

# 3\. Goals and Non-Goals

## Goals

* A new user can create an account, verify their email via a code, and land on the dashboard.

* A returning verified user can sign in and reach the dashboard.

* A user who forgets their password can request a reset, follow the emailed link, set a new password, and sign in with it.

* A signed-out user who requests the dashboard URL directly is redirected to sign-in, enforced server-side.

* Sign-out fully invalidates the session server-side, not just client-side.

* Every one of the eleven mandatory engineering requirements is implemented and independently verifiable (via direct DB inspection or direct API calls).

## Non-Goals

* No landing page or marketing page of any kind.

* No dashboard functionality beyond displaying the user's name and a sign-out button.

* No profile editing, account settings, social sign-in, or two-factor authentication.

* No production email-delivery integration, hosting decision, or deployment pipeline — explicitly out of scope (see Open Questions).

* No multi-role or admin functionality; this slice has exactly one kind of user.

# 4\. User Personas

## Primary persona: The Applicant

A single end user with no special role, identified solely by email address. They arrive with no account, create one, verify it, and reach the dashboard. On a later visit they sign in directly. Occasionally they forget their password and need to recover access without contacting anyone.

## Secondary persona: The Reviewer

A technically literate evaluator who does not use the UI as intended. They call endpoints directly with curl, submit the same signup twice in rapid succession, try to reach the dashboard URL without a session, wait out or attempt to bypass rate limits, and inspect the database directly to confirm passwords and codes are stored correctly. The system's correctness is judged primarily through this persona's behavior, not the Applicant's.

# 5\. Functional Requirements

Each requirement below is written as trigger → action → outcome so it can be tested directly.

**FR1 — Create account**

* Trigger: User submits the create-account form with an email and a password meeting the password policy.

* Action: Server validates input against the shared schema, hashes the password, creates a User row with emailVerifiedAt \= null, generates a verification code, stores its hash with a 15-minute expiry, and sends (or logs, in development) the verification email.

* Outcome: User is redirected to the email-verification screen. No session cookie is issued at this step (see Open Questions — whether a pre-verification session should exist is unresolved).

**FR2 — Duplicate signup is idempotent**

* Trigger: The same signup request is submitted twice in quick succession (double-click, network retry).

* Action: The database's unique constraint on email rejects the second insert; the handler catches that conflict and returns the same success-shaped response rather than an error or a second row.

* Outcome: Exactly one User row exists for that email, regardless of how many times signup was submitted.

**FR3 — Email verification**

* Trigger: User enters a 6-digit code on the verification screen.

* Action: Server finds the latest unconsumed, unexpired VerificationCode for the user, compares its hash to the submitted code, and on match sets emailVerifiedAt and consumedAt, then creates a Session and sets the session cookie.

* Outcome: User is redirected to the dashboard and is now signed in.

**FR4 — Expired verification code is rejected**

* Trigger: User submits a code after its expiresAt timestamp has passed.

* Action: Server rejects the attempt based on the database timestamp, independent of anything the browser displayed.

* Outcome: User sees an “expired” message and must request a new code via resend.

**FR5 — Resend verification code**

* Trigger: User clicks resend on the verification screen.

* Action: Server checks lastSentAt against the 60-second cooldown; if inside the window, the request is rejected with a remaining-seconds value; if outside, a new code is generated, the previous unconsumed code is invalidated, and lastSentAt is updated.

* Outcome: A new code is sent and the cooldown restarts, enforced regardless of client-side button state.

**FR6 — Sign in**

* Trigger: A returning, verified user submits email and password.

* Action: Server looks up the user, compares the password hash, rejects unverified accounts with an instruction to verify first, and on success creates a Session and sets the cookie.

* Outcome: User reaches the dashboard.

**FR7 — Sign-in failure gives no account signal**

* Trigger: Sign-in is attempted with a wrong password, or with an email that has no account.

* Action: Server returns the identical generic “invalid credentials” response in both cases.

* Outcome: It is not possible to determine from the response whether a given email is registered.

**FR8 — Dashboard is unreachable without a session**

* Trigger: A signed-out user (or one with an invalid/expired session cookie) navigates directly to the dashboard URL.

* Action: The server-side route check finds no valid Session row for the presented cookie.

* Outcome: User is redirected to sign-in; no dashboard content is ever sent to the client, not merely hidden after render.

**FR9 — Sign out ends the session**

* Trigger: User clicks sign out on the dashboard.

* Action: Server deletes the corresponding Session row and clears the cookie.

* Outcome: The old cookie value, if replayed, no longer grants access, because the session no longer exists server-side.

**FR10 — Forgot password request**

* Trigger: User submits an email on the forgot-password form.

* Action: Server always returns the same generic confirmation regardless of whether the email exists; if it does, a reset token is generated, its hash stored with a 60-minute expiry, and the reset link emailed.

* Outcome: No response difference reveals whether an account exists for that email.

**FR11 — Reset password**

* Trigger: User follows the emailed link and submits a new password.

* Action: Server hashes the incoming token, finds the matching unused PasswordResetToken, checks it has not expired, and atomically updates passwordHash and sets usedAt.

* Outcome: User can sign in with the new password; the same reset link cannot be used again.

**FR12 — Rate limiting engages under repeated requests**

* Trigger: More than 5 requests to signin, signup, password-reset-request, or verification-resend occur from the same IP+email key within a 15-minute window.

* Action: Server rejects the 6th and subsequent requests within that window.

* Outcome: The endpoint returns HTTP 429 with a retry indication; the limit holds regardless of which client or automation made the requests.

**FR13 — Forms are accessible**

* Trigger: Any of the five auth screens is rendered.

* Action: Every input renders with a \<label\> programmatically bound via htmlFor/id, and every interactive element has a visible focus-visible style.

* Outcome: The full flow is completable by keyboard-only and screen-reader users.

# 6\. Technical Requirements

Each of the eleven mandatory engineering requirements is mapped below to a specific technical decision.

**1\. Password hashing with an adaptive algorithm**

***\[ASSUMPTION ADDED\]*** bcrypt (via the bcryptjs package) is chosen over argon2, with a cost factor of 12, implemented in lib/auth/password.ts. bcrypt is used because it has mature, dependency-light support in Node/Next.js serverless environments; argon2 native bindings are more fragile to deploy in serverless contexts.

**2\. Server-side validation as a schema, mirrored client-side**

***\[ASSUMPTION ADDED\]*** zod is used for schema definitions in lib/validation/\*.ts, imported directly by API route handlers as the source of truth, and reused on the client via @hookform/resolvers/zod with React Hook Form for inline UX feedback. Client validation is never trusted; every route re-validates independently.

**3\. Rate limiting on signin, signup, reset request, and resend**

A RateLimitAttempt table (see Data Model) records one row per request attempt, keyed by IP+email+route. A shared lib/rateLimit.ts helper runs a sliding-window count query before each of the four routes executes its main logic and rejects with 429 once the threshold is exceeded.

***\[ASSUMPTION ADDED\]*** Rate-limit state is stored in Postgres rather than Redis or an in-memory store, since the stack is locked to Postgres and no caching layer was specified. This trades some latency for zero additional infrastructure.

**4\. Session management with a correctly configured cookie**

Sessions are opaque, randomly generated IDs stored in the Session table (database-backed, not JWT), set in an httpOnly, Secure, SameSite=Lax cookie.

***\[ASSUMPTION ADDED\]*** The cookie name is set to session\_id and SameSite is set to Lax (not Strict), so a reset-password link opened from an email client still carries the cookie context correctly. These exact values were not specified in the source brief.

**5\. Verification codes expire in the database, not just the UI**

VerificationCode.expiresAt is checked server-side on every verification attempt; any UI countdown is cosmetic only and has no bearing on whether the server accepts the code.

**6\. Resend cooldown enforced server-side**

VerificationCode.lastSentAt is compared server-side against the 60-second threshold before a new code is issued; the client-side disabled button state is a convenience, not the control.

**7\. Password reset tokens are single-use and time-limited**

PasswordResetToken.usedAt (set atomically on redemption) enforces single use; expiresAt enforces the 60-minute window. Both checks occur inside the same transaction that updates the password, closing the race between a valid check and the update.

**8\. Unique constraint on email at the database level**

User.email is declared @unique in the Prisma schema, enforced by a Postgres unique index — not an application-level “check then insert.”

**9\. Idempotent signup endpoint**

The signup handler relies on Requirement 8's unique constraint: it attempts the insert, catches the resulting Postgres unique-violation error, and returns the same success response instead of a 500 or a duplicate account.

**10\. Protected route handling enforced server-side**

A shared requireSession() check runs in Next.js middleware (or at the top of the dashboard route/server component) and redirects to sign-in before any protected content is rendered or returned — never a client-side-only redirect that briefly exposes content.

**11\. Accessible input groups**

A single reusable form-field component pairs every \<label\> with its input via htmlFor/id and applies a consistent, visible :focus-visible outline style, used across all five screens so accessibility is structural, not per-screen effort.

# 7\. Business Model

This slice is a technical assessment artifact with no real users and no monetization, so there is no business model to define here. In a production version of this feature, this section would normally cover how authentication supports the business — for example, whether accounts are free with paid tiers gated behind them, what the cost of email delivery and infrastructure is per active user, and what conversion or activation metrics (e.g. percentage of signups that complete verification) the team would track as a leading indicator of product health.

# 8\. Risks

## Security risks

* If rate limiting silently fails on one of the four endpoints (most likely resend, since it is easy to forget), that endpoint becomes an unmetered vector for cost abuse (email sending) or brute-force guessing.

* If verification-code or reset-token expiry is only checked at issue time and not re-checked at redemption time, a long-lived stale code or token could be accepted after it should have died.

* If the unique email constraint is enforced only in application code and the database migration is ever skipped or rolled back, concurrent signups could create duplicate accounts for the same email.

* If session cookies are not marked httpOnly and Secure, they become readable by client-side scripts or transmittable over plain HTTP, undermining the session model regardless of how sessions are stored server-side.

* If sign-in or reset-request error messages differ between “wrong password” and “no such account,” the endpoints become an account-enumeration oracle.

## Delivery risks

* The password-reset flow spans three surfaces (request form, emailed link, reset form) and is the most likely piece to be left partially stubbed if time runs short, since it depends on functioning email delivery even in a logged/dev form.

* Rate limiting is easy to implement on one endpoint and forget on the remaining three; without a shared helper enforced consistently, coverage will be uneven.

* Client-side-only validation is the fastest path to a working demo and the easiest requirement to under-deliver, since the UI will appear correct while the server silently trusts unvalidated input.

* Protected-route enforcement implemented as a client-side redirect (rather than a server-side check) will look correct in the browser while still leaking data to a direct request, and is easy to miss without deliberately testing via curl.

# 9\. Prisma Data Model

Every field that encodes a decision is commented inline. Table and column names are illustrative but intended to be used as-is.

generator client {  
  provider \= "prisma-client-js"  
}  
   
datasource db {  
  provider \= "postgresql"  
  url      \= env("DATABASE\_URL")  
}  
   
model User {  
  id               String    @id @default(cuid())  
  email            String    @unique // Requirement 8: DB-level uniqueness, not app-level check-then-insert  
  passwordHash     String    // bcrypt hash only; plaintext password is never stored or logged  
  emailVerifiedAt  DateTime? // null \= unverified; a timestamp (not a boolean) also records \*when\* verification happened  
  createdAt        DateTime  @default(now())  
  updatedAt        DateTime  @updatedAt  
   
  sessions             Session\[\]  
  verificationCodes    VerificationCode\[\]  
  passwordResetTokens  PasswordResetToken\[\]  
   
  @@index(\[email\]) // explicit index alongside @unique for clarity of intent on the hot lookup path  
}  
   
model Session {  
  id         String   @id @default(cuid())  
  userId     String  
  user       User     @relation(fields: \[userId\], references: \[id\], onDelete: Cascade)  
  expiresAt  DateTime // fixed 7-day lifetime set at creation; not extended on use (see Open Questions)  
  createdAt  DateTime @default(now())  
   
  @@index(\[userId\])    // supports "revoke all sessions for user" and per-user lookups  
  @@index(\[expiresAt\]) // supports periodic cleanup of expired sessions  
}  
   
model VerificationCode {  
  id          String    @id @default(cuid())  
  userId      String  
  user        User      @relation(fields: \[userId\], references: \[id\], onDelete: Cascade)  
  codeHash    String    // hash of the 6-digit code, not the raw value; a DB read alone cannot be used to verify  
  expiresAt   DateTime  // Requirement 5: expiry lives in the DB, independent of any UI countdown  
  consumedAt  DateTime? // null \= unused; set on success so a code cannot be replayed after verification  
  lastSentAt  DateTime  @default(now()) // drives the server-side resend cooldown (Requirement 6\)  
  attempts    Int       @default(0) // failed guesses against this code; feeds brute-force detection  
   
  @@index(\[userId\])  
  @@index(\[expiresAt\])  
}  
   
model PasswordResetToken {  
  id         String    @id @default(cuid())  
  userId     String  
  user       User      @relation(fields: \[userId\], references: \[id\], onDelete: Cascade)  
  tokenHash  String    @unique // hashed, not raw; a leaked DB row alone cannot be replayed as a live reset link  
  expiresAt  DateTime  // Requirement 7: time-limited  
  usedAt     DateTime? // null \= unused; set atomically on redemption to enforce single-use (Requirement 7\)  
   
  @@index(\[userId\])  
  @@index(\[expiresAt\])  
}  
   
model RateLimitAttempt {  
  id         String   @id @default(cuid())  
  key        String   // composite "route:ip:email" key, matching Requirement 3’s IP+email keying  
  route      String   // signin | signup | password-reset-request | verification-resend  
  createdAt  DateTime @default(now())  
   
  @@index(\[key, route, createdAt\]) // supports the sliding-window COUNT query behind the rate-limit check  
}

# 10\. Success Metrics

Because this is a technical assessment slice rather than a live product, success is defined as a set of binary, verifiable pass criteria rather than business metrics such as signups or conversion.

1. All five screens (create account, sign in, forgot password, reset password, email verification) are functional and reachable through the intended flow.

2. Password hashes in the database are bcrypt hashes; no plaintext password exists anywhere in the database, logs, or network responses.

3. A direct curl POST to the signup endpoint, sent twice in immediate succession, results in exactly one User row.

4. Verification codes rejected as expired can be shown to fail purely on the database expiresAt comparison, independent of the browser.

5. The resend endpoint enforces its 60-second cooldown when called directly, not only when the UI button is used.

6. The reset-password endpoint rejects a second use of the same token after a successful reset.

7. Each of the four rate-limited endpoints returns HTTP 429 after 5 requests within 15 minutes, verified by direct repeated calls.

8. A direct request to the dashboard route with no session cookie (or an expired one) returns a redirect, not dashboard content, when tested without a browser.

9. Sign-out followed by replay of the old session cookie fails to reach the dashboard.

10. Every form field passes a keyboard-only and screen-reader label/focus check across all five screens.

# 11\. Assumptions

Confirmed defaults carried in from the brief:

* Single user role; email is the only identity field, no username.

* Unverified users get a pending state on signup; protected routes stay locked until verification completes (the question of whether a session exists before verification remains open — see Open Questions).

* Password policy: minimum 8 characters, no forced complexity rules, enforced server-side via schema.

* Verification code: 6-digit numeric, 15-minute expiry.

* Resend cooldown: 60 seconds, server-enforced.

* Password reset token: 60-minute expiry, single use.

* Rate limiting: 5 attempts per 15-minute window, keyed by IP \+ email together.

* Sessions are database-backed, not JWT; fixed 7-day lifetime, no silent extension.

* Email delivery is a pluggable interface, console-logged in development.

* Sign-in and reset-request errors are generic to prevent account enumeration; signup may state an email is already registered.

* Idempotent signup relies on the DB unique constraint plus conflict handling, not a separate idempotency key.

* Local development database is Docker-based PostgreSQL; hosting and deployment are out of scope.

* Success metrics are technical pass criteria, not business metrics.

New assumptions added while producing this PRD (each also flagged inline where first used):

* bcrypt (bcryptjs), cost factor 12, over argon2 — for serverless deployment simplicity.

* zod for schema validation, reused client-side via @hookform/resolvers/zod with React Hook Form.

* Rate-limit attempts stored in a Postgres table rather than Redis or in-memory, since no cache layer is in the locked stack.

* Session cookie name session\_id, SameSite=Lax (not Strict), so reset links opened from email clients still carry cookie context correctly.

* Verification codes and reset tokens are stored as hashes (codeHash / tokenHash), not raw values, so a database read alone cannot be replayed.

# 12\. Phased Roadmap

This slice ships as a single deliverable, not a multi-release product, so “phases” here describe build order rather than sequential launches.

11. Phase 1 — Data model and infrastructure: Prisma schema (User, Session, VerificationCode, PasswordResetToken, RateLimitAttempt), local Postgres via Docker, migrations, shared zod validation schemas.

12. Phase 2 — Core account creation and session: signup endpoint with hashing and the unique-constraint-based idempotency handling, session creation/cookie mechanics, sign-out.

13. Phase 3 — Email verification: code generation and hashed storage, verification endpoint, resend endpoint with server-side cooldown, expiry enforcement.

14. Phase 4 — Sign-in and protected routing: sign-in endpoint with generic error messaging, server-side session check for the dashboard route, placeholder dashboard UI.

15. Phase 5 — Password reset: request endpoint with the enumeration-safe generic response, token generation/hashing, reset endpoint with atomic single-use \+ expiry check.

16. Phase 6 — Rate limiting: shared rate-limit helper applied to all four required endpoints (signin, signup, reset-request, resend), verified by direct repeated calls.

17. Phase 7 — Accessibility and hardening pass: labeled input-group component and focus states applied consistently across all five screens; full run-through of the Success Metrics checklist.

# 13\. Open Questions

These are explicitly unresolved and are not silently defaulted anywhere in this document:

* Whether an unverified user should receive any session state at all before completing verification, or whether no session should exist until verification succeeds.

* Whether the session lifetime should be fixed (as currently assumed, 7 days) or sliding, extending on activity.

* Which hosted database provider (Supabase, Neon, or self-managed Postgres) will be used beyond local development.

* What the deployment target is.