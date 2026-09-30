# Screen consistency: Accueil (`/dashboard`)

Status: plan (screen 1 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboards « Accueil · gestionnaire » (390), « Ma semaine · joueur » (390), « Desktop · accueil » (1280).
Depends on: Part 0 (`PageHeader`, `FactTile`, `PageHero`).

Page type: **tab root**. Files: `app/src/pages/DashboardPage.tsx`, `app/src/clubs/ManagerHome.tsx`,
`app/src/clubs/PlayerHome.tsx`, `app/src/clubs/ActionItemsBand.tsx`, `app/src/clubs/ActionItemRow.tsx`,
`app/src/clubs/MyAgendaEventCard.tsx` (hero size only).

## 1. Today

- Title block hand-built in `DashboardPage` (`Heading` + `Text` in a `flex-wrap justify-between` div
  with nothing on the right).
- Manager: `ActionItemsBand` is a `Card variant="panel" tone="brand"` wrapping a `SectionHeading`
  and inset rows; « Cette semaine » is a `Card` with a `CardTitle` and a `TextLink` in its header;
  « Mes équipes » is a `Heading as="h2"` (not the court line) over a grid of `TeamCard`s (a local function in `ManagerHome.tsx`).
- Player: already on `SectionHeading`s; the next event is `MyAgendaEventCard size="hero"`.

## 2. Changes

### 2.1 `DashboardPage`

Replace the title block with `PageHeader title={greeting} meta={personaLine | email}` (same
conditions as today: persona line when acting for a child, e-mail only with manage rights,
`break-all` kept by passing a `Text` node as `meta`).

### 2.2 Manager (`ManagerHome`)

Order, per the artboard: « À traiter » → stat tiles → « Cette semaine » → « Mes équipes » →
« Derniers résultats » (`PastMatchesSection`, unchanged).

- **À traiter** (`ActionItemsBand`): drop the `panel`/`brand` card. It becomes
  `section.flex.flex-col.gap-3.5` = `SectionHeading as="h2" count` + the rows. Each
  `ActionItemRow` becomes a `FactTile`: `MATCH_WITHOUT_CONVOCATIONS` and
  `MATCH_WITHOUT_CONFIRMED_SCORESHEET` are **accent** (a thing only this reader can fix, rule 3),
  `EVENT_PENDING_RSVPS` and `PLAYERS_WITHOUT_ACCOUNT` neutral. `label` = `item.message` (still
  rendered verbatim, server-composed), no `detail`, `actions` = the existing controls unchanged
  (`EventConvocationModal` trigger, links). Icons: `UsersIcon` (convocations, accounts),
  `CalendarIcon` (RSVPs), `ClipboardIcon` or the scoresheet icon already used on the event page.
  The accent tile's action is the filled `Button` (`triggerVariant` default instead of `outline`).
  No new `ActionItemKind` here (a « match sans lieu » item would be a backend change, out of scope).
- **Stat tiles**: unchanged component, unchanged `grid-cols-2 md:grid-cols-4`.
- **Cette semaine**: `section` = `SectionHeading as="h2"` + `div.flex.flex-col.gap-2` of
  `MyAgendaEventCard`s; the `Card`/`CardHeader`/`CardTitle` wrapper goes. « Voir le calendrier »
  moves under the list as `Button asChild variant="ghost" size="sm"` + `Link` (a `TextLink` in a
  header row has nowhere to sit once the header is a court line). The `error → loading → empty →
data` ladder is unchanged, now inside the section.
- **Mes équipes**: `SectionHeading as="h2"` replaces `Heading as="h2" className="mb-3"`; the
  `TeamCard` grid becomes a `Card variant="flush"` list of link rows (rule 8): team name
  (`Text variant="label" size="sm"`), meta « {clubName} · {category} », role `Badge variant="soft"
tone="muted"`, chevron. The local `TeamCard` function goes with it (dead-code rule).
- **Desktop** (`md+`, artboard « Desktop · accueil »): below the stat tiles,
  `div.grid.md:grid-cols-2.md:items-start.gap-6` with « Cette semaine » left and a column holding
  « À traiter » + « Mes équipes » right. Below `md` it is one column in the order above. Pure CSS
  (`md:` classes), no viewport hook.

### 2.3 Player (`PlayerHome`)

**Superseded** by [`…-player-home.md`](./2026-09-30-screen-consistency-player-home.md) (vote state, last
match, season, match stats). This plan's player scope is only the hero shape below; everything else
on the player home follows that spec.

- « Prochain rendez-vous »: `MyAgendaEventCard size="hero"` takes the hero grammar: badges row
  (Convoqué `soft accent` when `myConvocation`, `EventVenueBadge`), eyebrow team name, the title
  (« vs {opponent} » / « Entraînement ») at `Heading size="hero"` rendered as `h2` (the page's `h1`
  is the greeting), meta date · time `.tabular`, then a `FactTile` for the venue (`eventVenueLabel`,
  RDV line from `meetingPlan` when known) and the existing RSVP control underneath. Implement it
  inside `MyAgendaEventCard`'s `hero` branch; the `default` size (list cards) is untouched.
- « À répondre », « Les 14 prochains jours », « Derniers résultats »: already court-line sections;
  no change.

## 3. Tests

- `DashboardPage.test.tsx`: one `h1` with the greeting; persona line / e-mail conditions unchanged.
- `ActionItemsBand.test.tsx` / `ActionItemRow.test.tsx`: section heading with count; each kind's
  action still present; accent kinds carry the accent tile (assert via `data-tone` if `FactTile`
  exposes it, else by the filled button's role/name).
- `ManagerHome` tests: « Cette semaine » is a `heading` level 2; error/loading/empty/data each still
  render; « Voir le calendrier » links to `/my-teams`; team rows link to each team.
- `MyAgendaEventCard.test.tsx`: `size="hero"` renders eyebrow, title, venue tile and RSVP; default
  size unchanged.

## 4. Screenshots

390 manager, 390 player (with and without a next event), 390 guardian (`guardian-dashboard.json`),
1280 manager. Fixture:
`scripts/fixtures/authenticated-admin-session.json` plus a `GET /me/dashboard` body with one item of
each kind (commit it as `scripts/fixtures/dashboard-action-items.json`, it will recur).
