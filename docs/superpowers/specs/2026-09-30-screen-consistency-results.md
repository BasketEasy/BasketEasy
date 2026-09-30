# Screen consistency: Résultats (`/results`)

Status: plan (screen 5 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Résultats » (390).
Depends on: Part 0 (`PageHeader`).

Page type: **tab root**. Files: `app/src/pages/ResultsPage.tsx`, `app/src/clubs/PastMatchesSection.tsx`.

## 1. Today

A bare `h1` then `PastMatchesSection`, which renders its own `SectionHeading` « Derniers résultats »
(it is shared with both dashboard homes), so the page shows the same title twice in two styles.

## 2. Changes

- `PageHeader title="Résultats" meta="30 derniers jours"` (the window `pastMatchesWindowParams()`
  already applies; say it rather than leave the reader to guess).
- `PastMatchesSection` gains `headingless` (default false): the page passes it, the two dashboard
  homes don't. Same prop name as the settings components in the team plan.
- Each match row follows rule 8 (link row): « vs {opponent} · {us} – {them} » (`.tabular`), meta
  « {team} · {date} », outcome `Badge` with today's `OUTCOME_BADGE_TONE` / `OUTCOME_LABEL` (unchanged), chevron, inside one
  `Card variant="flush"`. `PastMatchesSection` renders one `Card variant="inset"` per match today;
  switch it to rows in both callers (the homes' preview gains the same shape, which is the point).
- Empty state unchanged.

## 3. Tests

`ResultsPage.test.tsx`: one `h1`, no second « Derniers résultats » heading; rows link to each event;
outcome badges; empty/error/loading unchanged. `PastMatchesSection` test: `headingless` hides the
heading.

## 4. Screenshots

390 and 1280, with results and empty. Fixture: a `GET /me/dashboard` past-window body.
