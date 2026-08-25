# Frontend "Parquet" Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give BasketEasy a deliberate visual direction ("Parquet") and close the navigation, feedback and failure-state gaps the 2026-08-25 review found.

**Architecture:** Six sequential phases, each shippable on its own. Tokens land first so nothing gets styled twice; primitives are restyled inside `@basketeasy/ui` (one Storybook story per change) before any page composition moves; correctness and navigation follow; page compositions and the landing rewrite last. No backend, schema or endpoint changes.

**Tech Stack:** React 18 + Vite, TypeScript strict, Tailwind CSS 3 via `@basketeasy/ui/tailwind-preset`, CVA + Radix primitives, TanStack Query 5, React Router 6, Vitest + React Testing Library, Storybook 8.

**Spec:** [`docs/superpowers/specs/2026-08-25-frontend-parquet-revamp-design.md`](../specs/2026-08-25-frontend-parquet-revamp-design.md)

## Global Constraints

- **French-first copy.** Every user-facing string is French, matching `docs/brand.md`'s tone. Use the typographic ellipsis `…`, never `...`. Use `'` (U+2019) as the apostrophe in JSX text, escaped as `&apos;` where ESLint's `react/no-unescaped-entities` requires it.
- **No barrel exports.** Every new `@basketeasy/ui` component gets its own `exports` subpath entry in `packages/@basketeasy/ui/package.json`, imported as `@basketeasy/ui/<kebab-name>`.
- **Every new `@basketeasy/ui` component ships three files:** `X.tsx`, `X.test.tsx`, `X.stories.tsx`, colocated in `packages/@basketeasy/ui/src/components/`.
- **No hardcoded hex, no arbitrary Tailwind values** (`bg-[#...]`, `text-[13px]`) and no inline `style={{}}` in `app/src` or `packages/@basketeasy/ui/src`. Every colour comes from a preset token.
- **Class merging** always goes through `cn()` from `@basketeasy/ui/cn` — never template-literal className concatenation.
- **Brand colour values do not change.** `#D4622A`, `#AA4F22`, `#1E5F74`, `#23201C`, `#5B564F`, `#E7DECF`, `#B23A2E`, `#2F7D5C` keep their exact current values.
- **Touch targets** stay 44px on mobile, shrinking at `md:` (`h-11 md:h-10`, `min-h-11 md:min-h-0`).
- **Run before every commit:** `pnpm format` then `pnpm --filter @basketeasy/ui test && pnpm --filter @basketeasy/app test`.
- **Commit style:** Conventional Commits, e.g. `feat(ui): add warm elevation tokens`.

---

## File Structure

**Created in `packages/@basketeasy/ui/src/`:**

| File                            | Responsibility                                                         |
| ------------------------------- | ---------------------------------------------------------------------- |
| `lib/focusRing.ts`              | The single focus-visible class string every interactive primitive uses |
| `components/QueryError.tsx`     | Inline "load failed + retry" panel for a failed query                  |
| `components/Skeleton.tsx`       | Shimmer placeholder block; `SkeletonRow` composes it into a list row   |
| `components/SectionHeading.tsx` | Uppercase section label + the court-line rule                          |
| `components/ConfirmDialog.tsx`  | Destructive-confirm dialog with an optional type-to-confirm gate       |

**Created in `app/src/`:**

| File                              | Responsibility                                                      |
| --------------------------------- | ------------------------------------------------------------------- |
| `components/AppErrorBoundary.tsx` | Class component catching render throws, rendering a recovery screen |
| `components/AccountMenu.tsx`      | Header dropdown: profile link + logout                              |
| `pages/NotFoundPage.tsx`          | 404, rendered in place rather than redirecting                      |
| `pages/ForbiddenPage.tsx`         | 403 for a club the viewer doesn't administer                        |
| `clubs/TeamDeleteModal.tsx`       | Confirm-gated team deletion                                         |
| `clubs/backLink.ts`               | `useBackLink()` — resolves origin from `location.state`             |

**Modified (principal):** `packages/@basketeasy/ui/tailwind-preset.cjs`, `src/styles/globals.css`, `components/{Button,Card,Dialog,Input,Textarea,Select,Tabs,Checkbox,DropdownMenu,Table,Avatar,Badge,Loader}.tsx`; `app/index.html`, `app/src/index.css`, `app/src/App.tsx`, `auth/{ProtectedRoute,PublicOnlyRoute}.tsx`, `components/AppHeader.tsx`, `pages/{DashboardPage,MyTeamsPage,MembersPage,TeamDetailPage,LandingPage}.tsx`, `clubs/{EventRsvpControl,TeamEventsAgenda,EventRsvpBreakdown,EventConvocationBreakdown}.tsx`.

---

# Phase 1 — Token layer

### Task 1: Parquet tokens, warm elevation and the type pairing

**Files:**

- Modify: `packages/@basketeasy/ui/tailwind-preset.cjs` (whole file)
- Modify: `packages/@basketeasy/ui/src/styles/globals.css`
- Modify: `app/src/index.css`
- Modify: `app/index.html:6-11` (font link)
- Modify: `packages/@basketeasy/ui/.storybook/preview.ts` (font link + background)
- Modify: `docs/brand.md` (visual-system table)
- Test: `packages/@basketeasy/ui/src/components/Card.test.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: Tailwind classes `bg-ground`, `bg-surface`, `bg-surface-2`, `bg-sunk`, `bg-orange-tint`, `bg-orange-hover`, `bg-blue-green-tint`, `bg-blue-green-2`, `bg-error-tint`, `border-border-strong`, `ring-offset-surface`, and the `.tabular` utility. Existing `bg-cream` / `text-cream` keep working (alias). `shadow-sm|md|lg` become warm-tinted.

- [ ] **Step 1: Write the failing test**

Add to `packages/@basketeasy/ui/src/components/Card.test.tsx`:

```tsx
it('sits on the elevated surface, not the page ground', () => {
  render(<Card data-testid="card">Contenu</Card>);
  expect(screen.getByTestId('card')).toHaveClass('bg-surface');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/ui test -- Card`
Expected: FAIL — the class is `bg-cream`, not `bg-surface`.

- [ ] **Step 3: Replace the preset's theme block**

`packages/@basketeasy/ui/tailwind-preset.cjs`:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Surface ladder. Today body, Card, Dialog and Input are all #FAF5EF,
        // so nothing looks placed on anything. `cream` stays as an alias of
        // surface-2 so existing bg-cream / text-cream call sites keep working.
        ground: '#EFE4D4',
        surface: '#FFFCF7',
        'surface-2': '#FAF5EF',
        sunk: '#E9DDCA',
        cream: '#FAF5EF',

        orange: {
          DEFAULT: '#D4622A',
          // Darker shade of brand orange for text/foreground use. `orange`
          // (#D4622A) only measures 3.47:1 against cream (#FAF5EF) — below
          // WCAG AA's 4.5:1 for normal text. This shade keeps the same hue
          // and saturation, just darker, and measures 5.03:1 against cream.
          text: '#AA4F22',
          hover: '#95441C',
          tint: '#FBEDE4',
        },
        'blue-green': {
          DEFAULT: '#1E5F74',
          2: '#2F6E80',
          tint: '#EAF1F3',
        },
        charcoal: '#23201C',
        muted: '#5B564F',
        border: { DEFAULT: '#E7DECF', strong: '#D6C8B2' },
        error: { DEFAULT: '#B23A2E', tint: '#F7EAE8' },
        success: '#2F7D5C',
      },
      fontFamily: {
        heading: ['"Big Shoulders Display"', '"Arial Narrow"', 'sans-serif'],
        sans: ['"Atkinson Hyperlegible"', 'Verdana', 'system-ui', 'sans-serif'],
      },
      // Stock Tailwind shadows are neutral grey and read cold on a warm
      // ground. Overriding the scale upgrades every existing shadow-* call
      // site without touching one of them.
      boxShadow: {
        sm: '0 1px 2px rgba(59, 42, 24, 0.07)',
        DEFAULT: '0 2px 6px rgba(59, 42, 24, 0.08), 0 1px 2px rgba(59, 42, 24, 0.05)',
        md: '0 2px 6px rgba(59, 42, 24, 0.08), 0 1px 2px rgba(59, 42, 24, 0.05)',
        lg: '0 10px 28px rgba(59, 42, 24, 0.11), 0 2px 6px rgba(59, 42, 24, 0.06)',
      },
    },
  },
};
```

- [ ] **Step 4: Swap `bg-cream` → `bg-surface` on the elevated primitives**

In `Card.tsx:8`, `Dialog.tsx:27`, `DropdownMenu.tsx` content, `Toast.tsx` root: replace `bg-cream` with `bg-surface`.
In `Input.tsx:10`, `Textarea.tsx:11`, `Select.tsx` trigger: replace `bg-cream` with `bg-surface-2`.
Leave `text-cream` (foreground on filled buttons) alone.

- [ ] **Step 5: Update the global stylesheet**

`packages/@basketeasy/ui/src/styles/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Big Shoulders needs tighter leading than Barlow Condensed did. */
h1,
h2,
h3 {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 800;
  line-height: 0.94;
  letter-spacing: -0.005em;
}

/* Times, dates, counts and scores must hold their column. */
.tabular {
  font-variant-numeric: tabular-nums;
}
```

`app/src/index.css`:

```css
@import '@basketeasy/ui/styles/globals.css';

* {
  box-sizing: border-box;
}

body {
  @apply bg-ground text-charcoal;
  margin: 0;
  font-family: 'Atkinson Hyperlegible', Verdana, system-ui, sans-serif;
}
```

- [ ] **Step 6: Load the new faces**

`app/index.html`, replacing the existing `<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed…">`:

```html
<link
  href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=Atkinson+Hyperlegible:wght@400;700&display=swap"
  rel="stylesheet"
/>
```

Add the same `<link>` to `packages/@basketeasy/ui/.storybook/preview-head.html` (create it if absent — Storybook currently renders every story in a fallback sans-serif because it never loads the fonts), and change the preview's `backgrounds` default from `cream` to `#EFE4D4`.

- [ ] **Step 7: Update the brand document**

In `docs/brand.md`'s "Visual system" table, replace the two typography bullets with:

```markdown
- **Titrage (headings):** Big Shoulders Display, weight 700–800
- **Texte (body):** Atkinson Hyperlegible, weight 400–700
```

and add the four surface tokens (`sunk`, `ground`, `surface-2`, `surface`) as a second table beneath the brand colours, noting that `Crème #FAF5EF` is now `surface-2` rather than the page background.

- [ ] **Step 8: Run the full suite**

Run: `pnpm format && pnpm lint && pnpm test`
Expected: PASS. Any test asserting `bg-cream` on `Card`, `Dialog`, `Input`, `Textarea` or `Select` needs its expectation updated to the new token in the same commit — those are the only expected breakages.

- [ ] **Step 9: Commit**

```bash
git add packages/@basketeasy/ui app/index.html app/src/index.css docs/brand.md
git commit -m "feat(ui): add Parquet surface ladder, warm elevation and type pairing"
```

---

# Phase 2 — Primitives

### Task 2: One focus ring, applied everywhere

**Files:**

- Create: `packages/@basketeasy/ui/src/lib/focusRing.ts`
- Modify: `packages/@basketeasy/ui/package.json` (add `./focus-ring` export)
- Modify: `components/{Button,Input,Textarea,Select,Tabs,Checkbox,DropdownMenu,Dialog,Pagination}.tsx`
- Test: `packages/@basketeasy/ui/src/components/Tabs.test.tsx`

**Interfaces:**

- Consumes: `ring-offset-surface` from Task 1.
- Produces: `focusRing` — a `string` of Tailwind classes, imported as `import { focusRing } from '../lib/focusRing'` inside the package and `@basketeasy/ui/focus-ring` outside it.

- [ ] **Step 1: Write the failing test**

Add to `packages/@basketeasy/ui/src/components/Tabs.test.tsx`:

```tsx
it('gives every trigger a visible focus ring', () => {
  render(
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">Effectif</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Contenu</TabsContent>
    </Tabs>,
  );
  expect(screen.getByRole('tab', { name: 'Effectif' })).toHaveClass(
    'focus-visible:ring-2',
    'focus-visible:ring-orange',
    'focus-visible:ring-offset-surface',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/ui test -- Tabs`
Expected: FAIL — `TabsTrigger` has no focus classes at all.

- [ ] **Step 3: Create the shared recipe**

`packages/@basketeasy/ui/src/lib/focusRing.ts`:

```ts
/**
 * The single focus-visible recipe for every interactive primitive.
 *
 * Before this existed the package had five different recipes: Button set
 * ring-offset-2 with no ring-offset colour (so the halo rendered white on a
 * cream page), Checkbox set the colour but not the width, Select used
 * `focus:` where Input used `focus-visible:`, and Tabs/DropdownMenu had
 * nothing at all. Change the ring here, not at a call site.
 */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
```

- [ ] **Step 4: Export it**

In `packages/@basketeasy/ui/package.json`'s `exports`, alongside `"./cn"`:

```json
"./focus-ring": {
  "types": "./src/lib/focusRing.ts",
  "default": "./src/lib/focusRing.ts"
},
```

- [ ] **Step 5: Apply it to all nine primitives**

In each of `Button.tsx`, `Input.tsx`, `Textarea.tsx`, `Select.tsx` (trigger **and** item), `Tabs.tsx` (`TabsTrigger`), `Checkbox.tsx`, `DropdownMenu.tsx` (trigger **and** item), `Dialog.tsx` (close button), `Pagination.tsx`: delete the existing focus classes from the CVA base string and add `focusRing` into the `cn()`/`cva()` composition. Example for `Tabs.tsx`'s `TabsTrigger`:

```tsx
import { focusRing } from '../lib/focusRing';

className={cn(
  'inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all md:min-h-0',
  'data-[state=active]:bg-surface data-[state=active]:text-orange-text data-[state=active]:shadow-sm',
  focusRing,
  className,
)}
```

- [ ] **Step 6: Run the package suite**

Run: `pnpm --filter @basketeasy/ui test`
Expected: PASS, including the new Tabs assertion.

- [ ] **Step 7: Commit**

```bash
git add packages/@basketeasy/ui
git commit -m "fix(ui): apply one visible focus ring to every interactive primitive"
```

### Task 3: Button — real hover states and a loading state

**Files:**

- Modify: `packages/@basketeasy/ui/src/components/Button.tsx`
- Test: `packages/@basketeasy/ui/src/components/Button.test.tsx`
- Modify: `packages/@basketeasy/ui/src/components/Button.stories.tsx`

**Interfaces:**

- Consumes: `focusRing` (Task 2); `bg-blue-green-tint`, `bg-sunk`, `bg-orange-hover` (Task 1).
- Produces: `ButtonProps` gains `loading?: boolean` and `asChild?: boolean`. When `loading` is true the button is disabled, renders `Spinner` before its children, and sets `aria-busy="true"`. When `asChild` is true it renders its single child through Radix `Slot`, carrying the variant classes onto it — this is how a `<Link>` gets button styling (`<Button asChild><Link to="/x">…</Link></Button>`), used by Tasks 7, 10, 11 and 12.

- [ ] **Step 1: Write the failing tests**

Add to `Button.test.tsx`:

```tsx
it('shows a spinner and stays labelled while loading', () => {
  render(<Button loading>Enregistrer</Button>);
  const button = screen.getByRole('button', { name: /Enregistrer/ });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(button.querySelector('svg')).toBeInTheDocument();
});

it('gives the ghost variant a hover state distinct from the page', () => {
  render(<Button variant="ghost">Mes équipes</Button>);
  expect(screen.getByRole('button')).toHaveClass('hover:bg-blue-green-tint');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/ui test -- Button`
Expected: FAIL — `loading` is not a prop; ghost hover is `hover:bg-cream`.

- [ ] **Step 3: Implement**

`packages/@basketeasy/ui/src/components/Button.tsx`:

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';
import { Spinner } from './icons/Spinner';

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    focusRing,
  ),
  {
    variants: {
      variant: {
        default: 'bg-orange-text text-cream hover:bg-orange-hover shadow-sm hover:shadow',
        secondary: 'bg-blue-green text-cream hover:bg-blue-green-2',
        // hover:bg-cream used to be invisible: the page itself was cream.
        outline: 'border border-border-strong bg-surface text-charcoal hover:bg-sunk',
        ghost: 'bg-transparent text-charcoal hover:bg-blue-green-tint',
        destructive: 'bg-error text-cream hover:bg-error/90',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        default: 'h-11 px-4 text-sm md:h-10',
        lg: 'h-12 px-6 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, loading = false, asChild = false, disabled, children, ...props },
    ref,
  ) => {
    // asChild renders a <Link> (or any single child) with button styling, so
    // navigation stays a real anchor instead of a button with an onClick.
    // The button-only attributes are omitted in that mode.
    const Comp = asChild ? Slot : 'button';
    const buttonOnly = asChild
      ? {}
      : {
          type: props.type ?? 'button',
          disabled: disabled || loading,
          'aria-busy': loading || undefined,
        };

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...buttonOnly}
        {...props}
      >
        {loading && !asChild && (
          <Spinner className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        )}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/ui test -- Button`
Expected: PASS.

- [ ] **Step 5: Add the Slot dependency**

`@radix-ui/react-slot` is currently only a transitive dependency of the other Radix primitives. Add it explicitly:

```bash
pnpm --filter @basketeasy/ui add @radix-ui/react-slot
```

- [ ] **Step 6: Add the Storybook cases**

In `Button.stories.tsx`, add a `Loading` story (`<Button loading>Enregistrement…</Button>`) and an `AllVariants` story rendering all five variants side by side on a `bg-ground` wrapper so the hover states are checkable.

- [ ] **Step 7: Replace `disabled={isPending}` with `loading` at all 26 call sites**

Search: `rg "disabled=\{is[A-Z]" app/src`. For each, change `disabled={isPending}` to `loading={isPending}` and, where the label changes during the mutation (e.g. `{isPending ? 'Connexion…' : 'Se connecter'}`), keep the label swap — the spinner replaces the _ambiguity_, not the wording.

- [ ] **Step 8: Run the app suite**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/@basketeasy/ui app/src
git commit -m "feat(ui): give Button hover, loading and asChild support"
```

### Task 4: Skeleton loading

**Files:**

- Create: `packages/@basketeasy/ui/src/components/Skeleton.tsx`
- Create: `packages/@basketeasy/ui/src/components/Skeleton.test.tsx`
- Create: `packages/@basketeasy/ui/src/components/Skeleton.stories.tsx`
- Modify: `packages/@basketeasy/ui/package.json` (add `./skeleton` export)

**Interfaces:**

- Consumes: `bg-sunk` (Task 1).
- Produces: `<Skeleton className>` (a shimmer block) and `<SkeletonList rows={n} variant="row" | "card">` (n stacked placeholders at real row height, wrapped in a single `role="status"` with `aria-label="Chargement…"`).

- [ ] **Step 1: Write the failing test**

`packages/@basketeasy/ui/src/components/Skeleton.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, SkeletonList } from './Skeleton';

describe('Skeleton', () => {
  it('renders a shimmer block', () => {
    render(<Skeleton data-testid="block" />);
    expect(screen.getByTestId('block')).toHaveClass('animate-pulse', 'bg-sunk');
  });

  it('announces the list as busy exactly once', () => {
    render(<SkeletonList rows={5} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAccessibleName('Chargement…');
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/ui test -- Skeleton`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import { type HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-sunk', className)} {...props} />;
}

/**
 * A whole list's worth of placeholders at the real row height, so content
 * arriving does not shift the page. One role="status" for the group — not
 * one per row, which would announce N times.
 */
export function SkeletonList({
  rows = 3,
  variant = 'row',
  className,
}: {
  rows?: number;
  variant?: 'row' | 'card';
  className?: string;
}) {
  return (
    <div role="status" aria-label="Chargement…" className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          data-testid="skeleton-row"
          className={cn(
            'flex items-center gap-3 rounded-md border border-border bg-surface p-3',
            variant === 'card' && 'h-[76px]',
          )}
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex flex-grow flex-col gap-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3 opacity-70" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/ui test -- Skeleton`
Expected: PASS.

- [ ] **Step 5: Export and document**

Add `"./skeleton"` to `package.json`'s `exports` and write `Skeleton.stories.tsx` with `Block`, `RowList` and `CardList` stories.

- [ ] **Step 6: Commit**

```bash
git add packages/@basketeasy/ui
git commit -m "feat(ui): add Skeleton and SkeletonList placeholders"
```

### Task 5: SectionHeading — the court-line rule

**Files:**

- Create: `packages/@basketeasy/ui/src/components/SectionHeading.tsx` (+ `.test.tsx`, `.stories.tsx`)
- Modify: `packages/@basketeasy/ui/package.json` (add `./section-heading` export)
- Modify: `app/src/clubs/TeamRosterCards.tsx:33`, `app/src/clubs/TeamEventsAgenda.tsx:106`

**Interfaces:**

- Consumes: `bg-blue-green` (Task 1).
- Produces: `<SectionHeading as="h3" count={12}>Joueuses</SectionHeading>` — uppercase Big Shoulders label, optional count in parentheses, and a 2px blue-green rule filling the remaining width.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionHeading } from './SectionHeading';

describe('SectionHeading', () => {
  it('renders the label with its count as one accessible heading', () => {
    render(<SectionHeading count={12}>Joueuses</SectionHeading>);
    expect(screen.getByRole('heading', { name: 'Joueuses (12)' })).toBeInTheDocument();
  });

  it('omits the count when none is given', () => {
    render(<SectionHeading>Staff</SectionHeading>);
    expect(screen.getByRole('heading', { name: 'Staff' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/ui test -- SectionHeading`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

export function SectionHeading({
  as: Tag = 'h3',
  count,
  children,
  className,
}: {
  as?: 'h2' | 'h3';
  count?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3.5', className)}>
      <Tag className="m-0 font-heading text-xl font-bold uppercase tracking-[0.11em] text-muted">
        {children}
        {count !== undefined && ` (${count})`}
      </Tag>
      {/* Court line: the direction's structural motif, blue-green at low
          opacity so it reads as a rule rather than a divider. */}
      <span aria-hidden="true" className="h-0.5 flex-grow rounded-sm bg-blue-green/20" />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/ui test -- SectionHeading`
Expected: PASS.

- [ ] **Step 5: Replace the two hand-rolled call sites**

In `TeamRosterCards.tsx`, replace

```tsx
<Heading as="h3" size="xl" className="m-0 uppercase tracking-wide text-muted">
  {GROUP_LABEL[role](teamGender)} ({players.length})
</Heading>
```

with

```tsx
<SectionHeading count={players.length}>{GROUP_LABEL[role](teamGender)}</SectionHeading>
```

and the equivalent in `TeamEventsAgenda.tsx` with `<SectionHeading>{formatDayHeading(dayEvents[0].startsAt)}</SectionHeading>` (no count).

- [ ] **Step 6: Run both suites and commit**

```bash
pnpm test
git add packages/@basketeasy/ui app/src/clubs
git commit -m "feat(ui): add SectionHeading with the Parquet court-line rule"
```

---

# Phase 3 — Failure states

### Task 6: QueryError, and no more phantom empty states

**Files:**

- Create: `packages/@basketeasy/ui/src/components/QueryError.tsx` (+ `.test.tsx`, `.stories.tsx`)
- Modify: `packages/@basketeasy/ui/package.json` (add `./query-error` export)
- Modify: `app/src/pages/{DashboardPage,MyTeamsPage,MembersPage,TeamDetailPage}.tsx`
- Test: `app/src/pages/MyTeamsPage.test.tsx`

**Interfaces:**

- Consumes: `bg-error-tint`, `border-error` (Task 1); `Button` `loading` (Task 3).
- Produces: `<QueryError title? description? onRetry? />` — `role="alert"`, French default copy, a "Réessayer" button when `onRetry` is passed.

- [ ] **Step 1: Write the failing test**

Add to `app/src/pages/MyTeamsPage.test.tsx`:

```tsx
it('reports a failed load instead of claiming the user has no teams', async () => {
  server.use(
    http.get('/api/me/teams', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
  );
  renderWithProviders(<MyTeamsPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Chargement impossible');
  expect(screen.queryByText('Aucune équipe pour le moment')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- MyTeamsPage`
Expected: FAIL — the empty state renders, no alert exists.

- [ ] **Step 3: Implement the component**

`packages/@basketeasy/ui/src/components/QueryError.tsx`:

```tsx
import { Button } from './Button';
import { cn } from '../lib/cn';

/**
 * The failure branch of a query. Before this existed, a failed request fell
 * through to the list's EmptyState — so the app told the user their data did
 * not exist when it had merely failed to load.
 */
export function QueryError({
  title = 'Chargement impossible',
  description = 'Les données n’ont pas pu être récupérées. Vérifiez votre connexion.',
  onRetry,
  isRetrying = false,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border border-error/40 bg-error-tint p-4',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        aria-hidden="true"
        className="h-5 w-5 shrink-0 text-error"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.4h.01" />
      </svg>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-error">{title}</span>
        <span className="text-sm text-muted">{description}</span>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          loading={isRetrying}
          onClick={onRetry}
          className="ml-auto"
        >
          Réessayer
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire it into every list**

The branch order is always **error → loading → empty → data**, never empty-as-fallthrough. In `MyTeamsPage.tsx`:

```tsx
const { data: teams, isLoading, isError, refetch, isRefetching } = useMyTeamList();

// …

{isError ? (
  <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />
) : isLoading ? (
  <SkeletonList rows={3} />
) : teams && teams.length > 0 ? (
  /* existing table / card list */
) : (
  <EmptyState … />
)}
```

Apply the identical shape to: `DashboardPage.tsx` (agenda card, teams grid), `MembersPage.tsx` (3 tabs), `TeamDetailPage.tsx` (roster, clubs, admins, events tabs). Replace each `<Loader>Chargement...</Loader>` with `<SkeletonList>` at the matching row count.

- [ ] **Step 5: Fix the infinite spinner on team load**

`TeamDetailPage.tsx:336` currently reads `if (isLoadingTeam || !team) return <Loader>`. Split the three cases:

```tsx
const {
  data: team,
  isLoading: isLoadingTeam,
  isError: isTeamError,
  refetch,
} = useTeamShow(clubId!, teamId!);

if (isTeamError) {
  return (
    <PageContainer size="lg">
      <QueryError onRetry={() => refetch()} />
    </PageContainer>
  );
}

if (isLoadingTeam) {
  return (
    <PageContainer size="lg">
      <SkeletonList rows={4} variant="card" />
    </PageContainer>
  );
}

if (!team) {
  return (
    <PageContainer size="lg">
      <EmptyState
        icon={<TrophyIcon className="h-8 w-8 text-muted" />}
        title="Équipe introuvable"
        description="Cette équipe n’existe plus ou a été supprimée."
        action={<Button onClick={() => navigate('/my-teams')}>Mes équipes</Button>}
      />
    </PageContainer>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/@basketeasy/ui app/src
git commit -m "fix(app): surface query failures instead of rendering empty states"
```

### Task 7: Error boundary, 404 and 403

**Files:**

- Create: `app/src/components/AppErrorBoundary.tsx` (+ `.test.tsx`)
- Create: `app/src/pages/NotFoundPage.tsx` (+ `.test.tsx`)
- Create: `app/src/pages/ForbiddenPage.tsx`
- Modify: `app/src/App.tsx`, `app/src/auth/ProtectedRoute.tsx`, `app/src/pages/MembersPage.tsx:362`

**Interfaces:**

- Consumes: `QueryError` styling conventions (Task 6); `Button` `asChild` (Task 3); `EmptyState`, `PageContainer`.
- Produces: `<AppErrorBoundary>{children}</AppErrorBoundary>`; `NotFoundPage`; `<ForbiddenPage resource="club" name?={string} />`.

- [ ] **Step 1: Write the failing tests**

`app/src/pages/NotFoundPage.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { renderWithProviders } from '../testUtils';

describe('unknown routes', () => {
  it('renders a 404 in place rather than redirecting to the landing page', async () => {
    renderWithProviders(<App />, { route: '/clubs/does-not-exist/nope' });
    expect(await screen.findByRole('heading', { name: /Page introuvable/ })).toBeInTheDocument();
    expect(screen.queryByText('Moins de tableurs, plus de terrain.')).not.toBeInTheDocument();
  });
});
```

`app/src/components/AppErrorBoundary.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

describe('AppErrorBoundary', () => {
  it('renders a recovery screen instead of unmounting the app', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: /Une erreur est survenue/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recharger la page' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/app test -- NotFoundPage AppErrorBoundary`
Expected: FAIL — modules not found; `/clubs/does-not-exist/nope` currently redirects to `/`.

- [ ] **Step 3: Implement the boundary**

`app/src/components/AppErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Heading } from '@basketeasy/ui/heading';
import { PageContainer } from '@basketeasy/ui/page-container';

/**
 * Class component because React has no hook equivalent of
 * componentDidCatch. Without this, any render-time throw unmounts the whole
 * SPA to a white screen with no message and no way back.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <PageContainer size="md" centered>
        <div className="flex flex-col items-center gap-4 text-center">
          <Heading as="h1">Une erreur est survenue</Heading>
          <p className="text-muted">
            Quelque chose s’est mal passé de notre côté. Rechargez la page pour reprendre.
          </p>
          <Button onClick={() => window.location.reload()}>Recharger la page</Button>
        </div>
      </PageContainer>
    );
  }
}
```

- [ ] **Step 4: Implement the two pages**

`app/src/pages/NotFoundPage.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Heading } from '@basketeasy/ui/heading';
import { PageContainer } from '@basketeasy/ui/page-container';

export function NotFoundPage() {
  return (
    <PageContainer size="md" centered>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="font-heading text-5xl font-extrabold text-orange-text">404</span>
        <Heading as="h1">Page introuvable</Heading>
        <p className="text-muted">
          Ce lien ne mène nulle part. Il a peut-être été supprimé ou déplacé.
        </p>
        <Button asChild>
          <Link to="/dashboard">Retour au tableau de bord</Link>
        </Button>
      </div>
    </PageContainer>
  );
}
```

`app/src/pages/ForbiddenPage.tsx` — same shape, heading "Accès non autorisé", copy `Vous n’êtes pas administrateur de ce club.`, and a `Link to="/dashboard"`.

`Button asChild` comes from Task 3 — no further change to `Button` is needed here. For reference, that is what lets the CTA render as a link:

```tsx
import { Slot } from '@radix-ui/react-slot';
// …in Button: const Comp = asChild ? Slot : 'button';
```

- [ ] **Step 5: Wire the routes**

`app/src/App.tsx`:

```tsx
<Route path="*" element={<NotFoundPage />} />
```

replacing the `<Navigate to="/" replace />`. Wrap the whole tree:

```tsx
export default function App() {
  return (
    <AppErrorBoundary>
      <Routes>{/* … */}</Routes>
      <Toaster />
    </AppErrorBoundary>
  );
}
```

Move the catch-all **inside** the `ProtectedRoute` element as well, so an authenticated user's 404 keeps the app header:

```tsx
<Route element={<ProtectedRoute />}>
  {/* existing protected routes */}
  <Route path="/clubs/*" element={<NotFoundPage />} />
</Route>
```

In `MembersPage.tsx:362`, replace `return <Navigate to="/dashboard" replace />` with `return <ForbiddenPage />`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src
git commit -m "feat(app): add error boundary, 404 page and a real 403 state"
```

### Task 8: Never flash a blank screen

**Files:**

- Modify: `app/src/auth/ProtectedRoute.tsx`, `app/src/auth/PublicOnlyRoute.tsx`
- Modify: `app/src/components/AppHeader.tsx` (extract the shell)
- Test: `app/src/auth/ProtectedRoute.test.tsx` (create if absent)

**Interfaces:**

- Consumes: `Skeleton` (Task 4).
- Produces: `AppHeader` gains an optional `isResolving?: boolean` prop; when true it renders the brand plus skeleton nav placeholders and no interactive controls.

- [ ] **Step 1: Write the failing test**

```tsx
it('keeps the app shell on screen while the session resolves', () => {
  // Session request left pending: no MSW handler resolves before assertion.
  renderWithProviders(<ProtectedRoute />, { route: '/dashboard' });
  expect(screen.getByText('BasketEasy')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- ProtectedRoute`
Expected: FAIL — the component returns `null`, so nothing renders.

- [ ] **Step 3: Implement**

```tsx
export function ProtectedRoute() {
  const { user, isLoading } = useAccount();

  // Returning null here used to paint a blank white screen on every hard
  // load of a protected route — the header's shape is known before the user
  // is, so render it and let the nav fill in.
  if (isLoading) return <AppHeader isResolving />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      <AppHeader />
      <Outlet />
    </>
  );
}
```

In `AppHeader`, when `isResolving` is true render the brand wordmark and three `<Skeleton className="h-8 w-24" />` blocks in place of the nav, and skip the switcher and burger entirely.

`PublicOnlyRoute` keeps returning `null` while loading — `/login` has no shell to preserve — but add a comment saying so, since the asymmetry is deliberate.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/app test -- ProtectedRoute`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/auth app/src/components
git commit -m "fix(app): render the app shell while the session resolves"
```

### Task 9: Confirm before deleting a team

**Files:**

- Create: `packages/@basketeasy/ui/src/components/ConfirmDialog.tsx` (+ `.test.tsx`, `.stories.tsx`)
- Modify: `packages/@basketeasy/ui/package.json` (add `./confirm-dialog` export)
- Create: `app/src/clubs/TeamDeleteModal.tsx` (+ `.test.tsx`)
- Modify: `app/src/pages/TeamDetailPage.tsx:410-420`

**Interfaces:**

- Consumes: `Dialog`, `Button` (`loading`, `asChild`), `Alert`.
- Produces: `<ConfirmDialog trigger title description confirmLabel onConfirm isPending error? confirmWord? />`. When `confirmWord` is set, the confirm button stays disabled until the user types that exact string.

- [ ] **Step 1: Write the failing test**

`app/src/clubs/TeamDeleteModal.test.tsx`:

```tsx
it('requires typing the team name before deleting', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TeamDeleteModal clubId="c1" teamId="t1" teamName="U15 Filles" />);

  await user.click(screen.getByRole('button', { name: 'Supprimer' }));
  const confirm = screen.getByRole('button', { name: /Supprimer définitivement/ });
  expect(confirm).toBeDisabled();

  await user.type(screen.getByLabelText(/Saisissez/), 'U15 Filles');
  expect(confirm).toBeEnabled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- TeamDeleteModal`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ConfirmDialog`**

```tsx
import { useState, type ReactNode } from 'react';
import { Alert, AlertDescription } from './Alert';
import { Button } from './Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Dialog';
import { FormField } from './FormField';

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  confirmWord,
  onConfirm,
  isPending = false,
  error,
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmWord?: string;
  onConfirm: () => void;
  isPending?: boolean;
  error?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [typed, setTyped] = useState('');
  const canConfirm = confirmWord === undefined || typed.trim() === confirmWord;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {confirmWord !== undefined && (
            <FormField
              label={`Saisissez « ${confirmWord} » pour confirmer`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
            />
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange?.(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={!canConfirm}
              loading={isPending}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Implement `TeamDeleteModal`**

It owns its `open` state, calls `useTeamDelete`, and states the blast radius. Copy:

- title — `Supprimer l’équipe ?`
- description — `« {teamName} » sera supprimée définitivement, avec son effectif ({playerCount}) et tous ses événements ({eventCount}). Cette action est irréversible.`
- trigger — `<Button variant="destructive">Supprimer</Button>`
- confirmLabel — `Supprimer définitivement`
- `confirmWord={teamName}`
- on success — `navigate('/clubs/' + clubId + '/members?tab=teams')`

- [ ] **Step 5: Replace the one-click button**

In `TeamDetailPage.tsx`, delete `handleDelete`, the `deleteError` state and its `<Alert>`, and swap the button for `<TeamDeleteModal clubId={clubId!} teamId={teamId!} teamName={team.name} playerCount={allTeamPlayers.length} eventCount={events?.total ?? 0} />`. Change the "Modifier" button to `variant="outline"` (unchanged) so the two no longer look alike.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/@basketeasy/ui app/src
git commit -m "fix(app): gate team deletion behind a type-to-confirm dialog"
```

---

# Phase 4 — Navigation

### Task 10: Real links, an active state, and a reachable logout

**Files:**

- Modify: `app/src/components/AppHeader.tsx` (whole nav section)
- Create: `app/src/components/AccountMenu.tsx` (+ `.test.tsx`)
- Modify: `app/src/pages/DashboardPage.tsx:96-101` (remove the logout button)
- Test: `app/src/components/AppHeader.test.tsx`

**Interfaces:**

- Consumes: `Button` `asChild` (Task 3); `DropdownMenu`; `useLogout` from `app/src/auth/mutations`.
- Produces: `<AccountMenu />` — a `DropdownMenu` triggered by the user's initials, containing "Mon profil" (link) and "Se déconnecter" (button).

- [ ] **Step 1: Write the failing tests**

```tsx
it('renders navigation as links, not buttons', () => {
  renderWithProviders(<AppHeader />);
  expect(screen.getByRole('link', { name: 'Tableau de bord' })).toHaveAttribute(
    'href',
    '/dashboard',
  );
});

it('marks the current page for assistive tech', () => {
  renderWithProviders(<AppHeader />, { route: '/my-teams' });
  expect(screen.getByRole('link', { name: 'Mes équipes' })).toHaveAttribute('aria-current', 'page');
});

it('offers logout from any page via the account menu', async () => {
  const user = userEvent.setup();
  renderWithProviders(<AppHeader />, { route: '/account' });
  await user.click(screen.getByRole('button', { name: /Mon compte/ }));
  expect(await screen.findByRole('menuitem', { name: 'Se déconnecter' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/app test -- AppHeader`
Expected: FAIL — nav items are buttons; no `aria-current`; no account menu.

- [ ] **Step 3: Implement a `NavLink` wrapper**

Inside `AppHeader.tsx`:

```tsx
import { NavLink } from 'react-router-dom';

function HeaderLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          buttonVariants({ variant: 'ghost' }),
          'justify-start no-underline',
          // The active treatment: orange tint plus the court-line underline.
          isActive &&
            'bg-orange-tint text-orange-text shadow-[inset_0_-2px_0_theme(colors.orange.DEFAULT)]',
        )
      }
    >
      {children}
    </NavLink>
  );
}
```

`NavLink` sets `aria-current="page"` itself when active, so nothing extra is needed for that assertion. Replace all five `<Button variant="ghost" onClick={() => go(…)}>` items with `<HeaderLink to={…}>`. Keep the mobile burger as a `<Button>` — it toggles, it does not navigate. Make the brand wordmark a `<Link to={user ? '/dashboard' : '/'}>`.

Add `<nav aria-label="Navigation principale">` to the header's `<nav>` and a skip link as the header's first child:

```tsx
<a
  href="#contenu"
  className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lg"
>
  Aller au contenu
</a>
```

and give `PageContainer` an `id="contenu"` target (add `id` passthrough to its props).

- [ ] **Step 4: Implement `AccountMenu`**

```tsx
export function AccountMenu() {
  const { user } = useAccount();
  const { mutate: logout, isPending } = useLogout();
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Mon compte">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials || '·'}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="break-all">{user?.email}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/account">Mon profil</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isPending} onSelect={() => logout()}>
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Mount it at the right end of the header's desktop nav and inside the mobile panel. Delete the "Mon profil" `HeaderLink` (it now lives in the menu) and remove the logout `<Button>` from `DashboardPage.tsx:96-101` along with its now-unused `useLogout` import.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS. `DashboardPage.test.tsx`'s logout assertions move to `AppHeader.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add app/src
git commit -m "feat(app): link-based nav with an active state and a global account menu"
```

### Task 11: Link-ify the remaining navigation controls

**Files:**

- Modify: `app/src/pages/MyTeamsPage.tsx:54-59,81-87`
- Modify: `app/src/pages/DashboardPage.tsx:41-47,69-74`
- Modify: `app/src/clubs/TeamRow.tsx`, `app/src/clubs/PlayerRow.tsx` (any "Voir" control)
- Test: `app/src/pages/DashboardPage.test.tsx`

**Interfaces:**

- Consumes: `Button` `asChild` (Task 3).
- Produces: nothing new — this task only changes element types.

- [ ] **Step 1: Write the failing test**

```tsx
it('makes agenda rows openable in a new tab', async () => {
  renderWithProviders(<DashboardPage />);
  const row = await screen.findByRole('link', { name: /U15 Filles/ });
  expect(row).toHaveAttribute('href', '/clubs/club-1/teams/team-1?tab=events');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- DashboardPage`
Expected: FAIL — `AgendaRow` renders a `<button>`, so no `link` role exists.

- [ ] **Step 3: Convert each control**

`AgendaRow` becomes a `<Link>` carrying the same classes:

```tsx
<Link
  to={`/clubs/${event.clubId}/teams/${event.teamId}?tab=events`}
  className="flex w-full flex-col gap-1 rounded-md border border-border bg-surface-2 p-3 text-left no-underline shadow-sm transition hover:border-orange hover:shadow"
>
```

`TeamCard`'s and `MyTeamRow`/`MyTeamCard`'s "Voir l'équipe" become `<Button asChild variant="outline"><Link to={…}>Voir l’équipe</Link></Button>`. Same for every other `onClick={() => navigate(...)}` that is pure navigation — `rg "onClick=\{\(\) => navigate\(" app/src` must return only mutation-then-navigate handlers when this task is done.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src
git commit -m "fix(app): make every navigating control a real link"
```

### Task 12: A back link that goes where you came from

**Files:**

- Create: `app/src/clubs/backLink.ts` (+ `backLink.test.ts`)
- Modify: `app/src/pages/TeamDetailPage.tsx:346-348`
- Modify: `app/src/pages/MembersPage.tsx` (Équipes tab "Voir"), `app/src/pages/MyTeamsPage.tsx`, `app/src/pages/DashboardPage.tsx` (team cards)

**Interfaces:**

- Consumes: `react-router-dom`'s `useLocation`.
- Produces: `type TeamOrigin = { from: 'members'; clubId: string } | { from: 'my-teams' } | { from: 'dashboard' }` and `useBackLink(): { to: string; label: string }`, defaulting to `{ to: '/my-teams', label: '← Mes équipes' }` when `location.state` carries no origin.

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useBackLink } from './backLink';

describe('useBackLink', () => {
  it('returns to the club roster when that is where the user came from', () => {
    const { result } = renderHook(() => useBackLink(), {
      wrapper: ({ children }) => (
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/clubs/c1/teams/t1',
              state: { origin: { from: 'members', clubId: 'c1' } },
            },
          ]}
        >
          {children}
        </MemoryRouter>
      ),
    });
    expect(result.current).toEqual({
      to: '/clubs/c1/members?tab=teams',
      label: '← Effectif du club',
    });
  });

  it('falls back to Mes équipes on a direct link or refresh', () => {
    const { result } = renderHook(() => useBackLink(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/clubs/c1/teams/t1']}>{children}</MemoryRouter>
      ),
    });
    expect(result.current).toEqual({ to: '/my-teams', label: '← Mes équipes' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- backLink`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { useLocation } from 'react-router-dom';

export type TeamOrigin =
  { from: 'members'; clubId: string } | { from: 'my-teams' } | { from: 'dashboard' };

const FALLBACK = { to: '/my-teams', label: '← Mes équipes' } as const;

/**
 * Resolves where "back" should go from a team page. The link used to be
 * hardcoded to /my-teams regardless of entry path, so a club admin who
 * arrived via Effectif → Équipes → Voir was sent to a page they had never
 * visited, losing their table position and filters. State is absent on a
 * direct link or a refresh, hence the fallback.
 */
export function useBackLink(): { to: string; label: string } {
  const origin = (useLocation().state as { origin?: TeamOrigin } | null)?.origin;
  if (!origin) return { ...FALLBACK };
  if (origin.from === 'members') {
    return { to: `/clubs/${origin.clubId}/members?tab=teams`, label: '← Effectif du club' };
  }
  if (origin.from === 'dashboard') return { to: '/dashboard', label: '← Tableau de bord' };
  return { ...FALLBACK };
}
```

- [ ] **Step 4: Pass the origin at every entry point**

Each `<Link to={teamPath}>` gains `state={{ origin }}`: `{ from: 'members', clubId }` from `MembersPage`'s Équipes tab, `{ from: 'my-teams' }` from `MyTeamsPage`, `{ from: 'dashboard' }` from `DashboardPage`'s team cards and agenda rows.

In `TeamDetailPage.tsx`, replace the hardcoded button with:

```tsx
const backLink = useBackLink();
// …
<Button asChild variant="ghost" className="self-start">
  <Link to={backLink.to}>{backLink.label}</Link>
</Button>;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src
git commit -m "fix(app): resolve the team back link from where the user came from"
```

---

# Phase 5 — Compositions

### Task 13: Event cards — the time block and an accessible RSVP control

**Files:**

- Modify: `app/src/clubs/TeamEventsAgenda.tsx` (`AgendaEventCard`)
- Modify: `app/src/clubs/EventRsvpControl.tsx` (whole component)
- Test: `app/src/clubs/EventRsvpControl.test.tsx`

**Interfaces:**

- Consumes: `focusRing` (Task 2); `SectionHeading` (Task 5); `bg-blue-green`, `bg-surface-2` (Task 1).
- Produces: no new exports — `EventRsvpControl`'s public props are unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
it('exposes the selected response to assistive tech, not just by colour', () => {
  renderWithProviders(
    <EventRsvpControl clubId="c1" teamId="t1" event={{ ...event, myRsvpStatus: 'GOING' }} />,
  );
  const group = screen.getByRole('radiogroup', { name: 'Ma réponse' });
  expect(within(group).getByRole('radio', { name: 'Présent' })).toBeChecked();
  expect(within(group).getByRole('radio', { name: 'Absent' })).not.toBeChecked();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- EventRsvpControl`
Expected: FAIL — no `radiogroup` role exists; the buttons carry no checked state.

- [ ] **Step 3: Implement the accessible control**

In `EventRsvpControl.tsx`, wrap the segments in `<div role="radiogroup" aria-label="Ma réponse">` and give each segment `role="radio"` plus `aria-checked={active}`. Add a non-colour cue so the selection survives greyscale and colour-blindness — an inset shadow on the active segment:

```tsx
className={cn(
  'flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-sm font-semibold transition-colors md:px-3.5',
  'disabled:pointer-events-none disabled:opacity-50',
  focusRing,
  index > 0 && 'border-l border-border-strong',
  active
    ? cn(ACTIVE_CLASSES[option.value], 'shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]')
    : 'bg-surface text-muted hover:bg-sunk',
)}
```

Replace the template-literal className concatenation with `cn()` throughout the file (it is one of five places bypassing the design system's own merge helper). Keep `<span className="hidden md:inline">{option.label}</span>` — `aria-label` already carries the accessible name at every width.

- [ ] **Step 4: Rebuild the agenda card with the time block**

In `AgendaEventCard`, replace the current header row with the Parquet layout: a fixed-width leading block carrying the time and the type, then the content column.

```tsx
<Card className="flex flex-row overflow-hidden p-0">
  <div
    className={cn(
      'flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 py-4 sm:w-24',
      event.type === 'MATCH'
        ? 'bg-blue-green text-cream'
        : 'border-r border-border bg-surface-2 text-charcoal',
    )}
  >
    <span className="tabular font-heading text-2xl font-extrabold leading-none sm:text-3xl">
      {formatEventTime(event.startsAt)}
    </span>
    <span className="font-heading text-xs font-bold uppercase tracking-[0.13em] opacity-80">
      {eventTypeLabel(event.type)}
    </span>
  </div>
  <div className="flex min-w-0 flex-grow flex-col gap-3.5 p-4">{/* existing content */}</div>
</Card>
```

The `Badge` previously carrying the type moves into the block, so drop it from the badge row; keep the "Convoqué" badge.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS. `TeamEventsAgenda.test.tsx` assertions that query the type badge need re-pointing at the time block in this commit.

- [ ] **Step 6: Commit**

```bash
git add app/src/clubs
git commit -m "feat(app): Parquet event cards with an accessible RSVP radiogroup"
```

### Task 14: Deduplicate the two breakdown components

**Files:**

- Create: `app/src/clubs/EventRosterBreakdown.tsx` (+ `.test.tsx`)
- Modify: `app/src/clubs/EventRsvpBreakdown.tsx`, `app/src/clubs/EventConvocationBreakdown.tsx` (become thin wrappers)

**Interfaces:**

- Consumes: `Avatar`, `Button`, `cn`.
- Produces: `<EventRosterBreakdown entries label openLabel closedLabel summary meterValue meterMax meterClassName isOpen onToggle />` where `entries: { id: string; firstName: string; lastName: string; role: string; statusLabel: string; statusClassName: string; filled: boolean }[]`.

- [ ] **Step 1: Write the failing test**

```tsx
it('shows a filled dot and a text label for every roster entry', () => {
  render(
    <EventRosterBreakdown
      isOpen
      onToggle={() => {}}
      openLabel="Masquer les réponses"
      closedLabel="Voir les réponses"
      summary="8/12 confirmés"
      entries={[
        {
          id: '1',
          firstName: 'Léa',
          lastName: 'Moreau',
          role: 'Joueuse',
          statusLabel: 'Présente',
          statusClassName: 'text-success',
          filled: true,
        },
      ]}
    />,
  );
  expect(screen.getByText('Présente')).toBeInTheDocument();
  expect(screen.getByText('Léa Moreau')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- EventRosterBreakdown`
Expected: FAIL — module not found.

- [ ] **Step 3: Extract the shared shell**

Lift the collapsible card + row markup (identical in both files today — compare `EventRsvpBreakdown.tsx:23-38` with `EventConvocationBreakdown.tsx:16-31`) into `EventRosterBreakdown`, adding the progress meter from the Parquet mockup:

```tsx
<div className="flex items-center gap-2">
  <div className="h-1.5 w-[74px] overflow-hidden rounded-full bg-sunk">
    <div className={cn('h-full rounded-full', meterClassName)} style={undefined} />
  </div>
  <span className="tabular text-xs font-semibold text-muted">{summary}</span>
</div>
```

The meter width must come from a Tailwind class, not an inline style (Global Constraints): pass one of a fixed set (`w-0 w-1/4 w-1/3 w-1/2 w-2/3 w-3/4 w-full`) computed by rounding `meterValue / meterMax` to the nearest sixth, in a `meterWidthClass()` helper colocated in the file.

`EventRsvpBreakdown` and `EventConvocationBreakdown` keep their current props and their own `use*` hooks and status-to-label mapping; they render `EventRosterBreakdown` and nothing else.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS — the existing `EventConvocationBreakdown.test.tsx` must keep passing untouched, which is the proof the refactor preserved behaviour.

- [ ] **Step 5: Commit**

```bash
git add app/src/clubs
git commit -m "refactor(app): share one roster-breakdown shell between RSVP and convocations"
```

### Task 15: TeamDetailPage consistency pass

**Files:**

- Modify: `app/src/pages/TeamDetailPage.tsx`
- Modify: `app/src/pages/MembersPage.tsx:368-370,380`
- Create: `app/src/clubs/TeamEditModal.tsx`
- Test: `app/src/pages/TeamDetailPage.test.tsx`

**Interfaces:**

- Consumes: `useIsDesktopViewport` from `app/src/hooks`; `Dialog`.
- Produces: `<TeamEditModal clubId teamId team open onOpenChange />`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('collapses the partner-club table to cards on a phone', () => {
  window.innerWidth = 375;
  renderWithProviders(<TeamDetailPage />, { route: '/clubs/c1/teams/t1?tab=clubs' });
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('names the club in the roster page heading', () => {
  renderWithProviders(<MembersPage />, { route: '/clubs/c1/members' });
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Effectif · ASB Rezé');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/app test -- TeamDetailPage MembersPage`
Expected: FAIL — the table always renders; the heading is the bare string "Effectif du club".

- [ ] **Step 3: Apply the four fixes**

1. **Mobile collapse.** Import `useIsDesktopViewport` in `TeamDetailPage` and gate the Clubs partenaires and Administrateurs tables the way `MembersPage` already does, with `TeamClubCard` / `TeamAdminCard` counterparts modelled on `TeamListingCard`.
2. **Team edit becomes a dialog.** Move the inline edit block (`TeamDetailPage.tsx:350-397`) into `TeamEditModal`, mirroring `EventEditModal`'s shape. The page header no longer swaps out; "Modifier" opens the dialog.
3. **Name the club.** `MembersPage`'s `<Heading as="h1">` becomes `Effectif · {club?.name ?? '…'}` using the existing `useClubShow(clubId)`.
4. **Preserve sibling query params.** Both `setSearchParams({ tab: value }, { replace: true })` call sites become:

```tsx
onValueChange={(value) =>
  setSearchParams(
    (previous) => {
      const next = new URLSearchParams(previous);
      next.set('tab', value);
      return next;
    },
    { replace: true },
  )
}
```

5. **Make `/about` reachable.** It is registered at `App.tsx:29` and nothing links to it (`rg "/about" app/src` returns only that line). Add an "À propos" `DropdownMenuItem` to `AccountMenu`, or delete the route and `AboutPage.tsx` outright — decide with the owner, do not leave it orphaned.

6. **Normalise the ellipsis.** `rg "Chargement\.\.\." app/src` finds 10 sites using three periods against one using `…` (`DashboardPage.tsx:136`). Replace all with `Chargement…`, matching the placeholders that already use the character.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src
git commit -m "fix(app): mobile-collapse team tables, dialog-ise team edit, name the club"
```

### Task 16: One feedback convention

**Files:**

- Modify: `app/src/clubs/*.tsx` (every mutation call site), `app/src/pages/AccountPage.tsx`
- Modify: `CLAUDE.md` ("Working conventions")
- Test: `app/src/clubs/TeamPlayerAddForm.test.tsx`

**Interfaces:**

- Consumes: `toast` from `@basketeasy/ui/toast-store`.
- Produces: no new exports; a documented rule.

- [ ] **Step 1: Write the failing test**

```tsx
it('confirms a successful add with a toast', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TeamPlayerAddForm clubId="c1" teamId="t1" addablePlayers={[player]} />);
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(await screen.findByText('Joueur ajouté à l’effectif')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- TeamPlayerAddForm`
Expected: FAIL — the form closes silently; nothing is announced.

- [ ] **Step 3: Apply the rule everywhere**

The rule: **inline `FieldError`/`Alert` for validation bound to a field or a form; `toast()` for the outcome of a completed mutation.** In each mutation's `onSuccess`, add a `toast({ variant: 'success', title: … })`; keep `onError` inline only where the error is field-specific, otherwise `toast({ variant: 'destructive', … })`.

- [ ] **Step 4: Document it**

Add to `CLAUDE.md`'s "Working conventions", next to the modals-vs-inline paragraph:

```markdown
- **Feedback:** inline `FieldError`/`Alert` is for validation bound to a field or a form — it renders next to the input that is wrong. `toast()` (from `@basketeasy/ui/toast-store`, rendered by the single `<Toaster />` in `App.tsx`) is for the outcome of a _completed_ mutation, success or failure, because the control that triggered it may have closed (a `Dialog`) or scrolled out of view (a deep tab). Never use both for the same event, and never render a mutation result far from where it was triggered without a toast.
```

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test
git add app/src CLAUDE.md
git commit -m "fix(app): one feedback convention — inline for validation, toast for outcomes"
```

---

# Phase 6 — Landing

### Task 17: Landing page rewrite

**Files:**

- Modify: `app/src/pages/LandingPage.tsx` (whole file)
- Create: `app/src/components/PublicHeader.tsx`
- Test: `app/src/pages/LandingPage.test.tsx`

**Interfaces:**

- Consumes: `SectionHeading` (Task 5); `Button` `asChild` (Task 3).
- Produces: `<PublicHeader />` — the marketing header, shared by the landing page and any future public route.

- [ ] **Step 1: Write the failing test**

```tsx
it('presents shipped features without a "Bientôt" badge', () => {
  renderWithProviders(<LandingPage />);
  const shipped = screen.getByRole('heading', { name: 'Calendrier & convocations' });
  expect(within(shipped.closest('article')!).queryByText('Bientôt')).not.toBeInTheDocument();
});

it('still marks unbuilt features as upcoming', () => {
  renderWithProviders(<LandingPage />);
  const upcoming = screen.getByRole('heading', { name: 'Cotisations en ligne' });
  expect(within(upcoming.closest('article')!).getByText('Bientôt')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/app test -- LandingPage`
Expected: FAIL — all nine cards carry `badge: 'Bientôt'` today.

- [ ] **Step 3: Split the content lists honestly**

Replace the single `FEATURES` array with two. `SHIPPED` (no badge) — Calendrier & convocations, Présences suivies, Équipes multi-clubs (CTC) — matching what `CLAUDE.md`'s Events and Teams module sections say actually exists. `UPCOMING` (badged) — Cotisations en ligne, Créneaux & conflits, Feuille de marque par IA. Delete the file-header comment claiming "only the Auth module is built so far"; it has been wrong since the Clubs module landed.

- [ ] **Step 4: Rebuild the page structure**

Two-column hero (copy left, a product mock of the agenda card right), a stats band using the CD44 market figures from `docs/brand.md` (~130 clubs, 28 000 licenciés) **labelled as the market, not as customers**, the shipped-features grid, the dashed "La suite" band, a blue-green CTA band, then the existing footer line. Extract the header into `PublicHeader.tsx` so the landing page stops duplicating brand/CTA logic (audit finding 2.7).

- [ ] **Step 5: Check it at a phone width**

Run `pnpm dev:app`, open the preview at 375px, and fix any wrapping headline, squashed grid, or text below 14px before committing.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src
git commit -m "feat(app): rewrite the landing page for the Parquet direction"
```

---

## Final verification

- [ ] `pnpm format:check` — passes
- [ ] `pnpm lint` — passes with `--max-warnings 0`
- [ ] `pnpm test` — passes in both packages
- [ ] `pnpm build` — passes
- [ ] `rg "bg-\[#|text-\[#|style=\{\{" app/src packages/@basketeasy/ui/src` — no matches
- [ ] `rg "isError" app/src` — a match in every page with a query
- [ ] `rg "onClick=\{\(\) => navigate\(" app/src` — only mutation-then-navigate handlers remain
- [ ] Storybook (`pnpm --filter @basketeasy/ui storybook`) renders in Big Shoulders + Atkinson on a `ground` background
- [ ] Keyboard walk: tab through header → tabs → a roster card → RSVP control, and confirm the focus ring is visible at every stop
- [ ] `docs/brand.md`, `CLAUDE.md` and `docs/ux-audit/README.md` updated to match what shipped
