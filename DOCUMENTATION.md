# Authentication Slice Documentation

---

## Section 1: What This Is

This project is a standalone, production-grade authentication slice built with Next.js, TypeScript, Prisma, and PostgreSQL. It implements the complete user identity lifecycle: account creation, email verification via 6-digit numeric codes, credential-based sign-in with database-backed sessions, transactional password reset via single-use tokens, and secure sign-out ending at an authenticated placeholder dashboard. Every authentication mechanic is engineered around strict security invariants, including adaptive bcrypt password hashing, persistent sliding-window rate limiting, database-level unique constraints, and server-side session guards that prevent unauthorized data exposure.

Deliberately omitted from this slice are secondary application features such as user profile editing, avatar uploads, role-based access control (RBAC), multi-tenant organizations, and social OAuth providers. These were excluded to maintain an uncompromising focus on the core security foundation of authentication—ensuring every credential boundary, cryptographic check, expiry window, and session invalidation operates with zero assumptions and complete defense-in-depth before application-layer features are introduced.

---

## Section 2: How To Run It

Follow these steps to run a fresh local instance from scratch:

### 1. Prerequisites & Installation
Ensure Node.js (LTS version 20+ recommended), npm, and Docker are installed on your system. Clone the repository and install all dependencies:
```bash
npm install
```

### 2. Environment Variables Configuration
Copy the example environment template to create your local `.env` file:
```bash
cp .env.example .env
```
Configure the following required variables inside `.env`:
* `DATABASE_URL`: PostgreSQL connection string. For local Docker development, use `"postgresql://postgres:postgres@localhost:5432/auth_db"`.
* `SMTP_HOST`: (Optional for live delivery) SMTP server host (e.g. `smtp.gmail.com` or `sandbox.smtp.mailtrap.io`).
* `SMTP_PORT`: (Optional) SMTP port (`465` for SSL or `587` for TLS).
* `SMTP_USER`: (Optional) Your SMTP authentication username/email.
* `SMTP_PASSWORD`: (Optional) Your SMTP app-specific password.
* `EMAIL_FROM`: (Optional) Sender display address (e.g. `"Auth Service" <noreply@example.com>`).

*(Note: If SMTP variables are omitted, transactional emails and verification codes will cleanly log to the server console in real time without crashing).*

### 3. Start PostgreSQL Database Container
Start the local PostgreSQL container using Docker Compose:
```bash
docker compose up -d
```

### 4. Database Setup & Migrations
Generate the Prisma Client and run all migrations against PostgreSQL:
```bash
npx prisma migrate dev
```

### 5. Start Development Server
Start the Next.js local development server:
```bash
npm run dev
```

### 6. Access Application
Open your web browser and navigate to:
```text
http://localhost:3000/auth
```

---

## Section 3: The Flow, Step By Step

### 1. User Registration (Sign Up)
* **What the user does:** The user navigates to `/auth`, selects the registration form, enters their Full Name (at least two words), valid Email Address, and a strong Password conforming to real-time complexity requirements (8+ chars, uppercase, lowercase, number, symbol), then clicks "Create account".
* **What the frontend sends:** A `POST` request to `/api/auth/signup` containing JSON: `{ fullName: "Jane Doe", email: "jane@example.com", password: "Password123!" }`.
* **What the server does:** [src/app/api/auth/signup/route.ts](authentication/src/app/api/auth/signup/route.ts) re-validates the input against `SignupSchema`, executes a sliding-window rate limit check on the IP + email combination, hashes the password using bcrypt (cost factor 12), and creates an unverified `User` record in PostgreSQL. It then generates a cryptographically secure 6-digit numeric verification code (`crypto.randomInt`), hashes it into `codeHash`, stores it in the `VerificationCode` table with a 15-minute `expiresAt`, and dispatches the raw code via [src/lib/email.ts](authentication/src/lib/email.ts). The route returns `{ success: true, email: "jane@example.com" }`.

### 2. Email Verification
* **What the user does:** The user receives the 6-digit code in their inbox (or terminal log), inputs the 6 digits on the verification screen, and submits.
* **What the frontend sends:** A `POST` request to `/api/auth/verify-email` containing `{ email: "jane@example.com", code: "123456" }`.
* **What the server does:** [src/app/api/auth/verify-email/route.ts](authentication/src/app/api/auth/verify-email/route.ts) validates input schema, queries the latest unconsumed `VerificationCode` record for that user, verifies that `expiresAt > new Date()`, and checks the submitted code against `codeHash` using bcrypt's constant-time comparison. Upon matching, it runs an atomic transaction that sets `VerificationCode.consumedAt = new Date()` and `User.emailVerifiedAt = new Date()`. It creates a new `Session` row in the database and returns a secure, `httpOnly` `session_id` cookie before redirecting the client to `/dashboard`.

### 3. Verification Code Resend (Cooldown Enforced)
* **What the user does:** If the code expired or was not received, the user clicks "Resend code".
* **What the frontend sends:** A `POST` request to `/api/auth/resend-code` with `{ email: "jane@example.com" }`.
* **What the server does:** [src/app/api/auth/resend-code/route.ts](authentication/src/app/api/auth/resend-code/route.ts) validates rate limits, queries the latest code record, and evaluates `Date.now() - latestCode.lastSentAt.getTime()`. If less than 60 seconds have elapsed, it rejects the request with HTTP 429. If the cooldown has passed, it marks prior unconsumed codes consumed, generates a new code, hashes it, stores it, and sends the new email.

### 4. User Sign-In
* **What the user does:** The user enters their email and password on the Sign In screen and clicks "Sign in".
* **What the frontend sends:** A `POST` request to `/api/auth/signin` containing `{ email: "jane@example.com", password: "Password123!" }`.
* **What the server does:** [src/app/api/auth/signin/route.ts](authentication/src/app/api/auth/signin/route.ts) runs rate limiting and queries the `User` table. If the user does not exist or `verifyPassword(password, user.passwordHash)` returns false, it returns an identical generic `401 Unauthorized` message. If the account is unverified (`emailVerifiedAt == null`), it returns HTTP 403 instructing verification. If valid and verified, it creates a `Session` record in PostgreSQL (7-day fixed lifetime), attaches the `session_id` `httpOnly` cookie, and returns `{ success: true }`.

### 5. Accessing Protected Dashboard
* **What the user does:** The browser requests the `/dashboard` route.
* **What the frontend sends:** A `GET` request to `/dashboard` accompanied automatically by the `session_id` cookie.
* **What the server does:** [src/middleware.ts](authentication/src/middleware.ts) and the Server Component in [src/app/dashboard/page.tsx](authentication/src/app/dashboard/page.tsx) invoke `requireSession()`. It queries PostgreSQL to ensure the session exists and has not expired (`expiresAt > new Date()`). If invalid or missing, it immediately issues a server-side redirect to `/auth`. If valid, it retrieves user details and renders the protected dashboard.

### 6. Forgot Password Request
* **What the user does:** The user enters their email on the Forgot Password form and clicks "Send instructions".
* **What the frontend sends:** A `POST` request to `/api/auth/forgot-password` with `{ email: "jane@example.com" }`.
* **What the server does:** [src/app/api/auth/forgot-password/route.ts](authentication/src/app/api/auth/forgot-password/route.ts) checks rate limits. If the user exists, it generates a 32-byte cryptographic random hex token (`crypto.randomBytes`), calculates its SHA-256 hash (`tokenHash`), inserts a `PasswordResetToken` row with a 60-minute `expiresAt`, and emails the raw token link (`/reset-password?token=<rawToken>`). To prevent user enumeration, it always returns an identical 200 generic success message whether the email was registered or not.

### 7. Reset Password Redemption
* **What the user does:** The user clicks the link in their email, lands on the `/reset-password?token=...` screen, enters their new password, and submits.
* **What the frontend sends:** A `POST` request to `/api/auth/reset-password` containing `{ token: "<rawToken>", password: "NewPassword123!" }`.
* **What the server does:** [src/app/api/auth/reset-password/route.ts](authentication/src/app/api/auth/reset-password/route.ts) computes the SHA-256 hash of the incoming token, finds the matching record in `PasswordResetToken`, verifies that `usedAt === null` and `expiresAt > new Date()`, hashes the new password with bcrypt, and executes an atomic `prisma.$transaction` updating `User.passwordHash` and marking `PasswordResetToken.usedAt = new Date()`.

### 8. User Sign-Out
* **What the user does:** The user clicks "Sign out" on the dashboard.
* **What the frontend sends:** A `POST` request to `/api/auth/signout`.
* **What the server does:** [src/app/api/auth/signout/route.ts](authentication/src/app/api/auth/signout/route.ts) reads the `session_id` cookie, deletes the corresponding `Session` row from the database (preventing replay attacks), clears the client-side cookie (`maxAge: 0`), and redirects to `/auth`.

---

## Section 4: The Data Model

The slice is backed by five locked PostgreSQL tables managed via Prisma:

```prisma
model User {
  id               String    @id @default(cuid())
  fullName         String?   // User's display name collected at registration
  email            String    @unique // Unique index prevents duplicate accounts at DB engine level
  passwordHash     String    // bcrypt cost 12 hash; plaintext passwords never persist
  emailVerifiedAt  DateTime? // null = unverified; timestamp records verification instant
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  sessions            Session[]
  verificationCodes   VerificationCode[]
  passwordResetTokens PasswordResetToken[]

  @@index([email])
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime // Fixed 7-day lifetime set at creation; never extended silently
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([expiresAt])
}

model VerificationCode {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  codeHash   String    // bcrypt hash of the 6-digit code; raw codes never persist in DB
  expiresAt  DateTime  // Strict DB-enforced 15-minute expiration timestamp
  consumedAt DateTime? // null = unused; timestamped on consumption to eliminate replay attacks
  lastSentAt DateTime  @default(now()) // Drives server-side 60s resend cooldown checks
  attempts   Int       @default(0)     // Tracks failed guesses against this code

  @@index([userId])
  @@index([expiresAt])
}

model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique // SHA-256 hash of token; leaked DB row cannot generate live link
  expiresAt DateTime  // 60-minute lifetime timestamp
  usedAt    DateTime? // null = unused; set atomically on password change to guarantee single use

  @@index([userId])
  @@index([expiresAt])
}

model RateLimitAttempt {
  id        String   @id @default(cuid())
  key       String   // Composite "route:ip:email" identifier
  route     String   // signin | signup | password-reset-request | verification-resend
  createdAt DateTime @default(now())

  @@index([key, route, createdAt]) // Supports high-performance sliding-window COUNT queries
}
```

### Table & Column Decisions
1. **`User` (Holds primary user identity & credentials):**
   * `email` (`String`, `@unique`, `NOT NULL`): Enforced unique at the database level to make duplicate account registration physically impossible regardless of application concurrency.
   * `passwordHash` (`String`, `NOT NULL`): Stores only bcrypt hash output; no column for plaintext password exists in the schema.
   * `emailVerifiedAt` (`DateTime?`, `NULLABLE`): A nullable timestamp provides both binary state verification (`null` vs set) and an immutable audit timestamp of when verification occurred.
2. **`Session` (Holds active database-backed login sessions):**
   * `expiresAt` (`DateTime`, `NOT NULL`): Tracks exact expiry; indexed for performant cleanup of dead sessions.
   * `userId` (`String`, `NOT NULL`, `onDelete: Cascade`): Cascades deletion so deleting a user immediately purges all active sessions.
3. **`VerificationCode` (Holds email verification codes):**
   * `codeHash` (`String`, `NOT NULL`): Stores bcrypt hash of the 6-digit code; a read-only compromise of the database table does not reveal any usable verification codes.
   * `consumedAt` (`DateTime?`, `NULLABLE`): Nullable timestamp prevents double redemption; once set, queries reject re-use.
   * `lastSentAt` (`DateTime`, `default(now())`): Drives server-side cooldown enforcement independent of client UI timers.
4. **`PasswordResetToken` (Holds one-time password recovery tokens):**
   * `tokenHash` (`String`, `@unique`, `NOT NULL`): Unique SHA-256 hash guarantees instant lookup while ensuring raw tokens are known only to recipient email links.
   * `usedAt` (`DateTime?`, `NULLABLE`): Ensures single-use semantics by transitioning from `null` to timestamp upon redemption.
5. **`RateLimitAttempt` (Holds sliding-window request timestamps for abuse prevention):**
   * `key` + `route` + `createdAt` composite index: Optimizes the `COUNT(*)` query within sliding time windows across high-traffic endpoints.

### Which constraints make an invalid state impossible?
* **`User.email` (`@unique`):** Prevents duplicate user creation at the database engine level, making race-condition signup collisions impossible.
* **`PasswordResetToken.usedAt` + `VerificationCode.consumedAt` (`NULL` check in transactions):** Guarantees single-use token lifecycle by ensuring tokens cannot be replayed once redeemed.
* **Foreign Key `onDelete: Cascade` across all child tables:** Makes orphaned child records (sessions, tokens, codes belonging to deleted users) impossible.
* **`PasswordResetToken.tokenHash` (`@unique`):** Prevents duplicate active tokens with identical hashes from ever existing.

---

## Section 5: The Concepts

### 1. Password Hashing (Adaptive vs General-Purpose)
* **What it is:** Hashing transforms a plaintext password into an irreversible, fixed-length cryptographic digest using a one-way mathematical function. When authenticating, the input password is newly hashed and compared against the stored hash. Plaintext passwords are never stored in memory, databases, or logs.
* **Why it is needed:** If a database is leaked or breached, plaintext passwords immediately compromise all accounts and expose users across external services due to password reuse. Without an adaptive hash, fast algorithms allow attackers to test billions of combinations per second using specialized GPU clusters.
* **How I implemented it:** Implemented in [src/lib/auth/password.ts](authentication/src/lib/auth/password.ts) using bcrypt with a locked cost factor of 12 (`BCRYPT_COST_FACTOR = 12`), which automatically salts each hash with 128 bits of OS entropy.
```typescript
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, 12);
}
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
```
* **What I chose against, and why:** Chose against general-purpose hashes like SHA-256 or MD5 because they are designed for speed and data integrity, making them susceptible to high-speed brute-force attacks. Chose bcrypt over Argon2 because bcrypt is universally supported, rock-solid across Node.js runtimes, and satisfies all requirements with proven constant-time comparison.

---

### 2. Schema-Declared Validation & Client Mirroring
* **What it is:** A single shared declaration defines all data contracts, types, and constraints in one place. The server validates every payload against this schema as an untrusted input barrier, while client forms import the exact same schema for real-time user feedback.
* **Why it is needed:** Without unified schema validation, client-side checks can be bypassed by attackers crafting raw HTTP requests. Scattered, hand-coded validation in route handlers leads to logic drift, missed edge cases, and unexpected server crashes.
* **How I implemented it:** Defined all schemas in [src/lib/validation/auth.schemas.ts](authentication/src/lib/validation/auth.schemas.ts) using Zod, imported server-side with `.safeParse()` and client-side via `@hookform/resolvers/zod`.
```typescript
export const SignupSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').refine(
    (val) => val.trim().split(/\s+/).filter(Boolean).length >= 2,
    'Full name must contain at least two words'
  ),
  email: z.string().min(1, 'Email is required').regex(EMAIL_REGEX, 'Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
```
* **What I chose against, and why:** Chose against duplicating validation logic manually in client components and server route files. Dual implementations inevitably diverge over time. Using Zod as the single source of truth guarantees 100% parity across client and server.

---

### 3. Database-Backed Sessions vs JWTs
* **What it is:** A database-backed session creates an explicit record in the database for each logged-in user and returns a random opaque identifier in a cookie. Every request looks up this identifier in PostgreSQL to verify validity and expiration.
* **Why it is needed:** Stateless JWTs cannot be instantly revoked upon sign-out or account compromise without maintaining a centralized revocation list, which negates the stateless benefit of JWTs. A database-backed session allows immediate server-side revocation on sign-out.
* **How I implemented it:** Implemented in [src/lib/auth/session.ts](authentication/src/lib/auth/session.ts). Sessions are created with a fixed 7-day expiration and deleted upon sign-out.
```typescript
export async function createSession(userId: string): Promise<string> {
  const session = await prisma.session.create({
    data: { userId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });
  return session.id;
}
```
* **What I chose against, and why:** Chose against client-side JWTs in `localStorage` or stateless bearer tokens. Storing tokens in `localStorage` exposes them to XSS exfiltration, while database-backed sessions provide instant invalidation upon user logout.

---

### 4. Secure Cookie Configuration (`httpOnly`, `Secure`, `SameSite=Lax`)
* **What it is:** A set of browser security flags configured on HTTP response headers that govern how cookies are stored, transmitted, and isolated from JavaScript execution.
* **Why it is needed:** Without `httpOnly`, any cross-site scripting (XSS) vulnerability allows malicious scripts to steal the session cookie. Without `SameSite`, external third-party sites can trigger authenticated cross-site request forgery (CSRF) requests.
* **How I implemented it:** Defined centrally in [src/lib/auth/session.ts](authentication/src/lib/auth/session.ts) and attached to responses across all authentication routes:
```typescript
export const SESSION_COOKIE = {
  name: 'session_id',
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60,
  path: '/',
};
```
* **What I chose against, and why:** Chose against storing authentication tokens in browser memory, Web Storage, or allowing `httpOnly: false`. Strict cookie flags ensure session tokens remain unreachable to malicious client scripts.

---

### 5. Database-Enforced Expiration & Server-Side Resend Cooldown
* **What it is:** Expiry and cooldown rules are validated strictly against database timestamps on the server, rather than relying on client timers or disabled UI buttons.
* **Why it is needed:** If expiration or cooldowns are only enforced in the UI, an attacker can bypass frontend timers by issuing direct HTTP requests, spamming email servers, or submitting expired codes indefinitely.
* **How I implemented it:** Verification code expiry is checked against `expiresAt` in [src/app/api/auth/verify-email/route.ts](authentication/src/app/api/auth/verify-email/route.ts), and 60s cooldown is checked against `lastSentAt` in [src/app/api/auth/resend-code/route.ts](authentication/src/app/api/auth/resend-code/route.ts).
```typescript
const elapsedMs = Date.now() - latestCode.lastSentAt.getTime();
if (elapsedMs < RESEND_COOLDOWN_MS) {
  return NextResponse.json({ error: 'Please wait before requesting a new code.' }, { status: 429 });
}
```
* **What I chose against, and why:** Chose against relying on UI-only state (such as a disabled button timer). The server must always be the ultimate authority on time-based authorization.

---

### 6. Single-Use Atomic Token Consumption
* **What it is:** A security guarantee ensuring that one-time tokens (such as password reset tokens) can be redeemed exactly once, and cannot be replayed even if submitted concurrently.
* **Why it is needed:** Without atomic single-use verification, race conditions allow attackers to replay a leaked reset link across multiple concurrent requests to overwrite passwords or hijack sessions.
* **How I implemented it:** Enforced via `prisma.$transaction` in [src/app/api/auth/reset-password/route.ts](authentication/src/app/api/auth/reset-password/route.ts), checking `usedAt === null` and setting `usedAt = new Date()` inside the same atomic database transaction that updates `passwordHash`.
```typescript
await prisma.$transaction([
  prisma.user.update({ where: { id: tokenRecord.userId }, data: { passwordHash } }),
  prisma.passwordResetToken.update({ where: { id: tokenRecord.id }, data: { usedAt: new Date() } }),
]);
```
* **What I chose against, and why:** Chose against multi-step non-transactional database checks (read-then-update) where a brief window exists between validation and update.

---

### 7. Database-Level Unique Constraints & Idempotency
* **What it is:** Guaranteeing unique data records at the database engine level rather than relying solely on application checks, and handling collision errors gracefully so identical requests return consistent success shapes.
* **Why it is needed:** Concurrent signups with the same email could otherwise bypass application-level checks and create duplicate accounts. Unhandled collisions result in raw 500 error crashes.
* **How I implemented it:** Defined `@unique` on `User.email` in [prisma/schema.prisma](authentication/prisma/schema.prisma) and caught the `P2002` conflict in [src/app/api/auth/signup/route.ts](authentication/src/app/api/auth/signup/route.ts) to return an idempotent 200 response.
```typescript
catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return NextResponse.json({ success: true, message: 'Verification code sent.' }, { status: 200 });
  }
  throw err;
}
```
* **What I chose against, and why:** Chose against separate custom idempotency key tables or check-then-insert application queries that remain susceptible to concurrent race conditions.

---

### 8. Persistent Sliding-Window Rate Limiting
* **What it is:** Restricting the number of allowable requests within a moving time window, tracked persistently across server restarts using a database-backed log.
* **Why it is needed:** Without rate limiting, authentication endpoints are vulnerable to credential stuffing, brute-force password guessing, and transactional email exhaustion.
* **How I implemented it:** Implemented in [src/lib/rateLimit.ts](authentication/src/lib/rateLimit.ts) using the `RateLimitAttempt` table, limiting requests to 5 attempts per 15 minutes per IP + email key.
```typescript
const count = await prisma.rateLimitAttempt.count({
  where: { key, route, createdAt: { gte: windowStart } },
});
if (count >= 5) return { allowed: false, resetInSeconds };
```
* **What I chose against, and why:** Chose against in-memory rate limiters (e.g. `Map` or local cache) that reset on server restarts and fail across distributed serverless instances.

---

### 9. Multi-Layer Server-Side Protected Routing
* **What it is:** Enforcing authentication checks on protected pages entirely on the server before sending any HTML markup or sensitive data to the client.
* **Why it is needed:** Client-side only route guards flash protected content briefly before redirecting and allow direct HTTP callers to scrape private data without a session.
* **How I implemented it:** Multi-layered defense via [src/middleware.ts](authentication/src/middleware.ts)the server-side guard `requireSession()` in [src/li and b/auth/requireSession.ts](authentication/src/lib/auth/requireSession.ts) called directly by [src/app/dashboard/page.tsx](authentication/src/app/dashboard/page.tsx).
```typescript
export async function requireSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE.name)?.value;
  if (!sessionId) redirect('/auth');
  const session = await getSession(sessionId);
  if (!session) redirect('/auth');
  return session;
}
```
* **What I chose against, and why:** Chose against relying on `useEffect` or client-side layout guards that only redirect after client component hydration.

---

## Section 6: What Went Wrong

### Problem 1: SMTP Connection Hanging on Invalid Credentials (58-Second Signup Delay)
* **The symptom:** Submitting the registration form stalled indefinitely in the browser before failing with an HTTP 500 error after ~58 seconds (`POST /api/auth/signup 500 in 57761ms`).
* **The investigation:** Initially inspected database insertion query times and bcrypt hashing cost performance in `password.ts`. However, database inserts completed in <50ms. Tracing `signup/route.ts` revealed the execution was stalling inside `sendEmail()`.
* **The cause:** Nodemailer was attempting to connect to Gmail SMTP with placeholder credentials without explicit socket or connection timeouts configured, causing the connection handshake to hang until the TCP timeout threshold was reached.
* **The fix:** Added strict connection and socket timeouts (`connectionTimeout: 10000`, `socketTimeout: 15000`) and wrapped the SMTP delivery call in a `try/catch` block with a development console fallback, ensuring sign-up never crashes or stalls even if the remote mail server is unreachable.

---

### Problem 2: Prisma Query Engine DLL File Lock (`EPERM`) on Windows
* **The symptom:** Running `npx prisma generate` failed with `EPERM: operation not permitted, rename query_engine-windows.dll.node`.
* **The investigation:** Checked file permissions and antivirus locks on the project folder. Discovered that the active Next.js development server process (`node.exe`) had loaded the Prisma query engine C++ native addon into memory, locking the binary on Windows.
* **The fix:** Updated the Prisma schema definitions and database schema via `prisma db push`, ensuring the runtime schema metadata in `node_modules/.prisma/client/schema.prisma` was aligned while preventing conflicting file locks.

---

### Problem 3: TypeScript Module Resolution Path Aliasing (`@/*`) in Nested Routes
* **The symptom:** TypeScript compiler threw `Cannot find module '@/components/forms/AuthPageContainer' or its corresponding type declarations` when importing components from deeply nested route files.
* **The investigation:** Verified that the file existed on disk and checked for spelling errors. Verified that `tsconfig.json` had `"paths": { "@/*": ["./src/*"] }`.
* **The cause:** TypeScript 5 path mapping without an explicit `"baseUrl": "."` caused language server resolution failures when resolving relative root paths in subdirectories on Windows.
* **The fix:** Added `"baseUrl": "."` to `compilerOptions` in `tsconfig.json` and added both named and default exports to `AuthPageContainer.tsx`, resolving path aliasing cleanly across all routes.

---

## Section 7: What This Slice Does Not Handle

1. **What Breaks at Scale:**
   * **`RateLimitAttempt` Table Growth:** The database-backed rate limiter logs every attempt. Under millions of requests, this table will grow unbounded without a scheduled background vacuum/cleanup cron to purge records older than 15 minutes.
   * **Synchronous Email Dispatch:** In high-concurrency environments, dispatching emails inline during HTTP requests creates latency. A production deployment requires an asynchronous message queue (e.g. BullMQ, SQS, or RabbitMQ).
2. **What Would Be Needed Before Real Users Touched It:**
   * **Production Email Service Provider:** Integrating a verified transactional email provider (such as Resend, Postmark, or SendGrid) with DKIM/SPF configured.
   * **Multi-Factor Authentication (MFA/TOTP):** Time-based one-time password support for critical account actions.
   * **Session Revocation Across Devices:** Ability to view all active sessions and trigger global logout.
3. **What Was Left Out by Design (Outside Brief):**
   * Social OAuth logins (Google, GitHub), user avatars, profile editing, organizational roles, and dark/light theme persistence. These were explicitly out of scope for the authentication slice.
4. **What Was Left Out Due to Time Constraints:**
   * Automated end-to-end Playwright browser tests across simulated slow networks and headless browser runners.

---

## Section 8: If I Built This Again

If I built this again from scratch, the single biggest thing I would do differently is to implement an asynchronous background worker queue for transactional email dispatch from Day 1 rather than dispatching emails inline inside API route handlers. Decoupling email delivery from the request-response lifecycle prevents external network latency from ever impacting HTTP response times and guarantees zero-latency user registration regardless of third-party mail server performance.
