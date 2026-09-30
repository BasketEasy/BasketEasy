# Screen consistency: Mes équipes (`/my-teams`)

Status: plan (screen 4 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Mes équipes » (390).
Depends on: Part 0 (`PageHeader`, Button `icon-responsive`).

Page type: **tab root**. Files: `app/src/pages/MyTeamsPage.tsx` (and its local `MyTeamRow`).

## 1. Today

`h1` + a `Text` paragraph, then a full-width « Créer une équipe » button on its own row, then one
`Card` holding a `ResponsiveTable` (Équipe, Club, Catégorie, Votre rôle, action).

## 2. Changes

- `PageHeader title="Mes équipes" meta="Celles que vous gérez, entraînez ou dans lesquelles vous
jouez." actions={createTrigger}`. The create `Dialog` is unchanged; its trigger becomes
  `Button size="icon-responsive"` (default variant, `PlusIcon`, label « Créer une équipe » from
  `md`, `aria-label` always). Only rendered when `adminClubs.length > 0`, as today.
- **Two sections instead of one table**, grouped by what the reader does with the team:
  - « Je gère » (`isTeamAdmin`), `SectionHeading count`;
  - « Je joue ou j’entraîne » (`!isTeamAdmin && rosterRole !== null`), `SectionHeading count`.
    A team where the reader is both admin and rostered appears once, under « Je gère », with the role
    badge naming both (« Admin · Coach »). A section with no team is not rendered.
- Each section keeps `ResponsiveTable` (desktop table, mobile card: one component, CLAUDE.md
  « Responsive tables »). The card layout becomes the link-row shape (rule 8): name as the link,
  « {clubName} · {category} {gender} » meta, role `Badge variant="soft" tone="muted"`, chevron.
  Desktop columns unchanged minus « Votre rôle » moving into a badge column.
- `error → loading → empty → data` ladder stays one ladder above both sections (the query is one);
  the `EmptyState` is unchanged.

## 3. Tests

`MyTeamsPage.test.tsx`: `h1`; create trigger named « Créer une équipe » (accessible name at both
widths) only for admins; teams split into the two sections with counts; a dual-role team once;
empty/error/loading branches unchanged; each row links to its team with the `my-teams` origin state.

## 4. Screenshots

390 and 1280 with teams in both groups; 390 empty state. Fixture: `authenticated-admin-session.json`
and a `GET /me/teams` body.
