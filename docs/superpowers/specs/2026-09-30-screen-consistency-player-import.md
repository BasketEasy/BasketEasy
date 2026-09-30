# Screen consistency: Importer les licenciés (`/clubs/:clubId/import-players`)

Status: plan (screen 9 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Importer les licenciés » (390).
Depends on: Part 0 (`PageBar`, `PageBackLink`, `PageHeader`).

Page type: **task flow, depth 2** (from the club's « Joueurs » tab). Files:
`app/src/pages/PlayerImportPage.tsx`, `app/src/clubs/playerImport/PlayerImportSteps.tsx`, the three
step components (heading only).

## 1. Today

`Heading size="3xl"` (a size no other page title uses), the step indicator, then one `Card` holding
the active step, whose own heading is focused on step change. No way back to the roster on a phone.

## 2. Changes

- `PageBar to="/clubs/{clubId}/members?tab=players" title="Effectif · {club.name}"` +
  `PageBackLink`; `PageContainer top="bar"`. The club name comes from `useClubShow` (already cached
  from the members page; a direct load shows « Effectif » until it resolves).
- Title: eyebrow `club.name` + `PageHeader title="Importer les licenciés"` (`size="hero"`, the one
  page-title size). No meta.
- **Step indicator**: `PlayerImportSteps` already has the timeline's shapes (number disc, done in
  structure, current in brand, a 2px structure rule between steps) and stays as it is, except the
  hand-built connector `span` (`h-0.5 bg-blue-green/20`) becomes `Divider tone="structure"
weight="rule"` so the rule is the same component as the match timeline's rail.
  (`Divider` already has the horizontal `rule` weight.)
- Each step's own heading (the one `headingRef` focuses) becomes `SectionHeading as="h2"` inside the
  card (« Choisir le fichier », « Associer les colonnes », « Vérifier l’import »), still focusable
  (`tabIndex={-1}` + ref): rule 4, and the focus-on-step behaviour is unchanged.
- Step actions (« Retour » outline, primary filled `flex-1` on mobile) unchanged.

## 3. Tests

`PlayerImportPage.test.tsx`: back link to the players tab; `h1`; step indicator marks the current
step; heading focus moves on each step (existing assertions keep passing); full import flow and toast
unchanged.

## 4. Screenshots

390 and 1280 at each of the three steps. Fixture: `authenticated-admin-session.json` + players list;
the upload uses a small CSV in `scratchpad/`.
