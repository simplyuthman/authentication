# Rule: Design System Color Architecture

> Source authority: `design-tokens.tokens.json`, `styles/tokens.css` (generated), `convert-tokens.js`
> Related documentation: `docs/DESIGN_SYSTEM_TOKENS.md`

The project uses a **two-tier color system** generated from `design-tokens.tokens.json`.
This rule defines what each tier is, what it is for, and the hard constraint on usage.

---

## The Two-Tier System

### Tier 1 — Primitive Colors (Foundations)

- **CSS variable prefix:** `--primitive-color-*`
- **Definition:** Raw hex values organized into tonal palettes (`0` → `100`) for six color
  families: Primary, Secondary, Tertiary, Neutral, Neutral Variant, and Error — plus six Key
  Color anchors.
- **Example variables:**
  - `--primitive-color-key-primary: #004ed4`
  - `--primitive-color-primary-40: #004bcc`
  - `--primitive-color-neutral-10: #16181d`
  - `--primitive-color-error-30: #ad1406`

**❌ NEVER apply primitive color variables directly to UI components, styles, or page layouts.**

Primitives are the mathematical backing store. They express no semantic intent about where a color
should be used or how two colors are expected to pair for readability.

---

### Tier 2 — Color Roles (Semantic Application Tokens)

- **CSS variable prefix:** `--color-*`
- **Definition:** Semantic aliases that resolve to primitives at the `:root` level via `var(...)`.
  Each role describes *intent* (e.g., "what is placed on top of the primary surface?") rather than
  raw pigment.

**✅ ALWAYS use color roles when styling any UI element.**

#### Full Role Reference

| CSS Variable | Resolves To Primitive | Usage Intent |
|---|---|---|
| `--color-primary` | `--primitive-color-key-primary` | High-emphasis actions, primary buttons, active states |
| `--color-on-primary` | `--primitive-color-primary-100` | Text / icons placed *on* a `--color-primary` surface |
| `--color-primary-container` | `--primitive-color-primary-90` | Low-emphasis fills, selected states, chips |
| `--color-on-primary-container` | `--primitive-color-primary-30` | Text / icons on `--color-primary-container` |
| `--color-secondary` | `--primitive-color-key-secondary` | Secondary buttons, auxiliary actions |
| `--color-on-secondary` | `--primitive-color-secondary-100` | Text / icons on `--color-secondary` |
| `--color-secondary-container` | `--primitive-color-secondary-90` | Secondary container fills |
| `--color-on-secondary-container` | `--primitive-color-secondary-30` | Text / icons on `--color-secondary-container` |
| `--color-tertiary` | `--primitive-color-key-tertiary` | Accent highlights, tertiary actions |
| `--color-on-tertiary` | `--primitive-color-tertiary-100` | Text / icons on `--color-tertiary` |
| `--color-tertiary-container` | `--primitive-color-tertiary-90` | Tertiary background fills |
| `--color-on-tertiary-container` | `--primitive-color-tertiary-30` | Text / icons on `--color-tertiary-container` |
| `--color-error` | `--primitive-color-key-error` | Error indicators, destructive actions |
| `--color-on-error` | `--primitive-color-error-100` | Text / icons on `--color-error` |
| `--color-error-container` | `--primitive-color-error-90` | Error callout backgrounds, alert fills |
| `--color-on-error-container` | `--primitive-color-error-30` | Text / icons on `--color-error-container` |
| `--color-surface` / `--color-surface-color` | `--primitive-color-neutral-98` | Default page / view background |
| `--color-on-surface` | `--primitive-color-neutral-10` | Default body text and primary icons |
| `--color-surface-variant` | `--primitive-color-neutral-variant-90` | Subtle surfaces, dividers, borders |
| `--color-on-surface-variant` | `--primitive-color-neutral-variant-30` | Secondary text, placeholders, captions |
| `--color-surface-container-lowest` | `--primitive-color-neutral-100` | Highest-elevation card surfaces |
| `--color-surface-container-low` | `--primitive-color-neutral-98` | Low-elevation container fills |
| `--color-surface-container` | `--primitive-color-neutral-95` | Standard card and dialog container fills |
| `--color-surface-container-high` | `--primitive-color-neutral-90` | Elevated container fills |
| `--color-surface-container-highest` | `--primitive-color-neutral-90` | Maximum elevation container fills |
| `--color-inverse-surface` | `--primitive-color-neutral-20` | Dark inverse surfaces (snackbars) |
| `--color-inverse-on-surface` | `--primitive-color-neutral-95` | Text on inverse surfaces |
| `--color-surface-tint` | `--primitive-color-primary-40` | Elevation tint overlay |

---

## Spacing Tokens

All layout spacing must use the standardized spacing variables — never hardcode pixel values.

| Shorthand | Pixel | Rem | Use |
|---|---|---|---|
| `--spacing-none` / `--spacing-0` | `0px` | `0rem` | Resets |
| `--spacing-xs` / `--spacing-4` | `4px` | `0.25rem` | Icon gaps, tight badge padding |
| `--spacing-sm` / `--spacing-8` | `8px` | `0.5rem` | Button padding, field gaps |
| `--spacing-md` / `--spacing-12` | `12px` | `0.75rem` | Card inner margins |
| `--spacing-base` / `--spacing-16` | `16px` | `1rem` | Standard page padding |
| `--spacing-lg` / `--spacing-20` | `20px` | `1.25rem` | Section spacing |
| `--spacing-xl` / `--spacing-24` | `24px` | `1.5rem` | Modal padding, form groups |
| `--spacing-2xl` / `--spacing-32` | `32px` | `2rem` | Layout gutters, header margin |

---

## Typography Tokens

The design system uses **DM Sans** exclusively across 15 type scale tiers.
Use the generated typography variables or utility classes.

- **CSS variables:** `--typography-{scale}-font-size`, `--typography-{scale}-line-height`, etc.
- **Utility classes:** `.text-display-large`, `.text-headline-medium`, `.text-body-large`, `.text-label-small`, etc.

Available scales: `display-large`, `display-medium`, `display-small`, `headline-large`, `headline-medium`,
`headline-small`, `title-large`, `title-medium`, `title-small`, `body-large`, `body-medium`, `body-small`,
`label-large`, `label-medium`, `label-small`.

---

## Shadow / Elevation Tokens

| Shorthand Variable | Effect Variable | Box-Shadow Value | Utility Class |
|---|---|---|---|
| `--shadow-soft` | `--effect-soft-shadow` | `2px 2px 20px 0px rgba(0,0,0,0.122)` | `.shadow-soft` |
| `--shadow-medium` | `--effect-medium-shadow` | `2px 4px 6px 0px rgba(0,0,0,0.278)` | `.shadow-medium` |
| `--shadow-hard` | `--effect-hard-shadow` | `4px 6px 8px 0px rgba(0,0,0,0.322)` | `.shadow-hard` |

---

## Generating / Regenerating CSS Variables

When `design-tokens.tokens.json` is updated (e.g., new Figma export), run:

```bash
node convert-tokens.js --split
```

This regenerates `styles/tokens.css` and the modular bundle in `styles/tokens/`.
Import the consolidated file in `src/app/layout.tsx` globals or via `globals.css`:

```css
@import '../styles/tokens.css';
/* or the modular barrel: */
@import '../styles/tokens/index.css';
```

---

## Anti-Patterns

```css
/* ❌ WRONG — Direct primitive usage in component */
.button { background-color: var(--primitive-color-primary-40); }

/* ✅ CORRECT — Semantic role */
.button { background-color: var(--color-primary); }

/* ❌ WRONG — Hardcoded value */
.card { box-shadow: 2px 2px 20px rgba(0,0,0,0.12); margin: 16px; }

/* ✅ CORRECT — Token-backed */
.card { box-shadow: var(--shadow-soft); margin: var(--spacing-base); }
```
