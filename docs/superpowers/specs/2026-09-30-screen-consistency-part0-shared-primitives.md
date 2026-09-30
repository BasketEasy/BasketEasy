# Screen consistency, Part 0: shared primitives

Status: plan (Part 0 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Grammaire commune » (rules 1, 2, 3, 6).

The match page built its header out of event-specific components. Every other screen needs the same
shapes, so they move to shared components first, with **no visual change** to the event page. Each
later screen plan imports these; none of them re-derives a hero.

## 1. `@basketeasy/ui/page-header` (`PageHeader`)

Tab-root title block (rule 1).

```tsx
<PageHeader title="Mes équipes" meta="4 équipes" actions={<Button …/>} />
```

- `div.flex.flex-wrap.items-end.gap-3` → `div.flex.min-w-0.flex-1.flex-col.gap-1.5` holding
  `Heading as="h1" size="hero"` and, when `meta` is set, `Text variant="meta"` (`ReactNode`, so a
  caller can pass `tabular` content); then `actions` (`div.flex.shrink-0.gap-2`).
- `titleRef?: Ref<HTMLHeadingElement>` forwarded to the `h1` (the import flow focuses its heading on
  step change).
- Stories: title only, title + meta, title + meta + action. Test: one `h1`, meta rendered only when
  set.

## 2. `@basketeasy/ui/fact-tile` (`FactTile`)

`EventHeroLocation`'s inset block, generalised (rules 2, 3).

```tsx
<FactTile icon={<MapPinIcon />} label="Gymnase de la Trocardière" detail="Rue …" tone="accent"
  trailing={<Button size="icon-responsive" …/>} actions={<Button …/>} />
```

- `Card variant="inset" tone={tone}` (`tone`: `neutral` | `accent`, default `neutral`) with `flex flex-col gap-2.5`.
- Head row `flex items-center gap-2.5` (`items-start` when `tone="accent"`, matching the unknown-venue
  block): `IconBadge tone={tone === 'accent' ? 'accent' : 'structure'}` wrapping `icon`, then
  `div.flex.min-w-0.flex-1.flex-col.gap-px` with `Text as="span" variant="label" size="sm"
className="break-words"`{label} and, when set, `Text as="span" variant="meta" size="xs"
className="break-words"`{detail}; then `trailing`.
- `actions` renders under it in `div.flex.gap-2` (callers pass `className="flex-1"` on the buttons
  that should fill).
- No colour or size prop beyond `tone`: closed prop API.
- Stories: neutral with one action, accent with a filled action, with `trailing`. Test: accent tone
  puts the accent classes on the card and the badge; `detail` optional.

## 3. `@basketeasy/ui/page-hero` (`PageHero`)

`EventDetailHero`'s card, generalised (rule 2).

```tsx
<PageHero badges={<>…</>} eyebrow="ASC Rezé Basket" title="Seniors M1" titleAction={…}
  meta="Seniors · Masculin · 12 joueurs" aside={<FactTile …/>} />
```

- `Card className="flex flex-col gap-3.5 p-4 md:grid md:grid-cols-2 md:items-center md:gap-6 md:p-6"`
  (today's `EventDetailHero` classes, unchanged).
- Left column `div.flex.min-w-0.flex-col.gap-2`: `badges` (wrapped in `div.flex.flex-wrap.items-center.gap-2`
  only when set), `Text variant="eyebrow"`{eyebrow} when set, a row `div.flex.items-start.gap-3` with
  `Heading as="h1" size="hero" className="m-0 min-w-0 flex-1"` and `titleAction` (the mobile edit
  icon), then `Text variant="meta" className="tabular"`{meta}.
- Right column: `aside` in a `div` (grid cell) when set; without `aside` the card is one column at
  every width (`md:grid-cols-1`, via a `cva` boolean, not a caller class).
- Test: `h1` text, eyebrow before the `h1` in DOM order, no aside cell without `aside`.

## 4. Button `size="icon-responsive"`

Rule 6. `h-9 w-9 px-0 md:w-auto md:px-3` + the `sm` text size, added to `buttonVariants.size` beside
`icon`. The caller renders the icon and a `span.hidden.md:inline` label and passes `aria-label`
(the label is invisible below `md`). This replaces the `className="w-9 shrink-0 gap-1.5 px-0
md:w-auto md:px-3"` override in `EventHeroLocation` (closed prop API). Add a story and a test that
the class set is applied.

## 5. `PageBar` and `PageBackLink` (`app/src/components/PageBar.tsx`)

Move `app/src/clubs/EventPageBar.tsx` here and rename: `EventPageBar` → `PageBar`, `EventBackLink`
→ `PageBackLink`; the `teamName` prop becomes `title` (the bar can name a club, « Mon compte », …).
It stays in the app, not the UI package: it renders `react-router`'s `Link`, which
`@basketeasy/ui` does not depend on. `aria-label` stays « Retour à {title} ». Doc comment: the bar
belongs to any depth-2 page, not only events.

`EventDetailPage` switches its two imports; `EventPageBar.test.tsx` moves to
`app/src/components/PageBar.test.tsx` with the prop rename.

## 6. Migrate the event page onto them

- `EventDetailHero` renders `PageHero` (badges, eyebrow team name, title, meta, `aside` =
  `EventHeroLocation`). Its doc comment keeps the « why » and points to `PageHero` for the shape.
- `EventHeroLocation` renders `FactTile` for both branches (accent with « Ajouter le lieu », neutral
  with Itinéraire + the `icon-responsive` « Modifier le lieu »).
- **No pixel change**: screenshot the event page (manager, known venue; manager, unknown venue;
  player) at 390 and 1280 before and after and put both in the PR. `EventDetailHero.test.tsx`,
  `EventHeroLocation.test.tsx` and `EventDetailPage.test.tsx` pass unchanged (queries are by role and
  text, not class).

## 7. Package wiring

- `packages/@basketeasy/ui/package.json` `exports`: `./page-header`, `./page-hero`, `./fact-tile`.
- CLAUDE.md, « Design direction — Parquet » › « Signature elements »: one bullet naming the page
  types (tab root → `PageHeader`; entity → `PageHero` + `FactTile`; depth ≥ 2 → `PageBar`) with a
  link to the design record.
- Dead code: after §6 nothing imports `EventPageBar`/`EventBackLink` from `app/src/clubs/`; the file
  is gone (moved), not left as a re-export.

## 8. Verification

`pnpm --filter @basketeasy/ui test -- PageHeader PageHero FactTile Button`,
`pnpm --filter @basketeasy/app test -- EventDetail EventHeroLocation PageBar`, eslint + prettier on
the touched files. Screenshots per §6.
