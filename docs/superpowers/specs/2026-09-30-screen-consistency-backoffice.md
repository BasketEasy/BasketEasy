# Screen consistency: back-office (`/admin/*`)

Status: plan (screen 17 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Desktop · back-office » (1280).
Depends on: Part 0 (`PageHero`, `FactTile`).

Page type: **own chrome**. `AdminShell` deliberately wears no product chrome (CLAUDE.md « Platform
back-office »), and that stays: no `AppHeader`, no `PageBar`, no bottom nav. What it adopts is the
page grammar _inside_ the shell. One plan for fifteen routes, because every one of them titles itself
through `AdminPageHeader` and lays out through `AdminSection` / `AdminStats` / `AdminFacts` in
`app/src/admin/shared/AdminLayout.tsx`:

| Kind              | Routes                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Detail (entity)   | `clubs/:clubId`, `teams/:teamId`, `users/:userId`, `players/:playerId`, `events/:eventId` |
| List (collection) | `clubs`, `teams`, `users`, `players`, `events`, `scoresheets`, `audit-log`, `search`      |
| Other             | `/admin` (dashboard / stats), `retention`                                                 |

## 1. Today

`AdminPageHeader`: a breadcrumb `nav` (« Clubs / ASC Rezé »), then `h1` (default `4xl`), badges
**under** the title, subtitle, actions on the right. Detail pages then put `AdminStats` (a row of
tiles) under the header, then tabs or sections. Already on `SectionHeading` (`AdminSection`).

## 2. Changes

- **Detail pages**: `AdminPageHeader` gains the hero shape when given `eyebrow` (the entity kind:
  « Club », « Équipe », « Utilisateur », « Joueur », « Événement »): it renders `PageHero` with
  badges **above** the eyebrow (the product order), `title`, `subtitle` as `meta`, and an `aside`.
  The five detail pages pass their `AdminStats` block as the `aside` (a 2×2 grid of `StatTile
size="sm"`) instead of a separate row under the header.
- The breadcrumb stays, above the hero, restyled as the product's desktop back link
  (`PageBackLink` look: ghost button + `ChevronLeftIcon` + parent label) **plus** the current page
  as meta text, keeping `aria-label="Fil d’Ariane"`. It is not replaced by `PageBar`: the back-office
  is desktop-first and has no mobile bar.
- **List pages** keep today's header (`h1` + description + actions) but render through `PageHeader`
  (Part 0), so the title size is `hero` like every product tab root.
- Danger actions at the foot of detail pages (`ClubDeleteAction`, erase, impersonate) keep their
  place and dialogs; the dialogs are `AdminActionDialog`, already on the responsive default.
- No redaction, audit or query change: this is layout only. Every audited read still fires exactly
  once (the `refetchOnWindowFocus: false` rule is untouched).

## 3. Tests

`AdminClubDetailPage.test.tsx`, `AdminTeamDetailPage.test.tsx`, `AdminUserDetailPage.test.tsx`,
`AdminPlayerDetailPage.test.tsx`: `h1`, eyebrow, stats in the hero; breadcrumb link to the parent
list. `AdminShell.test.tsx` unchanged. List page tests: `h1` unchanged.

## 4. Screenshots

1280 of one detail page per entity kind and two list pages; 390 of one detail page (the shell is
usable on a phone, not designed for it). Fixtures: `platform-backoffice.json`, `admin-browse.json`.
