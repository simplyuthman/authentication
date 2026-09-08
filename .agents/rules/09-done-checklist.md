# Rule: Definition of Done — Success Metrics Checklist

> Source authority: `AGENTS.md §6 (What Counts As Done)`, `PRD.md §10 (Success Metrics)`

Before declaring this slice finished, every item below must be honestly checked with **pass/fail
evidence against the actual running system** — not a restatement of intent.

If any box cannot be honestly checked as pass, the slice is **not done**. Say so plainly.

---

## Build & Lint

| # | Check | How to Verify | Status |
|---|---|---|---|
| B1 | `npm run build` completes with zero errors | Run it; observe exit code | ☐ |
| B2 | Zero TypeScript errors | Included in build output | ☐ |
| B3 | `npm run lint` completes with zero errors | Run it; observe exit code | ☐ |

---

## Functional Flows (PRD FR1–FR13)

| # | Requirement | How to Verify | Status |
|---|---|---|---|
| F1 | Signup screen completes its flow end to end (FR1) | Create account through the UI | ☐ |
| F2 | Email verification screen completes its flow (FR3) | Enter correct code after signup | ☐ |
| F3 | Sign-in screen completes its flow (FR6) | Sign in with verified account credentials | ☐ |
| F4 | Forgot-password screen completes its flow (FR10) | Submit a forgot-password request | ☐ |
| F5 | Reset-password screen completes its flow (FR11) | Use emailed link to set a new password | ☐ |

---

## Security & Correctness (Reviewer Persona Tests)

These must be verified by **direct API/DB calls**, not by observing browser behaviour.

| # | Requirement | Verification Method | Status |
|---|---|---|---|
| S1 | Duplicate signup produces exactly one `User` row (FR2 / SM3) | `curl` POST twice; `SELECT COUNT(*) FROM "User" WHERE email = '...'` → must be 1 | ☐ |
| S2 | `passwordHash` in DB is a bcrypt hash; no plaintext anywhere (SM2) | `SELECT "passwordHash" FROM "User" LIMIT 1` → must start with `$2b$` | ☐ |
| S3 | Expired verification code is rejected via DB timestamp (FR4 / SM4) | Set `expiresAt` to past in DB; submit code via `curl`; expect rejection | ☐ |
| S4 | Resend cooldown enforced server-side within 60 s (FR5 / SM5) | Call `/api/auth/resend-code` twice within 60 s via `curl`; second must be rejected | ☐ |
| S5 | Used/expired reset token rejected on second attempt (FR11 / SM6) | Use token once; call `/api/auth/reset-password` again with same token; expect rejection | ☐ |
| S6 | All four rate-limited endpoints return 429 after 5 requests in 15 min (FR12 / SM7) | Loop `curl` 6 times on each of the four routes; 6th must return 429 | ☐ |
| S7 | Dashboard route without a valid session returns redirect, not content (FR8 / SM8) | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard` without cookie → must be 3xx | ☐ |
| S8 | Replaying old cookie after sign-out fails (FR9 / SM9) | Capture cookie; sign out; replay captured cookie via `curl` → must redirect | ☐ |
| S9 | Sign-in error identical for wrong password vs unknown email (FR7) | Compare response bodies for both cases → must be byte-identical generic message | ☐ |
| S10 | Forgot-password identical response for existing vs non-existing email (FR10) | Compare response bodies for both cases → must be byte-identical | ☐ |
| S11 | Sign-out deletes `Session` row (FR9) | Sign out; `SELECT COUNT(*) FROM "Session" WHERE id = '<old_id>'` → must be 0 | ☐ |

---

## Accessibility (FR13 / SM10)

| # | Check | How to Verify | Status |
|---|---|---|---|
| A1 | Every input on signup screen has a `<label>` bound via `htmlFor`/`id` | Inspect rendered HTML | ☐ |
| A2 | Every input on sign-in screen has a `<label>` bound via `htmlFor`/`id` | Inspect rendered HTML | ☐ |
| A3 | Every input on verify-email screen has a `<label>` bound via `htmlFor`/`id` | Inspect rendered HTML | ☐ |
| A4 | Every input on forgot-password screen has a `<label>` bound via `htmlFor`/`id` | Inspect rendered HTML | ☐ |
| A5 | Every input on reset-password screen has a `<label>` bound via `htmlFor`/`id` | Inspect rendered HTML | ☐ |
| A6 | All five screens completable by keyboard-only (Tab / Shift+Tab / Enter) | Manual walkthrough with mouse disconnected | ☐ |
| A7 | All interactive elements have a visible `:focus-visible` outline | Tab through each screen; confirm visible focus ring | ☐ |

---

## Repository Hygiene

| # | Check | How to Verify | Status |
|---|---|---|---|
| R1 | `.env` is not committed (AGENTS.md §3 rule 14) | `git ls-files .env` → must return empty | ☐ |
| R2 | `.env.example` exists with commented placeholders only | Open file; confirm no real secrets | ☐ |
| R3 | No file exists outside the five screens, placeholder dashboard, and supporting lib/ (AGENTS.md §3 rule 12) | Review file tree | ☐ |

---

## Completing the Checklist

When all items above are checked ✅, update this file with:
- A completion timestamp
- The command output or evidence for each Reviewer test (S1–S11)

When you cannot check an item honestly, do **not** mark it as passed. Instead:
1. Mark it as ❌ with a brief note on what is failing.
2. Fix the underlying issue.
3. Re-run the verification.
4. Only then mark it ✅.
