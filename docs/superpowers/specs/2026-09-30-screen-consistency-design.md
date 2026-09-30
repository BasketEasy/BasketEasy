# Screen consistency: the match page as the grammar of every screen

**Status:** design + plan index, not built. **Date:** 2026-09-30.

Design canvas: https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd. Its source is committed at
[`assets/2026-09-30-screen-consistency/`](./assets/2026-09-30-screen-consistency/) (one `.dc.html`
per artboard, open in a browser). Artboard « Grammaire commune » is the rule sheet; every other
artboard is one screen after the change.

The match page revamp (PRs #290–#294, [plan](./2026-09-30-match-page-revamp-implementation-plan.md))
fixed a way of building a screen: a page bar, a hero card with a fact tile, court-line sections,
secondary blocks folded into an accordion with one-line summaries, a missing fact shown as an accent
tile with its fix one tap away, sheets on mobile. The rest of the app still uses the shapes that came
before it (`CardTitle` inside cards, five settings cards stacked above a tab list, a desktop-only
ghost back button, a page title that is sometimes an `h1`, sometimes a `SectionHeading`, sometimes a
`CardTitle`). This record states the grammar once and splits the work into one plan per screen.

The standing rules distilled from this record live in [`docs/ui-guidelines.md`](../../ui-guidelines.md);
new designs start there.

It evolves Parquet ([`2026-08-25-frontend-parquet-revamp-design.md`](./2026-08-25-frontend-parquet-revamp-design.md)),
it does not replace it: no token value changes, and every rule in `CLAUDE.md` « Design direction »
still holds.

## 1. The grammar (artboard « Grammaire commune »)

1. **Three page types, picked by what the page is, not by who built it.**
   - **Tab root** (a bottom-nav destination or a personal collection: `/dashboard`, `/my-teams`,
     `/results`, `/notifications`, `/account`): `PageHeader` = `h1` + one meta line + at most one
     action, no card, no back control.
   - **Entity page** (a page about one thing: an event, a team, a club, a child): a `PageHero` card.
     When it is also **depth ≥ 2** (reached from another page, not from the bottom nav), the mobile
     `PageBar` sits under `AppHeader` and the desktop `PageBackLink` sits above the hero. The club
     page is an entity page reached from the « Club » tab, so it gets the hero and no bar.
   - **Standalone** (public, auth, error): the wordmark and one centred card whose `h1` is a
     `Heading`, never a `CardTitle`.
   - **Task flow** at depth 2 (import, create a club): `PageBar` + eyebrow + `h1` + one card.
2. **The hero card** = `EventDetailHero`'s structure: badges row → eyebrow (the parent: team → club,
   event → team) → `Heading as="h1" size="hero"` → `Text variant="meta"` with `.tabular` → a
   **fact tile** (`Card variant="inset"` + `IconBadge` + label + detail + actions,
   `EventHeroLocation`'s shape). Stacked below `md`, two columns from `md`.
3. **A missing fact the reader can fix is an accent fact tile** (`tone="accent"`, `IconBadge
tone="accent"`, one sentence, one filled button), exactly « Lieu non communiqué ». A reader who
   can't fix it sees the neutral fact, no button.
4. **A page block is a `SectionHeading` above its content.** `CardTitle` stays for a card's own
   internal heading only; it is no longer a page section title.
5. **What is opened rarely folds into a `SectionAccordion`**, with a summary only when the fact is
   already loaded by the page (the Part 5 rule: never add a query to fill a summary line). The block
   the page exists for stays open. Desktop puts the primary pair side by side.
6. **A secondary header action is icon-only below `md`, labelled from `md`**, through a new Button
   size, never a `w-9 px-0 md:w-auto` override at the call site (the one `EventHeroLocation` carries
   today is migrated in Part 0).
7. **Modals are sheets below `md`, centred cards from `md`**: already the `DialogContent` default
   (match Part 1). No screen picks the placement by hand; `PersonaSheet`'s `variant="sheet"` stays
   the only exception.
8. **Lists come in three shapes**: an event is a card with a `TimeBlock`; a person is a row with
   `Avatar` + name + `Badge`; a link to another page is a row with title, meta and a chevron, inside
   a `Card variant="flush"`.

Where the canvas and this text disagree, this text wins; where a screen plan corrects this text, the
screen plan wins (the match page rule).

## 2. Shared primitives (Part 0, lands first)

Specced in [`…-part0-shared-primitives.md`](./2026-09-30-screen-consistency-part0-shared-primitives.md):
`PageHeader`, `PageHero`, `FactTile` in `@basketeasy/ui`; `PageBar` / `PageBackLink` in
`app/src/components/` (they need `react-router`'s `Link`, which the UI package doesn't depend on);
Button `size="icon-responsive"`; `EventPageBar`, `EventBackLink`, `EventDetailHero` and
`EventHeroLocation` rebuilt on top of them with no visual change. Every screen plan below depends on
it.

## 3. Mockup class → component table (additions to the match plan's table)

The match plan's table still applies. New classes on this canvas:

| Mockup class / shape                            | Component and props                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `h1.heading` + meta, no card (tab root)         | `PageHeader title meta actions` (Part 0)                                                           |
| `.card-raised` with badges/eyebrow/h1/meta/tile | `PageHero badges eyebrow title meta aside` (Part 0)                                                |
| `.card-inset` + `.icon-badge` + label/detail    | `FactTile icon label detail tone actions` (Part 0)                                                 |
| `.page-bar`                                     | `PageBar to state title` (Part 0, was `EventPageBar`)                                              |
| icon button that gains a label at `md`          | `Button variant="outline" size="icon-responsive"` + `aria-label` (Part 0)                          |
| `.acc` / `.acc-title`                           | `SectionAccordionItem title summary` (exists)                                                      |
| `.tabs` / `.tabt`                               | `TabsList` / `TabsTrigger badge` (exists, unchanged)                                               |
| `.timeblock.tb-match` / `.tb-training`          | `TimeBlock` (exists)                                                                               |
| `.stat` tile                                    | `StatTile` (exists, `@basketeasy/ui/stat-tile`)                                                    |
| link row with chevron                           | `ResponsiveTable` card layout or a `Link` row; see each screen plan                                |
| `.step-dot` + rail (import stepper)             | `PlayerImportSteps` restyled on `MatchTimelineSteps`' dot + `Divider tone="structure"` (screen 09) |

Measure at 390 px and 1280 px, same content; a difference is a bug unless a plan says the mockup is
wrong. A value with no token goes into `tailwind-preset.cjs` first.

## 4. Plans, one per screen

| #   | Screen (route)                                                         | Page type          | Plan                                                                 | Depends on | Size |
| --- | ---------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------- | ---------- | ---- |
| 0   | Shared primitives                                                      | –                  | [part0](./2026-09-30-screen-consistency-part0-shared-primitives.md)  | –          | M    |
| 1   | Accueil (`/dashboard`)                                                 | tab root           | [dashboard](./2026-09-30-screen-consistency-dashboard.md)            | 0          | M    |
| 1b  | Accueil joueur: vote, dernier match, saison, stats du match (API + UI) | tab root           | [player-home](./2026-09-30-screen-consistency-player-home.md)        | 0, 1       | L    |
| 2   | Équipe (`/clubs/:clubId/teams/:teamId`)                                | entity, depth 2    | [team](./2026-09-30-screen-consistency-team-detail.md)               | 0          | L    |
| 3   | Club (`/clubs/:clubId/members`)                                        | entity, tab root   | [club](./2026-09-30-screen-consistency-club-members.md)              | 0          | M    |
| 4   | Mes équipes (`/my-teams`)                                              | tab root           | [my-teams](./2026-09-30-screen-consistency-my-teams.md)              | 0          | S    |
| 5   | Résultats (`/results`)                                                 | tab root           | [results](./2026-09-30-screen-consistency-results.md)                | 0          | S    |
| 6   | Notifications (`/notifications`)                                       | tab root           | [notifications](./2026-09-30-screen-consistency-notifications.md)    | 0          | S    |
| 7   | Mon compte (`/account`)                                                | tab root           | [account](./2026-09-30-screen-consistency-account.md)                | 0          | M    |
| 8   | Profil enfant (`/children/:playerId`)                                  | entity, depth 2    | [child](./2026-09-30-screen-consistency-child-profile.md)            | 0          | S    |
| 9   | Import des licenciés (`/clubs/:clubId/import-players`)                 | task flow, depth 2 | [import](./2026-09-30-screen-consistency-player-import.md)           | 0          | S    |
| 10  | Créer un club (`/clubs/new`)                                           | task flow, depth 2 | [club-create](./2026-09-30-screen-consistency-club-create.md)        | 0          | S    |
| 11  | Match, vue joueur (`/clubs/:clubId/teams/:teamId/events/:eventId`)     | entity, depth 2    | [event-player](./2026-09-30-screen-consistency-event-player-view.md) | –          | M    |
| 12  | Réponse invité (`/r/:token`)                                           | standalone         | [guest](./2026-09-30-screen-consistency-guest-rsvp.md)               | 0          | S    |
| 13  | Auth: login, register, forgot, reset, verify-email, both invite pages  | standalone         | [auth](./2026-09-30-screen-consistency-auth.md)                      | –          | M    |
| 14  | Erreurs: 404, 403, error boundary                                      | standalone         | [errors](./2026-09-30-screen-consistency-errors.md)                  | –          | S    |
| 15  | Pages légales (4 routes, one `LegalPageLayout`)                        | standalone         | [legal](./2026-09-30-screen-consistency-legal.md)                    | –          | S    |
| 16  | Landing (`/`)                                                          | marketing          | [landing](./2026-09-30-screen-consistency-landing.md)                | –          | S    |
| 17  | Back-office (`/admin/*`, 15 routes, one `AdminPageHeader`)             | own chrome         | [back-office](./2026-09-30-screen-consistency-backoffice.md)         | 0          | M    |

Rows 13, 15 and 17 each cover several routes because those routes render through one shared layout
component (`AuthCard` after the change, `LegalPageLayout`, `AdminPageHeader`); a plan per route
would repeat the same diff. Each of those plans still lists every route it touches and its
screenshot.

Order: 0 first; then 2 and 3 (largest gap to the grammar, most manager time spent there); then 1,
7, 8, 11; the rest in any order. Each is its own PR, each PR screenshots the screen at 390 and 1280
next to its artboard (CLAUDE.md screenshot rule, `pnpm mock-api` + `scripts/fixtures/`).

## 5. Unchanged on purpose

- `AppHeader`, `MobileTopBar`, `AppBottomNav`: the chrome is already the canvas's (`.app-top`,
  `.tabbar`). The desktop nav is unchanged.
- **Tabs stay on Équipe, Club and the back-office detail pages.** The match page dropped its tabs
  because one scroll answered one question; a team's roster, calendar, stats and partner clubs are
  four paginated, filterable data sets, and `CLAUDE.md` documents those `?tab=` triggers as the
  deliberate ARIA exception. What changes is what sits _above_ the tabs.
- No token, colour or font value changes. No new dependency (the accordion is already
  `@radix-ui/react-accordion` behind `SectionAccordion`).
- No behaviour change beyond layout: every query, mutation, toast and `?tab=`/`?invite=` deep link
  keeps working as today; each plan names the tests that prove it.

## 6. Conflicts raised (the constraint wins)

- **Mobile back control on the team page.** `TeamDetailPage` hides its back button below `md`
  (« the nav button that makes no sense on mobile », a user report). The match page since added a
  full-width `PageBar` below `md`. The report was about a floating ghost `← Mes équipes` button, not
  a titled bar; the team plan adopts `PageBar` for consistency with the event page one level
  deeper, and says so in its PR so the reviewer can veto it.
- **Summaries on settings accordions.** The team and club settings cards each own their query;
  folded content is unmounted, so their summary would need the query lifted into the page. The
  plans lift a query only where the page already has the data or the fetch is one small `GET` the
  card makes anyway on open; otherwise the item has no summary (Part 5 rule).
- **`SectionAccordion` titles don't wrap** (`whitespace-nowrap`, by design for the match page's
  short titles). Titles on the new screens are kept to ≤ 20 characters (« RDV », « Lien invité »),
  not solved by wrapping.
