# BasketEasy — Global UI/UX Audit

Date: 2026-08-11. Scope: `app/` (React + Vite frontend), all pages currently shipped — Landing, Login, Register, Dashboard, Account, My Teams, Club Create, Members (club hub), Team Detail. Based on reading the routing, navigation, and page source directly (see file references throughout); no design changes have been made — this is analysis + proposals only.

## 1. How pages are reached today

### Route map

| Path | Page | Guard |
|---|---|---|
| `/` | `LandingPage` | public |
| `/login`, `/register` | `LoginPage`, `RegisterPage` | `PublicOnlyRoute` (redirects logged-in users away) |
| `/dashboard` | `DashboardPage` | `ProtectedRoute` |
| `/account` | `AccountPage` | `ProtectedRoute` |
| `/my-teams` | `MyTeamsPage` | `ProtectedRoute` |
| `/clubs/new` | `ClubCreatePage` | `ProtectedRoute` |
| `/clubs/:clubId/members` | `MembersPage` | `ProtectedRoute` + in-component club-admin check (non-admins bounce to `/dashboard`) |
| `/clubs/:clubId/teams/:teamId` | `TeamDetailPage` | `ProtectedRoute`; page loads for any authed user, mutation UI hidden by `useIsClubAdmin`/`useIsTeamManager` |
| `*` | — | redirects to `/`, no dedicated 404 page |

(`app/src/App.tsx`, `app/src/auth/ProtectedRoute.tsx`, `app/src/auth/PublicOnlyRoute.tsx`)

### Navigation

[`AppHeader`](../../app/src/components/AppHeader.tsx) is mounted once by `ProtectedRoute`, so every protected page gets the same nav: Tableau de bord · Mes équipes · Mon profil · Créer un club, plus one "Effectif" button **per club the user administers**, appended inline. `LandingPage` rolls its own separate header (duplicated brand/CTA logic, not shared with `AppHeader`).

There is no club switcher, no breadcrumbs, and only one hardcoded "back" link (`TeamDetailPage` → its owning club's Members page). `/my-teams` is the only nav-reachable path into a team for a plain club member or a team-only admin — a deliberate design per `CLAUDE.md`, but it means that persona has a much thinner navigation surface than a club admin.

### Getting from A to B, today

```
Login/Register ──▶ Dashboard (near-empty) ──▶ [header links] ──▶ Account / My Teams / Club Create
                                                     │
                                        per-admin-club "Effectif" button
                                                     ▼
                                    Members page (Membres / Joueurs / Équipes tabs)
                                                     │
                                        Équipes tab row → "Voir"
                                                     ▼
                                              Team Detail page
                                    (4 stacked tables: partner clubs, roster,
                                     events, team admins)
```

A club `MEMBER` or `TeamAdmin`-only user skips the middle entirely: Dashboard → Mes équipes → Team Detail.

## 2. Findings

Ordered by impact, not file order.

### 2.1 Tables are the only content pattern, everywhere

Every data-bearing page — Members (×3 tabs), Team Detail (×4 sections), My Teams — is a `Table` + `Pagination` composition, styled consistently from `@basketeasy/ui`. Consistency is good; but a plain table is a poor fit for at least two of these surfaces:

- **Events** render as Date/Lieu/Notes rows. There is no calendar or agenda view, so "what's happening this week" requires scanning a paginated, sorted-by-date table. See [`proposed-events-calendar.svg`](./wireframes/proposed-events-calendar.svg).
- **Team roster** is a flat name/club/role table. A grouped, scannable view (players vs. staff, avatar-first) reads faster for the actual use case — "who's on this team" — while the table stays available as a power-user/export view. See [`proposed-team-detail-tabs.svg`](./wireframes/proposed-team-detail-tabs.svg).

See [`current-team-detail.svg`](./wireframes/current-team-detail.svg) for what the page looks like today, annotated.

### 2.2 `TeamDetailPage` stacks four independent tables on one page

`app/src/pages/TeamDetailPage.tsx` (690 lines) puts Clubs partenaires, Effectif, Événements, and Administrateurs as four full search/sort/paginate sections, one under another. Reaching "Administrateurs" means scrolling past three other tables. The Administrateurs section also has **no search or pagination**, unlike its three siblings — an inconsistency, not a deliberate simplification (nothing about team-admin lists being small is guaranteed).

**Fix:** a `Tabs` shell (the component already exists, already used on `MembersPage`) turns four stacked sections into four destinations. See [`proposed-team-detail-tabs.svg`](./wireframes/proposed-team-detail-tabs.svg).

### 2.3 No empty states — 7+ list views just show blank rows

Only `MyTeamsPage` has friendly empty-state copy ("Vous n'êtes membre d'aucune équipe pour le moment."). Every other table — Membres/Joueurs/Équipes tabs on `MembersPage`, and all four sections on `TeamDetailPage` — falls back to `Pagination`'s terse "Aucun résultat" caption with nothing else. For BasketEasy's actual early-adopter persona (a volunteer setting up a brand-new club), the very first thing they see in most of these tables *is* the empty state — and it gives them no next step.

**Fix:** a shared `EmptyState` component (icon + message + primary CTA button, composed from existing `Card`/`Button`) dropped into each table's empty branch. See [`proposed-empty-state.svg`](./wireframes/proposed-empty-state.svg).

### 2.4 Header nav doesn't scale past a couple of admin clubs

`AppHeader` renders one label + "Effectif" button pair per club the user administers, inline in the nav (`AppHeader.tsx:73-102`). CD44 has ~130 clubs and CTC/entente structures are the norm per `docs/brand.md` — an admin of several clubs (or a regional/CTC coordinator) will see the header wrap across multiple lines on desktop, and the mobile burger menu becomes an undifferentiated scroll of repeated "Effectif" buttons.

**Fix:** replace the button list with a single club-switcher dropdown that sets an active club context (fits the existing "Context owns local UI state" split from `docs/architecture.md`). See [`proposed-nav-club-switcher.svg`](./wireframes/proposed-nav-club-switcher.svg).

### 2.5 `DashboardPage` has no real content

`app/src/pages/DashboardPage.tsx` is a heading, the user's email, a logout button, and `HealthStatus` — a dev/API-health widget with no end-user value, currently shipping to every logged-in user as their landing page. For a product whose pitch is "less spreadsheet, more court," the first screen after login should show what's actually happening (upcoming events, teams, quick stats), not an internal diagnostics card.

**Fix:** see [`proposed-dashboard.svg`](./wireframes/proposed-dashboard.svg) — stat tiles, a "this week" agenda aggregated across the user's teams, and team cards (which also absorb the per-club button-list problem from 2.4, at least for the "jump to a team" case). Move `HealthStatus` behind a dev flag or an `/about`/status page.

### 2.6 Tables have no mobile-collapsed form

`Table` (`packages/@basketeasy/ui/src/components/Table.tsx`) wraps in `overflow-auto` — horizontal scroll — but never collapses to stacked cards on narrow viewports. Every 4–6-column table (Members, roster, events) will require horizontal scrolling on a phone. This compounds with 2.1/2.2: the pages that most need a non-tabular view for usability are also the ones that scroll worst on mobile, and BasketEasy's actual users (volunteer coaches checking a roster from their phone at the gym) are a mobile-heavy audience.

**Fix:** covered by the same proposals as 2.1 — card/chip/agenda layouts sidestep the problem rather than requiring a separate "responsive table" component.

### 2.7 Smaller inconsistencies worth fixing alongside the above

- **No app-wide error boundary.** A render-time exception has no fallback UI beyond React's default white screen. Worth adding regardless of the mockup work above.
- **Toast system exists but is unused.** `Toast`/`Toaster` (`@basketeasy/ui`) is mounted globally (`App.tsx:37`) but mutations (delete team, remove member, etc.) surface errors via inline `Alert` + local state instead. Not wrong, but pick one pattern — right now the app has two error-surfacing conventions with no visible rule for which applies where.
- **Blank flash during auth resolution.** `ProtectedRoute`/`PublicOnlyRoute` render `null` while checking auth state — no skeleton/spinner, just a blank page for a beat.
- **`LandingPage` duplicates header/CTA logic** instead of sharing it with `AppHeader` — low risk today, but a maintenance trap once the header changes (e.g. the club-switcher proposal in 2.4) and the landing page's copy silently diverges.
- **No 404 page** — unmatched routes redirect straight to `/`, which is fine for a small app but hides genuinely broken links (e.g. an old bookmark to a deleted team) behind a silent redirect instead of a clear "not found."

## 3. Proposed mockups

All wireframes are in [`./wireframes/`](./wireframes/), SVG (render directly in GitHub/most Markdown viewers, or open in a browser). Each proposed file is annotated in-image with the reasoning and what existing `@basketeasy/ui` components it reuses — none of these require new design-system primitives, they're new *compositions* of `Card`, `Table`, `Tabs`, `Badge`, `Button`, `Pagination`, which already exist and are already styled to the brand tokens (`docs/brand.md`).

| File | Addresses |
|---|---|
| [`current-team-detail.svg`](./wireframes/current-team-detail.svg) | Baseline: today's `TeamDetailPage`, annotated with problems (2.1, 2.2, 2.3) |
| [`proposed-dashboard.svg`](./wireframes/proposed-dashboard.svg) | 2.5 (empty dashboard), partially 2.4 |
| [`proposed-team-detail-tabs.svg`](./wireframes/proposed-team-detail-tabs.svg) | 2.1, 2.2 |
| [`proposed-events-calendar.svg`](./wireframes/proposed-events-calendar.svg) | 2.1 (events specifically), 2.6 (mobile agenda collapse) |
| [`proposed-nav-club-switcher.svg`](./wireframes/proposed-nav-club-switcher.svg) | 2.4 |
| [`proposed-empty-state.svg`](./wireframes/proposed-empty-state.svg) | 2.3 |

## 4. Suggested priority order

Roughly cheapest-and-highest-signal first, not a commitment — sequence to validate with the team:

1. **Empty states (2.3)** — smallest change, one new shared component, touches 7+ places, directly helps first-run experience.
2. **Team Detail tabs (2.2)** — restructuring, not new UI; `Tabs` already exists and is already proven on `MembersPage`.
3. **Club switcher (2.4)** — fixes a scaling problem before it becomes visible in production (works fine today with 1–2 admin clubs in dev/testing, breaks with CD44-scale real usage).
4. **Dashboard content (2.5)** — depends on an aggregation endpoint ("my upcoming events across teams"); more backend work than the others, so sequence after the frontend-only wins.
5. **Events calendar (2.1)** — highest design/engineering cost (new calendar-grid component), and explicitly listed in `CLAUDE.md`'s Events roadmap as coming after RSVP/convocations — worth waiting for those data fields to exist before building a calendar UI that has nothing but bare Date/Lieu to show per cell.
6. **Table mobile collapse (2.6)** — superseded in the pages covered by 1–5 above; only remaining tables (e.g. the "power view" toggles proposed in 2.1/2.2) may still need it, reassess after those ship.

Not addressed here (deliberately out of scope for this pass): visual/branding polish beyond what's already defined in `docs/brand.md`, and any change to auth/permission logic (2.7's error-boundary and toast-consistency notes are implementation hygiene, not UX proposals, listed for completeness).

## 5. Open questions from review — resolved

Five items were underspecified enough to block starting implementation. Answered here so a decision exists in writing rather than getting guessed at mid-build; product/design should confirm or override before the affected item starts.

1. **Club switcher — click-target behavior.** Two separate controls, not one overloaded one: the chip (name + caret) is a pure open/close toggle — clicking it never navigates. Selecting a club row inside the panel only changes the active-club context (checkmark moves, panel closes) — it doesn't navigate either. Reaching a club's roster goes through a new **persistent "Effectif" nav item**, always targeting the active club, added next to "Mes équipes" in the header. `proposed-nav-club-switcher.svg` has been updated to show this link explicitly (it was implied in the original annotation text but never drawn — that gap is what the review caught).
2. **Club switcher — zero-admin-club state.** No new mockup needed: reuse today's `AppHeader.tsx` guard (`adminClubs.length > 0`) — the switcher and the new "Effectif" link simply don't render for a user who admins no clubs. "Créer un club" stays a normal top-level nav item in that state, unchanged from today.
3. **Dashboard — "Joueurs au total" definition.** Club-scoped: `COUNT(DISTINCT Player.id)` where the player's club is one the user administers — matches the tile's neighbors ("Équipes gérées," "Clubs administrés"), and since `Player.clubId` is single-valued, this reading doesn't have a CTC double-counting problem (that only arises at the team-roster level, not here). The alternative reading — players on any team the user touches in any role — is a materially different, team-scoped query that *would* double-count CTC-shared rosters; flagged to product as a real fork if the club-scoped reading isn't what's wanted.
4. **Events calendar — agenda vs. grid shell.** Ship the day-grouped agenda list only for v1 (bottom half of `proposed-events-calendar.svg`); the month grid above it illustrates the end-state, not a v1 build target. With today's event data (Date/Lieu/Notes only, no RSVP/convocation counts per `CLAUDE.md`'s Events roadmap), a grid would render mostly-empty cells — build it once there's data to fill it, consistent with §4's priority note that this item should wait on RSVP/convocations landing first.
5. **Team Detail tabs — back-link destination.** Intentional, not a mockup artifact, but under-argued in the original wireframe. Today's hardcoded `← Retour à l'effectif` only makes sense for a user who arrived via the club Members page — it's wrong for anyone who arrived via `/my-teams` (the *only* nav path for a plain club member or team-only admin, per `CLAUDE.md`). `← Mes équipes` in the mockup is the simplest fixed destination that works for everyone, but it does change what a club admin currently expects. The more correct fix — a contextual back-link that returns to wherever the user actually came from — was traded away for simplicity in the mockup; worth revisiting if the fixed destination tests poorly with club admins.
