# BasketEasy — Design System (`@basketeasy/ui`) Design

## Goal

Provide a reusable, brand-styled component library so the frontend team stops hand-rolling
buttons/inputs/cards per page. Matches the stack already decided in `docs/frontend-stack.md`
(Tailwind CSS + shadcn/ui-style Radix primitives, separate `packages/@basketeasy/ui` package)
and the tokens in `docs/brand.md`.

## Package layout

```
packages/@basketeasy/ui/
  package.json              # @basketeasy/ui
  tailwind-preset.cjs       # shared Tailwind theme (colors, fonts) — consumed by app + this package
  postcss.config.cjs
  tsconfig.json
  .storybook/                # Storybook 8, Vite builder
  src/
    lib/cn.ts                # clsx + tailwind-merge helper
    components/
      button.tsx / button.stories.tsx
      input.tsx / input.stories.tsx
      textarea.tsx / textarea.stories.tsx
      label.tsx / label.stories.tsx
      select.tsx / select.stories.tsx
      checkbox.tsx / checkbox.stories.tsx
      card.tsx / card.stories.tsx
      badge.tsx / badge.stories.tsx
      avatar.tsx / avatar.stories.tsx
      alert.tsx / alert.stories.tsx
      dialog.tsx / dialog.stories.tsx
      tabs.tsx / tabs.stories.tsx
      table.tsx / table.stories.tsx
      tooltip.tsx / tooltip.stories.tsx
    styles/globals.css        # Tailwind layers + BasketEasy CSS variables
```

No barrel `index.ts` — each component is its own subpath export in `package.json#exports`
(`@basketeasy/ui/button`, `@basketeasy/ui/card`, ...), same convention as `@basketeasy/types`.

## Components (14, "core" tier)

Button, Input, Textarea, Label, Select, Checkbox, Card, Badge, Avatar, Alert, Dialog, Tabs,
Table, Tooltip. Each built on the matching Radix primitive where one exists (Select, Checkbox,
Dialog, Tabs, Tooltip, Avatar), plain styled elements otherwise (Button, Input, Textarea, Label,
Card, Badge, Alert, Table). Variants via `class-variance-authority` (e.g. Button: default /
secondary / outline / ghost / destructive; size sm/default/lg).

## Styling approach

- `tailwind-preset.cjs` exports the brand tokens (`orange #D4622A`, `blue-green #1E5F74`,
  `cream #FAF5EF`, `charcoal #23201C`, plus a muted/border pair already in `app/src/index.css`)
  as Tailwind theme colors, and Barlow Condensed / Inter as `font-heading` / `font-sans`.
- Both `packages/@basketeasy/ui` (for Storybook) and `app` (for real usage) point their
  `tailwind.config` at this shared preset — single source of truth for the theme.
- Components are source (TSX), not precompiled CSS — Tailwind scans consumer `content` globs
  that include `node_modules/@basketeasy/ui/src/**/*.{ts,tsx}` (pnpm workspace = real files,
  not a build artifact, so this works without a build step for dev).

## App integration

`app` currently has no Tailwind at all (plain `index.css` with CSS custom properties). This
work adds Tailwind + PostCSS + Autoprefixer to `app`, with `tailwind.config` extending the
shared preset. `app/src/index.css` keeps its `:root` custom properties (used elsewhere) and
gains `@tailwind base/components/utilities` layers. No existing page is redesigned — this is
infrastructure only, not a visual migration of `HealthStatus.tsx`.

## Docs/visual verification

Storybook (Vite builder, matching the app's existing Vite tooling) inside
`packages/@basketeasy/ui`, one story file per component showing its variants. Run via
`pnpm --filter @basketeasy/ui storybook`. No deployment/publishing of Storybook in this change.

## Testing

Each component gets a colocated `*.test.tsx` (Vitest + React Testing Library, matching the
`app` convention) covering: renders, variant class application, and any interactive behavior
(e.g. Dialog open/close, Checkbox toggle, Select value change).

## Out of scope

- Redesigning existing app pages/components to use the new library (follow-up work).
- Extended-tier components (DropdownMenu, Popover, Toast, Accordion, etc.) — add when a page
  actually needs them.
- Storybook deployment/CI publishing.
- Icon set (`docs/frontend-stack.md` calls for a custom icon set — separate piece of work).
