# Design System (`@basketeasy/ui`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new `@basketeasy/ui` workspace package with 14 core, brand-styled, Radix-based
components, wired into `app` via Tailwind, with Storybook for visual verification.

**Architecture:** shadcn/ui-style source components (not a black-box npm dep) inside
`packages/@basketeasy/ui`, styled with Tailwind CSS using a shared preset for BasketEasy brand
tokens. `app` adds Tailwind and consumes the components directly from workspace source.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS 3, Radix UI primitives, class-variance-authority,
clsx, tailwind-merge, Storybook 8 (Vite builder), Vitest + React Testing Library.

## Global Constraints

- TypeScript strict mode (matches `app`/`server` — see root `CLAUDE.md`).
- No barrel `index.ts` — every component is its own subpath export in `package.json#exports`,
  matching the `@basketeasy/types` convention (root `CLAUDE.md`).
- Prettier formatting (`pnpm format` before committing) and ESLint per package.
- Colocated tests (`*.test.tsx`), Vitest + React Testing Library (root `CLAUDE.md`).
- Brand tokens exactly as in `docs/brand.md`: orange `#D4622A`, blue-green `#1E5F74`,
  cream `#FAF5EF`, charcoal `#23201C`; Barlow Condensed (headings), Inter (body).
- pnpm workspace glob is `packages/@basketeasy/*` (already covers the new package, no
  `pnpm-workspace.yaml` change needed).

---

## Task 1: Scaffold `@basketeasy/ui` package + Tailwind preset

**Files:**

- Create: `packages/@basketeasy/ui/package.json`
- Create: `packages/@basketeasy/ui/tsconfig.json`
- Create: `packages/@basketeasy/ui/tailwind-preset.cjs`
- Create: `packages/@basketeasy/ui/postcss.config.cjs`
- Create: `packages/@basketeasy/ui/.eslintrc.cjs`
- Create: `packages/@basketeasy/ui/src/lib/cn.ts`
- Test: `packages/@basketeasy/ui/src/lib/cn.test.ts`

**Interfaces:**

- Produces: `cn(...inputs: ClassValue[]): string` from `src/lib/cn.ts`, exported as
  `@basketeasy/ui/cn`. Later component tasks import it as
  `import { cn } from '../lib/cn'`.
- Produces: `tailwind-preset.cjs` exporting a Tailwind `Config` object (colors: `orange`,
  `blueGreen`, `cream`, `charcoal`, `muted`, `border`; fontFamily: `heading` → Barlow Condensed,
  `sans` → Inter). Consumed by Task 8 (Storybook) and Task 15 (app integration).

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@basketeasy/ui",
  "version": "0.0.0",
  "private": true,
  "description": "BasketEasy design system components",
  "type": "module",
  "exports": {
    "./cn": { "types": "./src/lib/cn.ts", "default": "./src/lib/cn.ts" }
  },
  "scripts": {
    "lint": "eslint . --ext ts,tsx --max-warnings 0",
    "lint:fix": "eslint . --ext ts,tsx --fix",
    "test": "vitest run",
    "test:watch": "vitest",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  },
  "peerDependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.2",
    "@radix-ui/react-checkbox": "^1.1.1",
    "@radix-ui/react-dialog": "^1.1.1",
    "@radix-ui/react-avatar": "^1.1.0",
    "@radix-ui/react-select": "^2.1.1",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-tooltip": "^1.1.2",
    "@radix-ui/react-label": "^2.1.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^7.18.0",
    "@typescript-eslint/parser": "^7.18.0",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react-hooks": "^4.6.2",
    "jsdom": "^24.1.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "vite": "^5.4.1",
    "@vitejs/plugin-react": "^4.3.1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json** (mirror `app/tsconfig.json`'s compilerOptions — strict,
      jsx: react-jsx, module: ESNext, moduleResolution: bundler — `include: ["src"]`)

- [ ] **Step 3: Create tailwind-preset.cjs**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        orange: '#D4622A',
        'blue-green': '#1E5F74',
        cream: '#FAF5EF',
        charcoal: '#23201C',
        muted: '#5B564F',
        border: '#E7DECF',
      },
      fontFamily: {
        heading: ['"Barlow Condensed"', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
```

- [ ] **Step 4: Create postcss.config.cjs**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Create .eslintrc.cjs** (mirror `app/.eslintrc.cjs`, drop `react-refresh` plugin
      since this package has no dev server HMR entrypoint)

- [ ] **Step 6: Write cn.ts**

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 7: Write cn.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('resolves conflicting tailwind classes to the last one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy values', () => {
    expect(cn('px-2', false && 'py-1', undefined, 'text-sm')).toBe('px-2 text-sm');
  });
});
```

- [ ] **Step 8: Install deps and run test**

Run: `pnpm install && pnpm --filter @basketeasy/ui test`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add packages/@basketeasy/ui pnpm-lock.yaml
git commit -m "feat(ui): scaffold @basketeasy/ui package with cn() util"
```

---

## Task 2: Button + Badge + Label (no external primitive)

**Files:**

- Create: `packages/@basketeasy/ui/src/components/button.tsx`
- Test: `packages/@basketeasy/ui/src/components/button.test.tsx`
- Create: `packages/@basketeasy/ui/src/components/badge.tsx`
- Test: `packages/@basketeasy/ui/src/components/badge.test.tsx`
- Create: `packages/@basketeasy/ui/src/components/label.tsx`
- Test: `packages/@basketeasy/ui/src/components/label.test.tsx`
- Modify: `packages/@basketeasy/ui/package.json` (add 3 export entries)

**Interfaces:**

- Consumes: `cn` from `../lib/cn` (Task 1).
- Produces: `Button` (props: `variant?: 'default'|'secondary'|'outline'|'ghost'|'destructive'`,
  `size?: 'sm'|'default'|'lg'`, plus native `ButtonHTMLAttributes`), exported from
  `@basketeasy/ui/button`.
- Produces: `Badge` (props: `variant?: 'default'|'secondary'|'outline'`), exported from
  `@basketeasy/ui/badge`.
- Produces: `Label` (native `LabelHTMLAttributes`), exported from `@basketeasy/ui/label`. Later
  tasks (Input, Textarea, Select, Checkbox stories) pair with this.

- [ ] **Step 1: Write button.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Valider</Button>);
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
  });

  it('applies the secondary variant class', () => {
    render(<Button variant="secondary">Annuler</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-blue-green');
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Cliquer</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Désactivé</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @basketeasy/ui test button`
Expected: FAIL — `./button` module not found

- [ ] **Step 3: Write button.tsx**

```tsx
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-orange text-cream hover:bg-orange/90',
        secondary: 'bg-blue-green text-cream hover:bg-blue-green/90',
        outline: 'border border-border bg-transparent text-charcoal hover:bg-cream',
        ghost: 'bg-transparent text-charcoal hover:bg-cream',
        destructive: 'bg-red-600 text-white hover:bg-red-600/90',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        default: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @basketeasy/ui test button`
Expected: PASS (4 tests)

- [ ] **Step 5: Write badge.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Actif</Badge>);
    expect(screen.getByText('Actif')).toBeInTheDocument();
  });

  it('applies the outline variant class', () => {
    render(<Badge variant="outline">Inactif</Badge>);
    expect(screen.getByText('Inactif')).toHaveClass('border');
  });
});
```

- [ ] **Step 6: Write badge.tsx**

```tsx
import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
  {
    variants: {
      variant: {
        default: 'bg-orange text-cream',
        secondary: 'bg-blue-green text-cream',
        outline: 'border border-border text-charcoal',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

- [ ] **Step 7: Write label.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Label } from './label';

describe('Label', () => {
  it('renders and associates with a form control via htmlFor', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <input id="email" />
      </>,
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Write label.tsx**

```tsx
import { type LabelHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-sm font-medium text-charcoal', className)} {...props} />
  ),
);
Label.displayName = 'Label';
```

- [ ] **Step 9: Run full test suite, verify all pass**

Run: `pnpm --filter @basketeasy/ui test`
Expected: PASS (9 tests total: 3 cn + 4 button + 2 badge + 1 label = 10, count may vary — all green)

- [ ] **Step 10: Add exports to package.json**

```json
"./button": { "types": "./src/components/button.tsx", "default": "./src/components/button.tsx" },
"./badge": { "types": "./src/components/badge.tsx", "default": "./src/components/badge.tsx" },
"./label": { "types": "./src/components/label.tsx", "default": "./src/components/label.tsx" }
```

- [ ] **Step 11: Commit**

```bash
git add packages/@basketeasy/ui
git commit -m "feat(ui): add Button, Badge, Label components"
```

---

## Task 3: Input, Textarea, Card, Alert

**Files:**

- Create: `packages/@basketeasy/ui/src/components/input.tsx` + `.test.tsx`
- Create: `packages/@basketeasy/ui/src/components/textarea.tsx` + `.test.tsx`
- Create: `packages/@basketeasy/ui/src/components/card.tsx` + `.test.tsx`
- Create: `packages/@basketeasy/ui/src/components/alert.tsx` + `.test.tsx`
- Modify: `packages/@basketeasy/ui/package.json` (4 export entries)

**Interfaces:**

- Consumes: `cn` from `../lib/cn`.
- Produces: `Input` (native `InputHTMLAttributes<HTMLInputElement>`) from `@basketeasy/ui/input`.
- Produces: `Textarea` (native `TextareaHTMLAttributes<HTMLTextAreaElement>`) from
  `@basketeasy/ui/textarea`.
- Produces: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
  (all `HTMLAttributes<HTMLDivElement>` except `CardTitle` which is `HTMLAttributes<HTMLHeadingElement>`)
  from `@basketeasy/ui/card`.
- Produces: `Alert` (props: `variant?: 'default'|'destructive'`), `AlertTitle`, `AlertDescription`
  from `@basketeasy/ui/alert`.

- [ ] **Step 1: Write input.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Input } from './input';

describe('Input', () => {
  it('renders with a placeholder', () => {
    render(<Input placeholder="Nom du club" />);
    expect(screen.getByPlaceholderText('Nom du club')).toBeInTheDocument();
  });

  it('accepts typed input', async () => {
    render(<Input aria-label="club" />);
    const input = screen.getByLabelText('club');
    await userEvent.type(input, 'AS Basket');
    expect(input).toHaveValue('AS Basket');
  });

  it('is disabled when disabled prop is set', () => {
    render(<Input aria-label="club" disabled />);
    expect(screen.getByLabelText('club')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Write input.tsx**

```tsx
import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
```

- [ ] **Step 3: Write textarea.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('accepts typed input', async () => {
    render(<Textarea aria-label="notes" />);
    const textarea = screen.getByLabelText('notes');
    await userEvent.type(textarea, 'Bonne saison');
    expect(textarea).toHaveValue('Bonne saison');
  });
});
```

- [ ] **Step 4: Write textarea.tsx**

```tsx
import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[80px] w-full rounded-md border border-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
```

- [ ] **Step 5: Write card.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('renders title, description and content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>AS Basket</CardTitle>
          <CardDescription>Club de Loire-Atlantique</CardDescription>
        </CardHeader>
        <CardContent>42 licenciés</CardContent>
      </Card>,
    );
    expect(screen.getByText('AS Basket')).toBeInTheDocument();
    expect(screen.getByText('Club de Loire-Atlantique')).toBeInTheDocument();
    expect(screen.getByText('42 licenciés')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Write card.tsx**

```tsx
import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border border-border bg-cream shadow-sm', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('font-heading text-xl font-bold leading-none text-charcoal', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';
```

- [ ] **Step 7: Write alert.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert, AlertDescription, AlertTitle } from './alert';

describe('Alert', () => {
  it('renders title and description', () => {
    render(
      <Alert>
        <AlertTitle>Créneau annulé</AlertTitle>
        <AlertDescription>La salle est indisponible ce soir.</AlertDescription>
      </Alert>,
    );
    expect(screen.getByText('Créneau annulé')).toBeInTheDocument();
    expect(screen.getByText('La salle est indisponible ce soir.')).toBeInTheDocument();
  });

  it('has role alert', () => {
    render(<Alert>Message</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('applies the destructive variant class', () => {
    render(<Alert variant="destructive">Erreur</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('border-red-600');
  });
});
```

- [ ] **Step 8: Write alert.tsx**

```tsx
import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const alertVariants = cva('relative w-full rounded-lg border p-4', {
  variants: {
    variant: {
      default: 'border-border bg-cream text-charcoal',
      destructive: 'border-red-600 bg-red-50 text-red-900',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  ),
);
Alert.displayName = 'Alert';

export const AlertTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 font-heading text-base font-bold leading-none', className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';
```

- [ ] **Step 9: Run full test suite**

Run: `pnpm --filter @basketeasy/ui test`
Expected: PASS, all green

- [ ] **Step 10: Add exports to package.json**

```json
"./input": { "types": "./src/components/input.tsx", "default": "./src/components/input.tsx" },
"./textarea": { "types": "./src/components/textarea.tsx", "default": "./src/components/textarea.tsx" },
"./card": { "types": "./src/components/card.tsx", "default": "./src/components/card.tsx" },
"./alert": { "types": "./src/components/alert.tsx", "default": "./src/components/alert.tsx" }
```

- [ ] **Step 11: Commit**

```bash
git add packages/@basketeasy/ui
git commit -m "feat(ui): add Input, Textarea, Card, Alert components"
```

---

## Task 4: Checkbox, Avatar (Radix-based)

**Files:**

- Create: `packages/@basketeasy/ui/src/components/checkbox.tsx` + `.test.tsx`
- Create: `packages/@basketeasy/ui/src/components/avatar.tsx` + `.test.tsx`
- Modify: `packages/@basketeasy/ui/package.json` (2 export entries)

**Interfaces:**

- Consumes: `cn` from `../lib/cn`, `@radix-ui/react-checkbox`, `@radix-ui/react-avatar`.
- Produces: `Checkbox` (props: `CheckboxPrimitive.CheckboxProps`, forwards `checked`/`onCheckedChange`)
  from `@basketeasy/ui/checkbox`.
- Produces: `Avatar`, `AvatarImage`, `AvatarFallback` from `@basketeasy/ui/avatar`.

- [ ] **Step 1: Write checkbox.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('renders unchecked by default', () => {
    render(<Checkbox aria-label="présent" />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('calls onCheckedChange when toggled', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="présent" onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Write checkbox.tsx**

```tsx
import { forwardRef } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from './icons/check';
import { cn } from '../lib/cn';

export const Checkbox = forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-border ring-offset-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-orange data-[state=checked]:text-cream',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="h-3 w-3" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';
```

- [ ] **Step 3: Write a minimal inline Check icon** (avoids pulling an icon library — matches
      `docs/frontend-stack.md`'s "custom icon set" note; this is a placeholder glyph, not the full
      icon set from that future work item)

Create `packages/@basketeasy/ui/src/components/icons/check.tsx`:

```tsx
import { type SVGProps } from 'react';

export function Check(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} {...props}>
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 4: Run test, verify passes**

Run: `pnpm --filter @basketeasy/ui test checkbox`
Expected: PASS (2 tests)

- [ ] **Step 5: Write avatar.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, AvatarFallback } from './avatar';

describe('Avatar', () => {
  it('renders the fallback initials', () => {
    render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText('AB')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Write avatar.tsx**

```tsx
import { forwardRef } from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '../lib/cn';

export const Avatar = forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
    {...props}
  />
));
Avatar.displayName = 'Avatar';

export const AvatarImage = forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn('aspect-square h-full w-full', className)}
    {...props}
  />
));
AvatarImage.displayName = 'AvatarImage';

export const AvatarFallback = forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-blue-green text-sm font-medium text-cream',
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = 'AvatarFallback';
```

- [ ] **Step 7: Run full test suite**

Run: `pnpm --filter @basketeasy/ui test`
Expected: PASS, all green

- [ ] **Step 8: Add exports to package.json**

```json
"./checkbox": { "types": "./src/components/checkbox.tsx", "default": "./src/components/checkbox.tsx" },
"./avatar": { "types": "./src/components/avatar.tsx", "default": "./src/components/avatar.tsx" }
```

- [ ] **Step 9: Commit**

```bash
git add packages/@basketeasy/ui
git commit -m "feat(ui): add Checkbox, Avatar components"
```

---

## Task 5: Select, Tabs (Radix-based)

**Files:**

- Create: `packages/@basketeasy/ui/src/components/select.tsx` + `.test.tsx`
- Create: `packages/@basketeasy/ui/src/components/tabs.tsx` + `.test.tsx`
- Modify: `packages/@basketeasy/ui/package.json` (2 export entries)

**Interfaces:**

- Consumes: `cn` from `../lib/cn`, `@radix-ui/react-select`, `@radix-ui/react-tabs`.
- Produces: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from
  `@basketeasy/ui/select` (thin wrapper re-exporting `Root`/`Value` from Radix, styled
  `Trigger`/`Content`/`Item`).
- Produces: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@basketeasy/ui/tabs`.

- [ ] **Step 1: Write tabs.test.tsx** (Radix Select requires `hasPointerCapture`/`scrollIntoView`
      polyfills under jsdom that aren't worth the setup cost here — Tabs has simpler interaction
      semantics and is tested directly; Select gets a render-only smoke test in Step 5)

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

describe('Tabs', () => {
  it('shows the default tab content and switches on click', async () => {
    render(
      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Effectif</TabsTrigger>
          <TabsTrigger value="calendar">Calendrier</TabsTrigger>
        </TabsList>
        <TabsContent value="roster">Liste des joueurs</TabsContent>
        <TabsContent value="calendar">Prochains matchs</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('Liste des joueurs')).toBeInTheDocument();
    expect(screen.queryByText('Prochains matchs')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Calendrier' }));
    expect(screen.getByText('Prochains matchs')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write tabs.tsx**

```tsx
import { forwardRef } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../lib/cn';

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex h-10 items-center rounded-md bg-border/40 p-1', className)}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-charcoal transition-colors data-[state=active]:bg-cream data-[state=active]:text-orange data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-2', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';
```

- [ ] **Step 3: Run test, verify passes**

Run: `pnpm --filter @basketeasy/ui test tabs`
Expected: PASS

- [ ] **Step 4: Write select.tsx**

```tsx
import { forwardRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '../lib/cn';

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between rounded-md border border-border bg-cream px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-orange disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    {children}
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn('z-50 rounded-md border border-border bg-cream shadow-md', className)}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-sm px-3 py-2 text-sm text-charcoal outline-none data-[highlighted]:bg-orange data-[highlighted]:text-cream',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';
```

- [ ] **Step 5: Write select.test.tsx** (smoke test only — see Step 1 rationale)

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

describe('Select', () => {
  it('renders the trigger with a placeholder', () => {
    render(
      <Select>
        <SelectTrigger aria-label="équipe">
          <SelectValue placeholder="Choisir une équipe" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="u13">U13</SelectItem>
          <SelectItem value="u15">U15</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByText('Choisir une équipe')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run full test suite**

Run: `pnpm --filter @basketeasy/ui test`
Expected: PASS, all green

- [ ] **Step 7: Add exports to package.json**

```json
"./select": { "types": "./src/components/select.tsx", "default": "./src/components/select.tsx" },
"./tabs": { "types": "./src/components/tabs.tsx", "default": "./src/components/tabs.tsx" }
```

- [ ] **Step 8: Commit**

```bash
git add packages/@basketeasy/ui
git commit -m "feat(ui): add Select, Tabs components"
```

---

## Task 6: Dialog, Tooltip (Radix-based)

**Files:**

- Create: `packages/@basketeasy/ui/src/components/dialog.tsx` + `.test.tsx`
- Create: `packages/@basketeasy/ui/src/components/tooltip.tsx` + `.test.tsx`
- Modify: `packages/@basketeasy/ui/package.json` (2 export entries)

**Interfaces:**

- Consumes: `cn` from `../lib/cn`, `Check` icon from `./icons/check` (reused as close-icon glyph
  is out of scope — Dialog uses Radix's default close-button text "×" instead, see Step 2),
  `@radix-ui/react-dialog`, `@radix-ui/react-tooltip`.
- Produces: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`,
  `DialogDescription` from `@basketeasy/ui/dialog`.
- Produces: `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` from
  `@basketeasy/ui/tooltip`.

- [ ] **Step 1: Write dialog.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './dialog';

describe('Dialog', () => {
  it('opens content when the trigger is clicked', async () => {
    render(
      <Dialog>
        <DialogTrigger>Ouvrir</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le créneau</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByText('Supprimer le créneau')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Ouvrir'));
    expect(screen.getByText('Supprimer le créneau')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write dialog.tsx**

```tsx
import { forwardRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export const DialogContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-charcoal/50" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-cream p-6 shadow-lg',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 text-charcoal/60 hover:text-charcoal">
        ×
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
}

export const DialogTitle = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('font-heading text-xl font-bold text-charcoal', className)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';
```

- [ ] **Step 3: Run test, verify passes**

Run: `pnpm --filter @basketeasy/ui test dialog`
Expected: PASS

- [ ] **Step 4: Write tooltip.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

describe('Tooltip', () => {
  it('shows content on hover', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Info</TooltipTrigger>
          <TooltipContent>Détails du créneau</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    await userEvent.hover(screen.getByText('Info'));
    expect(await screen.findByText('Détails du créneau')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Write tooltip.tsx**

```tsx
import { forwardRef } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../lib/cn';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 rounded-md bg-charcoal px-3 py-1.5 text-xs text-cream shadow-md',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = 'TooltipContent';
```

- [ ] **Step 6: Run full test suite**

Run: `pnpm --filter @basketeasy/ui test`
Expected: PASS, all green

- [ ] **Step 7: Add exports to package.json**

```json
"./dialog": { "types": "./src/components/dialog.tsx", "default": "./src/components/dialog.tsx" },
"./tooltip": { "types": "./src/components/tooltip.tsx", "default": "./src/components/tooltip.tsx" }
```

- [ ] **Step 8: Commit**

```bash
git add packages/@basketeasy/ui
git commit -m "feat(ui): add Dialog, Tooltip components"
```

---

## Task 7: Table

**Files:**

- Create: `packages/@basketeasy/ui/src/components/table.tsx` + `.test.tsx`
- Modify: `packages/@basketeasy/ui/package.json` (1 export entry)

**Interfaces:**

- Consumes: `cn` from `../lib/cn`.
- Produces: `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`,
  `TableCell` from `@basketeasy/ui/table`.

- [ ] **Step 1: Write table.test.tsx**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

describe('Table', () => {
  it('renders headers and rows', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Joueur</TableHead>
            <TableHead>Poste</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Lucas Martin</TableCell>
            <TableCell>Meneur</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Joueur')).toBeInTheDocument();
    expect(screen.getByText('Lucas Martin')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write table.tsx**

```tsx
import { forwardRef } from 'react';
import { cn } from '../lib/cn';

export const Table = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  ),
);
Table.displayName = 'Table';

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('border-b border-border', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('divide-y divide-border', className)} {...props} />
));
TableBody.displayName = 'TableBody';

export const TableFooter = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot ref={ref} className={cn('border-t border-border font-medium', className)} {...props} />
));
TableFooter.displayName = 'TableFooter';

export const TableRow = forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('transition-colors hover:bg-border/20', className)} {...props} />
  ),
);
TableRow.displayName = 'TableRow';

export const TableHead = forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn('h-10 px-3 text-left align-middle font-medium text-muted', className)}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

export const TableCell = forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('p-3 align-middle text-charcoal', className)} {...props} />
));
TableCell.displayName = 'TableCell';
```

- [ ] **Step 3: Run test, verify passes**

Run: `pnpm --filter @basketeasy/ui test table`
Expected: PASS

- [ ] **Step 4: Add export to package.json**

```json
"./table": { "types": "./src/components/table.tsx", "default": "./src/components/table.tsx" }
```

- [ ] **Step 5: Commit**

```bash
git add packages/@basketeasy/ui
git commit -m "feat(ui): add Table component"
```

---

## Task 8: Storybook setup + one story per component

**Files:**

- Create: `packages/@basketeasy/ui/.storybook/main.ts`
- Create: `packages/@basketeasy/ui/.storybook/preview.ts`
- Create: `packages/@basketeasy/ui/src/styles/globals.css`
- Create: `packages/@basketeasy/ui/src/components/*.stories.tsx` (14 files, one per component)
- Modify: `packages/@basketeasy/ui/package.json` (add storybook devDependencies)

**Interfaces:**

- Consumes: every component export from Task 2–7, and `tailwind-preset.cjs` from Task 1.
- Produces: nothing consumed by later tasks — Storybook is a leaf/dev-only tool.

- [ ] **Step 1: Add Storybook devDependencies to package.json**

```json
"storybook": "^8.2.9",
"@storybook/react": "^8.2.9",
"@storybook/react-vite": "^8.2.9",
"@storybook/addon-essentials": "^8.2.9"
```

- [ ] **Step 2: Create src/styles/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Create .storybook/main.ts**

```ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/components/**/*.stories.tsx'],
  addons: ['@storybook/addon-essentials'],
  framework: { name: '@storybook/react-vite', options: {} },
};

export default config;
```

- [ ] **Step 4: Create .storybook/preview.ts**

```ts
import type { Preview } from '@storybook/react';
import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    backgrounds: { default: 'cream', values: [{ name: 'cream', value: '#FAF5EF' }] },
  },
};

export default preview;
```

- [ ] **Step 5: Create a tailwind.config.cjs for Storybook to pick up**

```js
const preset = require('./tailwind-preset.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
};
```

- [ ] **Step 6: Write button.stories.tsx** (pattern repeated per component in Step 7)

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = { args: { children: 'Valider', variant: 'default' } };
export const Secondary: Story = { args: { children: 'Annuler', variant: 'secondary' } };
export const Outline: Story = { args: { children: 'Voir plus', variant: 'outline' } };
export const Ghost: Story = { args: { children: 'Fermer', variant: 'ghost' } };
export const Destructive: Story = { args: { children: 'Supprimer', variant: 'destructive' } };
export const Disabled: Story = { args: { children: 'Indisponible', disabled: true } };
```

- [ ] **Step 7: Write remaining 13 story files, one variant-showcase each**

Same `Meta`/`StoryObj` pattern as Step 6, one file per remaining component
(`badge.stories.tsx`, `label.stories.tsx`, `input.stories.tsx`, `textarea.stories.tsx`,
`card.stories.tsx`, `alert.stories.tsx`, `checkbox.stories.tsx`, `avatar.stories.tsx`,
`select.stories.tsx`, `tabs.stories.tsx`, `dialog.stories.tsx`, `tooltip.stories.tsx`,
`table.stories.tsx`), each exporting a `Default` story plus one story per documented variant
from that component's `cva` `variants` config (Task 2–7 list each component's variants).
Compound components (Card, Select, Dialog, Tabs, Table, Tooltip, Avatar) compose their
sub-parts inside the story `render` function using realistic BasketEasy copy (club names,
French UI strings), matching the style already used in the test files above.

- [ ] **Step 8: Install deps and run Storybook build to verify it compiles**

Run: `pnpm install && pnpm --filter @basketeasy/ui build-storybook`
Expected: exits 0, `storybook-static/` produced

- [ ] **Step 9: Commit**

```bash
git add packages/@basketeasy/ui
git commit -m "feat(ui): add Storybook and stories for all components"
```

---

## Task 9: Wire Tailwind into `app`

**Files:**

- Create: `app/tailwind.config.js`
- Create: `app/postcss.config.js`
- Modify: `app/src/index.css`
- Modify: `app/package.json` (add tailwindcss, postcss, autoprefixer, @basketeasy/ui deps)
- Modify: `app/src/App.tsx` (smoke-test one `@basketeasy/ui` component renders)
- Modify: `app/src/App.test.tsx` (update if the smoke-test addition changes existing assertions)

**Interfaces:**

- Consumes: `tailwind-preset.cjs` from `@basketeasy/ui` (Task 1), `Button` from
  `@basketeasy/ui/button` (Task 2).

- [ ] **Step 1: Read current App.tsx and App.test.tsx**

Run: `cat app/src/App.tsx app/src/App.test.tsx`

- [ ] **Step 2: Add dependencies to app/package.json**

```json
"dependencies": {
  "@basketeasy/types": "workspace:*",
  "@basketeasy/ui": "workspace:*",
  "react": "^18.3.1",
  "react-dom": "^18.3.1"
},
"devDependencies": {
  "autoprefixer": "^10.4.20",
  "postcss": "^8.4.41",
  "tailwindcss": "^3.4.10"
}
```

(merge into the existing `devDependencies` block rather than replacing it)

- [ ] **Step 3: Create app/tailwind.config.js**

```js
const preset = require('@basketeasy/ui/tailwind-preset.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [preset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@basketeasy/ui/src/**/*.{ts,tsx}',
  ],
};
```

- [ ] **Step 4: Create app/postcss.config.js**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Add Tailwind layers to app/src/index.css**

Add at the very top of the existing file (keep every existing rule below untouched — the
`:root` custom properties stay, since nothing in this task migrates existing styling):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Add a Button import to App.tsx as a smoke test**

Read the current file first (Step 1 output). Add `import { Button } from '@basketeasy/ui/button';`
and render one `<Button>` somewhere in the existing JSX tree (e.g. next to `HealthStatus`) —
exact placement depends on the current file structure; preserve all existing content.

- [ ] **Step 7: Install deps**

Run: `pnpm install`
Expected: exits 0

- [ ] **Step 8: Run app tests**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS — if `App.test.tsx` asserts on exact rendered text/structure, update it to
account for the added Button (read the actual failure output and fix precisely, don't guess)

- [ ] **Step 9: Run app build to verify Tailwind compiles in production build**

Run: `pnpm --filter @basketeasy/app build`
Expected: exits 0

- [ ] **Step 10: Commit**

```bash
git add app pnpm-lock.yaml
git commit -m "feat(app): wire up Tailwind and consume @basketeasy/ui Button"
```

---

## Task 10: Full workspace verification + PR

**Files:** none (verification only)

- [ ] **Step 1: Format check**

Run: `pnpm format:check`
Expected: exits 0 — if it fails, run `pnpm format` and re-check

- [ ] **Step 2: Lint everything**

Run: `pnpm lint`
Expected: exits 0 for `server`, `app`, `@basketeasy/types`, `@basketeasy/ui`

- [ ] **Step 3: Test everything**

Run: `pnpm test`
Expected: exits 0 for all packages

- [ ] **Step 4: Build everything**

Run: `pnpm build`
Expected: exits 0 for all packages

- [ ] **Step 5: Push branch and open PR**

```bash
git push -u origin claude/complete-design-system-d9b311
gh pr create --title "feat: add @basketeasy/ui design system package" --body "$(cat <<'EOF'
## Summary
- New `@basketeasy/ui` workspace package: 14 core, brand-styled, Radix-based components (Button, Input, Textarea, Label, Select, Checkbox, Card, Badge, Avatar, Alert, Dialog, Tabs, Table, Tooltip)
- Shared Tailwind preset carrying the BasketEasy brand tokens from `docs/brand.md`
- Storybook for visual verification of every component/variant
- `app` wired up to Tailwind and consuming the new package

## Test plan
- [x] `pnpm format:check`
- [x] `pnpm lint`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm --filter @basketeasy/ui build-storybook`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed
