# Screen consistency: Landing (`/`)

Status: plan (screen 16 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: no artboard (marketing page, out of the product grammar); rules 4 and 8 of « Grammaire commune » apply to its product mock only.
Depends on: nothing.

Page type: **marketing**. File: `app/src/pages/LandingPage.tsx`. The copy is `docs/brand.md`'s and
is not touched.

## 1. Today

Hero with `Heading size="6xl"` and two CTAs, a `HeroAgendaMock` card, feature grids of
`Card` + `CardTitle` + `CardDescription`, a blue-green closing band. Already on `SectionHeading`s.
The hero mock is the one place a visitor sees « the product » and it **predates the product's own
look**: two hand-built `rounded-md border bg-surface-2 p-3` rows (a re-derived `Card variant="inset"`,
CLAUDE.md « Surfaces ») with « Mardi 19h » text instead of a `TimeBlock`.

## 2. Changes

- `HeroAgendaMock` is rebuilt from the real list shape (rule 8): `SectionHeading` « Cette semaine »
  (or the card's current eyebrow line) and two event cards made of the same pieces
  `MyAgendaEventCard` uses (`TimeBlock` training / match, title, meta, a soft structure badge « 12
  convoqués » / « 9 / 12 »). Render the real presentational pieces with static props rather than a
  lookalike; if `MyAgendaEventCard` needs a `TeamEvent` and a router context, compose `TimeBlock` +
  `Text` + `Badge` directly instead.
- The two hand-built rows' `rounded-md border border-border bg-surface-2 p-3` go (closed prop API:
  a surface is a `Card` variant).
- Feature cards keep `CardTitle` (a card's own heading inside a grid of cards is rule 4's allowed
  case). No other change: the page's marketing scale (`size="6xl"`, `lg` buttons) is deliberate.

## 3. Tests

`LandingPage.test.tsx` passes unchanged; add: the hero mock renders two time blocks.

## 4. Screenshots

390 and 1280, above the fold.
