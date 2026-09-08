# Rule: Git & Commit Conventions

> Source authority: `AGENTS.md §3 (Rule 14), §5 (How The Code Should Look), §6 (Done Checklist)` and `PRD.md §12 (Phase Roadmap)`

---

## 1. Core Commit Principles

1. **Incremental and Phase-Scoped:**
   - Commits must be incremental and scoped strictly to one phase or sub-step at a time (matching the phase order in `AGENTS.md §3 Rule 13` and `08-phase-order.md`).
   - **Never make a single monolithic commit at the end.**
   - Do not commit changes that implement later-phase logic ahead of earlier phases.

2. **Clean & Build-Verified Working Tree:**
   - Every commit must leave the repository in a working state where `npm run build` and `npm run lint` pass cleanly with zero TypeScript or ESLint errors.
   - Never commit broken intermediate states or compile-time regressions.

---

## 2. Commit Message Format

Follow standard **Conventional Commits** formatting to ensure clarity of intent and historical traceability:

```
<type>(<scope>): <short description in imperative mood>

[optional body explaining intent, rationale, or design constraints]
[optional footer referencing PRD requirement / Tech Req / FR]
```

### Commit Types:
- `feat`: A new user-facing or architectural capability (e.g. signup flow, session guard, rate limiting).
- `fix`: A bug fix or compliance correction against requirements.
- `refactor`: Code change that neither fixes a bug nor adds a feature (e.g. extracting helper functions, styling token cleanup).
- `test`: Adding or updating verification tests / scripts.
- `chore`: Infrastructure, dependencies, configuration, or Prisma migrations.
- `docs`: Documentation updates (e.g. rules, PRD, README).

### Scopes:
- `schema`: Prisma data model, migrations, and database constraints.
- `auth`: Hashing, sessions, verification codes, or reset tokens.
- `api`: Specific API route handlers (`/api/auth/*`).
- `ui` or `components`: Form components (`FormField`, `AuthPageContainer`) and auth pages.
- `security`: Rate limiting, session guards, and credential invariants.
- `validation`: Zod schemas and resolver integrations.

### Examples:
```bash
# Phase 1: Data Model & Infrastructure
feat(schema): define the five locked Prisma models with cascade rules and indexes
chore(infra): add docker-compose configuration for local PostgreSQL

# Phase 2: Signup & Session Baseline
feat(auth): implement bcrypt password hashing with cost factor 12
feat(api): add idempotent signup endpoint with DB unique constraint handling

# Phase 3: Email Verification
feat(auth): add CSPRNG 6-digit verification code generation and hash verification
feat(api): implement server-side verification and resend cooldown enforcement

# Phase 4: Sign-In & Protected Routing
feat(auth): implement database-backed session management with secure cookie
feat(security): add server-side requireSession guard on dashboard route

# Phase 5: Password Reset
feat(auth): implement single-use atomic password reset token redemption

# Phase 6: Rate Limiting
feat(security): add shared sliding-window rate limiter on the 4 required endpoints

# Phase 7: Accessibility Pass
fix(ui): enforce programmatic label binding and visible focus states across all forms
```

---

## 3. Secret Protection & Git Ignore Invariants

> **Zero-Tolerance Rule (`AGENTS.md §3 Rule 14`):**
> **Never commit `.env` or real secrets to the repository.**

### Protected Files:
- `.env`: **MUST NEVER BE COMMITTED.** Must remain in `.gitignore`.
- `.env.example`: **Committed.** Contains commented template placeholders only (no live API keys, SMTP passwords, or production secrets).
- Private keys, certificate bundles, credentials, and local database volumes.

### Required `.gitignore` Entries:
```gitignore
# Dependencies
node_modules/
/.pnp
.pnp.js

# Next.js build output
.next/
out/

# Environment files
.env
.env*.local
!.env.example

# Logs and runtime artifacts
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# OS files
.DS_Store
Thumbs.db
```

---

## 4. Pre-Commit Checklist

Before staging and committing changes, verify:

- [ ] `.env` is **not** staged (`git status` shows `.env` untracked or ignored).
- [ ] No plaintext passwords, verification codes, or tokens are written into commit history or comments.
- [ ] `npm run lint` passes with 0 errors.
- [ ] `npx tsc --noEmit` / `npm run build` passes with 0 TypeScript errors.
- [ ] The change is scoped cleanly to the specific phase/task at hand without bundling unrelated refactors.
- [ ] Commit message accurately describes the changes in imperative mood.
