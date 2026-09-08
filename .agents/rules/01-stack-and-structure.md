# Rule: Stack and Project Structure

> Source authority: `AGENTS.md §2 (What Is Locked — Stack)` and `AGENTS.md §4 (How The Work Is Arranged)`
> Feature intent: `PRD.md §1` and `PRD.md §6 (Technical Requirements)`

These rules govern the technology choices and directory layout for the authentication slice.
They are **locked decisions** — do not substitute, upgrade, or restructure without flagging first.

---

## Locked Technology Stack

| Concern | Decision | Rationale |
|---|---|---|
| Framework | **Next.js** (App Router) | Locked. No alternative framework. |
| Language | **TypeScript** with `strict: true` | Locked. No `any` without an explanatory comment. |
| ORM | **Prisma** | Locked. No other ORM or raw SQL abstraction layer. |
| Database | **PostgreSQL** (Docker locally) | Locked. Local dev uses Docker Compose. No hosted provider in dev. |
| Password hashing | **bcryptjs**, cost factor **12** | Locked. No general-purpose hash (MD5, SHA-256, etc.) for passwords. |
| Schema validation | **zod** | Single source of truth in `lib/validation/auth.schemas.ts`. |
| Form integration | **React Hook Form + @hookform/resolvers/zod** | Client-side only; never trusted by server. |
| Runtime | Current **Node.js LTS** | No EOL or canary/unstable Node version. |

---

## Canonical Directory Layout

Every file must live in one of these exact locations. Do not create parallel structures.

```
/prisma
  schema.prisma              # Five locked models only (see 04-data-model.md)
  migrations/

/src
  /app
    /(auth)
      /signup/page.tsx
      /signin/page.tsx
      /forgot-password/page.tsx
      /reset-password/page.tsx
      /verify-email/page.tsx
    /dashboard/page.tsx       # Placeholder: user name + sign-out only
    /api/auth
      /signup/route.ts
      /signin/route.ts
      /signout/route.ts
      /verify-email/route.ts
      /resend-code/route.ts
      /forgot-password/route.ts
      /reset-password/route.ts
    layout.tsx
    middleware.ts             # Server-side protected-route guard lives here exclusively

  /components
    /forms
      FormField.tsx           # ONE shared labeled-input component for all five screens

  /lib
    /auth
      password.ts             # bcrypt hashing ONLY — no other file hashes passwords
      session.ts              # Session create / destroy / read; cookie config
      requireSession.ts       # Shared server-side session guard
    /validation
      auth.schemas.ts         # ALL zod schemas — single source; imported by server & client
    rateLimit.ts              # ONE shared rate-limit helper; called by all four limited routes
    email.ts                  # Pluggable email interface + dev console logger
    prisma.ts                 # Single Prisma Client instance

  /types

.env.example                  # Committed; placeholder values only
.env                          # Never committed
docker-compose.yml            # Local PostgreSQL for development
```

---

## Separation Rules

These rules enforce a single responsibility per concern. Violating them means two code paths exist
for the same responsibility, which is how bugs hide.

- **Password hashing** → only in `lib/auth/password.ts`. No route, page, or other utility hashes a password.
- **Rate-limit check** → only in `lib/rateLimit.ts`. No route re-implements its own window/count logic.
- **Session guard** → only in `lib/auth/requireSession.ts` (called from `middleware.ts`). No page improvises an "is this user logged in?" check.
- **Validation schemas** → only in `lib/validation/auth.schemas.ts`. Client forms import this same object; they do not restate rules.
- **Database access** → only in API route handlers (`/api/auth/*`). Page components (`/app/(auth)/*`) do rendering and form wiring only. No `prisma.*` calls inside page components.
- **Rendering logic** → only in page components. Route handlers do validation, hashing, and DB writes — not UI rendering.

---

## Scope Limits (Non-Goals)

Only these surfaces may exist in this repository:
- Five auth screens (signup, signin, forgot-password, reset-password, verify-email)
- One placeholder dashboard (user name + sign-out button)
- Seven API route handlers listed above
- Supporting lib/ utilities as laid out

**Prohibited:**
- Landing page, marketing page, or any page not listed above
- Dashboard features beyond name display and sign-out
- Profile editing, account settings, social sign-in, 2FA
- Admin functionality, multi-role user types
- Any feature not explicitly required by the PRD

> Reference: `AGENTS.md §3 rule 12`
