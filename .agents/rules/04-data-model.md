# Rule: Prisma Data Model

> Source authority: `PRD.md §9 (Prisma Data Model)`
> Enforcement rule: `AGENTS.md §2 (What Is Locked — Data model)`

The Prisma schema contains exactly **five models**. No model may be added, removed, or renamed.
No field that carries a documented decision (see inline comments below) may be changed without
first flagging the change and explaining why.

**Every field comment documents *why* the field exists. Preserve the behavior the comment
describes — not just the field name.**

---

## Schema (Canonical Reference)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id               String    @id @default(cuid())
  email            String    @unique // Req 8: DB-level uniqueness — not app-level check-then-insert
  passwordHash     String    // bcrypt hash only; plaintext password is NEVER stored or logged
  emailVerifiedAt  DateTime? // null = unverified; timestamp (not boolean) also records WHEN verification happened
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  sessions             Session[]
  verificationCodes    VerificationCode[]
  passwordResetTokens  PasswordResetToken[]

  @@index([email]) // explicit index alongside @unique for clarity on the hot lookup path
}

model Session {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime // fixed 7-day lifetime set at creation; NOT extended on activity
  createdAt  DateTime @default(now())

  @@index([userId])    // supports "revoke all sessions for user" and per-user lookups
  @@index([expiresAt]) // supports periodic cleanup of expired sessions
}

model VerificationCode {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  codeHash    String    // hash of the 6-digit code — raw code is NEVER stored; DB read alone cannot verify
  expiresAt   DateTime  // Req 5: expiry lives in the DB, independent of any UI countdown
  consumedAt  DateTime? // null = unused; set on success so a code CANNOT be replayed after verification
  lastSentAt  DateTime  @default(now()) // drives server-side resend cooldown (Req 6)
  attempts    Int       @default(0)     // failed guesses against this code; feeds brute-force detection

  @@index([userId])
  @@index([expiresAt])
}

model PasswordResetToken {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String    @unique // hashed, not raw; a leaked DB row CANNOT be replayed as a live reset link
  expiresAt  DateTime  // Req 7: time-limited to 60 minutes
  usedAt     DateTime? // null = unused; set atomically on redemption to enforce single-use (Req 7)

  @@index([userId])
  @@index([expiresAt])
}

model RateLimitAttempt {
  id         String   @id @default(cuid())
  key        String   // composite "route:ip:email" key — matches Req 3's IP+email keying
  route      String   // one of: signin | signup | password-reset-request | verification-resend
  createdAt  DateTime @default(now())

  @@index([key, route, createdAt]) // supports the sliding-window COUNT query behind the rate-limit check
}
```

---

## Field-Level Decisions (Critical Notes)

### `User.email` — `@unique`
The database unique constraint is the actual enforcement mechanism for duplicate-signup
prevention. Application code may check for UX, but must never be the sole guard.

### `User.emailVerifiedAt` — `DateTime?`
A nullable timestamp, not a boolean. The timestamp also captures *when* verification occurred,
which is useful for debugging and audit. Do not convert this to a boolean.

### `User.passwordHash`
Only bcrypt output (from `lib/auth/password.ts`) may be stored here. Never store or log the
plaintext password at any point in the request lifecycle.

### `Session.expiresAt`
Set once at session creation to `now() + 7 days`. The session is **never silently extended**
on user activity. Renewal requires explicit logic, which is out of scope for this slice.

### `VerificationCode.codeHash`
The raw 6-digit numeric code is hashed (bcrypt) before storage. The raw code goes to email only;
it never touches the database.

### `VerificationCode.consumedAt`
Set (non-null) when a code is successfully verified. A consumed code cannot be replayed.

### `VerificationCode.lastSentAt`
The server-side source of truth for the 60-second resend cooldown. Updated every time a new code
is issued. Never rely on client-side state for this check.

### `PasswordResetToken.tokenHash`
The URL-safe reset token is hashed before storage. A database leak cannot be used to forge a
valid reset link.

### `PasswordResetToken.usedAt`
Set atomically inside the same transaction that updates `passwordHash`. There is no window
between checking `usedAt IS NULL` and writing the new password hash.

### `RateLimitAttempt.key`
The composite key format is `"route:ip:email"`. Every rate-limited route must use this exact
format so the sliding-window count query in `lib/rateLimit.ts` works correctly.

---

## What Is Not Permitted

- Adding a sixth model without flagging it first.
- Adding a `username` field (email is the sole identity field).
- Adding a `role` or `isAdmin` field (single user type only).
- Replacing `passwordHash` with any other name or type.
- Changing `emailVerifiedAt` from `DateTime?` to `Boolean`.
- Removing any `@@index` directive — they are part of the performance and correctness design.
- Changing `Session.expiresAt` to auto-extend on activity without explicit instruction.
