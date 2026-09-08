# Rule: Code Quality Standards

> Source authority: `AGENTS.md §5 (How The Code Should Look)`

---

## TypeScript

- **Strict mode** is required: `"strict": true` in `tsconfig.json`. This is not optional.
- **No `any`** unless a comment directly above explains exactly why nothing narrower works.
- **Prefer inferred types** from zod schemas (`z.infer<typeof Schema>`) over hand-written
  interface duplicates.
- **No type assertions** (`as SomeType`) without a comment explaining why the cast is safe.

```ts
// ✅ Correct — strict inference
const { email, password } = result.data; // type flows from SignupSchema

// ❌ Wrong — untyped and silences the compiler
const { email, password } = body as any;
```

---

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Files & folders | kebab-case | `reset-password/`, `auth.schemas.ts` |
| React components | PascalCase | `FormField`, `SignupPage` |
| Functions | camelCase, descriptive verb phrase | `hashPassword`, `createSession`, `checkRateLimit` |
| Variables | camelCase, named for meaning | `hashedToken`, `verificationCode`, `sessionExpiry` |
| Constants | SCREAMING_SNAKE_CASE | `BCRYPT_COST_FACTOR`, `SESSION_LIFETIME_MS` |
| Zod schemas | PascalCase + `Schema` suffix | `SignupSchema`, `ResetPasswordSchema` |
| Zod inferred types | PascalCase + `Input` suffix | `SignupInput`, `ResetPasswordInput` |

**Names must describe intent, not abbreviate for typing speed.**

```ts
// ✅ Correct
const sessionExpiryDate = new Date(Date.now() + SESSION_LIFETIME_MS);

// ❌ Wrong — opaque abbreviation
const exp = new Date(Date.now() + SL_MS);
```

---

## No Magic Numbers

All threshold, expiry, limit, and configuration values must be **named constants** in a single
location. No inline literals for values that appear more than once or carry meaning.

See `05-auth-mechanics.md` for the full list of locked constant values.

```ts
// ✅ Correct
const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS);

// ❌ Wrong — magic number with no name
const expiresAt = new Date(Date.now() + 900000);
```

---

## No Dead Code, No Commented-Out Code

- If code was tried and abandoned, **remove it**. Git history is the record, not a comment block.
- No TODO blocks left in shipped code. If something is genuinely unresolved, use a clearly
  labelled note with a reference to the PRD section or Open Question it relates to:
  ```ts
  // TODO(Open Question §13): Decide whether to issue a pre-verification session here.
  // Currently: no session is issued until emailVerifiedAt is set (conservative default).
  ```

---

## No Stray `console.log`

The only intentional `console.log` output is the **dev email logger** in `lib/email.ts`.
It must read like a structured log line:

```ts
// ✅ Correct — structured log line
console.log(`[EMAIL] To: ${to} | Subject: ${subject} | Body: ${body}`);

// ❌ Wrong — debug dump
console.log('sending email', emailData);
console.log(code);
```

All other `console.log`, `console.debug`, `console.warn` calls introduced during development
must be removed before the phase is considered complete.

---

## Error Handling

- Every route must return a **typed, consistent error shape**.
- No unhandled promise rejections.
- No bare `catch {}` blocks that swallow an error silently.

```ts
// ✅ Correct — structured error shape
return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

// ✅ Correct — logged and re-thrown or returned as 500
} catch (err) {
  console.error('[SIGNIN] Unexpected error:', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ❌ Wrong — swallowed
} catch {}

// ❌ Wrong — untyped error dump in response
} catch (err) {
  return NextResponse.json({ error: err }, { status: 500 });
}
```

Consistent error response shape for all auth API routes:
```ts
// Success
{ success: true, data?: {...} }

// Error
{ error: string, details?: unknown }
```

---

## Linting and Formatting

- **ESLint**: default Next.js config. Do not disable rules inline without a comment.
- **Prettier**: default config. Do not hand-format around the formatter.
- Code must pass `npm run lint` and `npm run build` with zero errors before a phase is
  considered complete.

---

## Commits

- Incremental and **scoped to one phase-step at a time** (matching the phase order in
  `08-phase-order.md`).
- Not one giant commit at the end.
- Commit message should clearly state the phase and the specific change:
  ```
  Phase 1: Add Prisma schema with five locked models
  Phase 2: Add signup route with bcrypt hashing and idempotency handling
  Phase 3: Add verification code generation and verify-email route
  ```

---

## Accessibility (Structural — Not Per-Screen Effort)

- **One shared `FormField` component** (`components/forms/FormField.tsx`) pairs every
  `<label>` with its `<input>` via `htmlFor`/`id`.
- **Every interactive element** has a visible `:focus-visible` outline style.
- This must be built into the component so that accessibility is structural across all five
  screens, not a one-off applied per page.
- See `PRD.md §6 Technical Requirement 11` and `PRD.md FR13`.

```tsx
// components/forms/FormField.tsx — minimal contract
interface FormFieldProps {
  id: string;          // required — passed to both label htmlFor and input id
  label: string;
  error?: string;
  // ...rest of input props
}
```

---

## Build and Lint Completion Criteria

A phase is not complete until:
- `npm run build` exits with **zero errors and zero TypeScript errors**.
- `npm run lint` exits with **zero errors**.
