# Rule: Validation

> Source authority: `AGENTS.md §2 (What Is Locked — Validation)`
> Feature intent: `PRD.md §6 Technical Requirement 2`

---

## Core Principle

Validation schemas are defined **once** and live in a **single file**. Both the server (route
handlers) and client (forms) import and consume that same schema object. No second copy, no
divergent rule, no "quick check" that differs from the real schema.

---

## Schema Location

```
lib/validation/auth.schemas.ts   ← single source of truth for ALL validation rules
```

This file exports all zod schema objects used in the authentication slice. No route handler,
no page component, and no utility function defines its own independent validation rules.

---

## Libraries

| Layer | Library | Role |
|---|---|---|
| Schema definition | `zod` | Defines the shape and constraints of every form/API input |
| Server enforcement | `zod.safeParse()` in route handlers | Re-validates every incoming request body |
| Client UX | `react-hook-form` + `@hookform/resolvers/zod` | Wires the same zod schema to form state for inline feedback |

---

## How Server-Side Validation Works

Every API route handler must validate its input body at the very top, before any other logic:

```ts
// src/app/api/auth/signup/route.ts
import { SignupSchema } from '@/lib/validation/auth.schemas';

export async function POST(req: Request) {
  const body = await req.json();
  const result = SignupSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: result.error.flatten() },
      { status: 400 }
    );
  }
  const { email, password } = result.data; // type-safe from zod inference
  // ... continue with validated data only
}
```

**Use `safeParse()`**, not `parse()`, in route handlers so a validation failure returns a
structured 400 response rather than throwing an unhandled exception.

---

## How Client-Side Validation Works

Client forms import the same schema object from `lib/validation/auth.schemas.ts`:

```ts
// src/app/(auth)/signup/page.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SignupSchema, type SignupInput } from '@/lib/validation/auth.schemas';

const { register, handleSubmit, formState: { errors } } = useForm<SignupInput>({
  resolver: zodResolver(SignupSchema),
});
```

The client form validates for user experience only. **The server always validates independently.**
Even if an attacker bypasses the form entirely, the route handler will catch invalid input.

---

## Schema File Structure

```ts
// lib/validation/auth.schemas.ts

import { z } from 'zod';

// --- Shared password rule ---
// 8 character minimum; no forced complexity (per PRD §11 Assumptions)
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

// --- Signup ---
export const SignupSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof SignupSchema>;

// --- Sign-in ---
export const SigninSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type SigninInput = z.infer<typeof SigninSchema>;

// --- Verify email ---
export const VerifyEmailSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must be numeric'),
});
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

// --- Resend code ---
export const ResendCodeSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});
export type ResendCodeInput = z.infer<typeof ResendCodeSchema>;

// --- Forgot password ---
export const ForgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

// --- Reset password ---
export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
```

---

## Type Strategy

Prefer types inferred directly from the zod schemas using `z.infer<typeof Schema>`.
Do not write hand-maintained duplicate type interfaces that could drift from the schema.

```ts
// ✅ Correct — derived type stays in sync automatically
export type SignupInput = z.infer<typeof SignupSchema>;

// ❌ Wrong — manually maintained duplicate that can silently diverge
interface SignupInput {
  email: string;
  password: string;
}
```

---

## What Is Not Permitted

- A route handler that skips schema validation on any field (e.g. "we checked it client-side").
- A page or utility that defines its own validation logic independently of `auth.schemas.ts`.
- Using `parse()` instead of `safeParse()` in route handlers (throws instead of returning a response).
- Extending or narrowing a schema in a route handler with ad-hoc `.extend()` or `.pick()` that
  creates a divergent rule from the shared schema — if a rule needs to change, change it in the
  source file.
