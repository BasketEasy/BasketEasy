# Screen consistency: Équipe (`/clubs/:clubId/teams/:teamId`)

Status: plan (screen 2 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboards « Équipe · gestionnaire » (390), « Équipe · joueur » (390), « Desktop · équipe » (1280).
Depends on: Part 0 (`PageBar`, `PageBackLink`, `PageHero`, `FactTile`, Button `icon-responsive`).

Page type: **entity, depth 2**. Files: `app/src/pages/TeamDetailPage.tsx`,
`app/src/clubs/TeamFfbbLinkList.tsx`, `app/src/meeting-points/TeamMeetingPointSettings.tsx`,
`app/src/guest-rsvp/TeamGuestLinkSettings.tsx`, `app/src/whatsapp-reminders/WhatsAppSettingsCard.tsx`,
`app/src/whatsapp-reminders/TeamPendingCancellations.tsx`, `app/src/clubs/TeamDeleteModal.tsx`
(trigger only).

## 1. Today

A manager opens the page to a desktop-only ghost `← Mes équipes`, an `h1` + meta with « Modifier »
and « Supprimer » beside it, then **five full-width settings blocks** (pending cancellations, FFBB
competitions, RDV, guest link, WhatsApp message), each with its own `SectionHeading`, and only then
the tabs. On a phone the calendar a manager came for starts several screens down. Nothing on the
page says when the next match is.

## 2. Layout after the change

```
PageBar (mobile, title = backLink label without « ← »)     ← outside PageContainer
PageContainer top="bar"
  PageBackLink (desktop)
  PageHero
    badges: « Entente CTC » soft structure (team linked to > 1 club) · « FFBB » outline neutral (≥ 1 FFBB link, manager or player)
    eyebrow: owning club name
    title: team.name · titleAction: « Modifier l’équipe » (icon-responsive, canManageTeam)
    meta: « {category} · {gender} · {n} joueurs » (.tabular)
    aside: next-event FactTile
  TeamPendingCancellations               (manager, only when non-empty; always open: it is actionable)
  Tabs (unchanged: triggers, ids, ?tab= behaviour, both role lists)
  section « Réglages de l’équipe »       (manager)
    SectionAccordion [ffbb, rdv, invite, whatsapp]
    TeamDeleteModal trigger              (owner club ADMIN, last, destructive outline)
  SectionAccordion [ffbb]                (player, only when links exist; no group heading)
```

### 2.1 Back navigation

- `PageBar to={backLink.to} title={label}` + `PageBackLink`: `useBackLink()` keeps resolving the
  origin (members / dashboard / my-teams). Its labels lose the `← ` prefix (the chevron icon now draws
  it): `useBackLink` returns `label: 'Mes équipes' | 'Effectif du club' | 'Tableau de bord'`;
  update `backLink.test.ts`.
- Drop `useIsDesktopViewport` from the page (the bar and link hide themselves with `md:`).
- **Conflict raised** (design record §6): the comment removed with the desktop-only button records a
  user report against a mobile back button. The report was about a floating ghost button; the bar is
  the event page's pattern one level deeper. Say so in the PR description so the reviewer can veto.
- `PageContainer top="bar"` on the data branch; error/loading/empty keep the plain container (no
  team name yet), same as `EventDetailPage`.

### 2.2 Hero data, all already loaded by the page

- Club name for the eyebrow and « Entente CTC »: `allTeamClubsResult` (the unfiltered clubs fetch
  used for `isOwner`). Eyebrow = the owning club's name (`isOwner` row), falling back to the route
  club's.
- Player count: `allTeamPlayers.length` (already the roster tab's badge).
- « FFBB » badge: the FFBB links query `TeamFfbbLinkList` runs, lifted to the page
  (`useTeamFfbbLinks(clubId, teamId)`, same key, so the list reuses the cache).
- **Next event tile** (`FactTile`, `CalendarIcon`): label « {formatEventDayShort} · {time} »
  (`.tabular`, « heure à confirmer » when `!timeConfirmed`), detail « Prochain : vs {opponent} » /
  « Prochain : Entraînement », action `Button asChild variant="outline" size="sm" className="flex-1"`
  → the event page (`navState` origin forwarded). Source: the agenda's upcoming query. The agenda
  toggle can switch that query to past events, so the hero calls `useEventList` with **exactly** the
  agenda's upcoming params (`{ from: agendaFrom, sortOrder: 'asc', pageSize: LINKING_PAGE_SIZE }`):
  same query key, no extra request in the default state, and the tile doesn't vanish when a player
  looks at past events. No upcoming event → no `aside` (the hero is one column).
- Player view: the tile's detail appends the reader's own answer when rostered
  (`myRsvpStatus` → « · Présent » / « · Absent » / « · Peut-être » / « · Sans réponse »).

### 2.3 Settings accordion (manager)

| Item value | Title (≤ 20 chars) | Content                    | Summary                                                  |
| ---------- | ------------------ | -------------------------- | -------------------------------------------------------- |
| `ffbb`     | Calendrier FFBB    | `TeamFfbbLinkList`         | « {n} lien(s) » from the lifted links query; none when 0 |
| `rdv`      | RDV                | `TeamMeetingPointSettings` | none (its settings query stays inside; Part 5 rule)      |
| `invite`   | Lien invité        | `TeamGuestLinkSettings`    | none                                                     |
| `whatsapp` | Message WhatsApp   | `WhatsAppSettingsCard`     | none                                                     |

- Each of the four components loses its own `SectionHeading` (the accordion trigger is the heading
  now) behind a prop `headingless` (default false) so no other caller changes; drop the prop once
  every caller passes it (dead-code rule). Their inner `Card variant="panel"` wrappers become plain
  `div`s when headingless: the item is already a `Card variant="flush"`, and a panel inside it breaks
  the « nothing shares a background with its parent » rule the other way (two steps down).
- Open state: `useState<string[]>([])`, all folded. `?reglage=<value>` is **not** added; no deep
  link points at these today.
- Desktop: the four items in `div.grid.md:grid-cols-2.md:items-start.gap-2.5`.
- `TeamDeleteModal` trigger becomes `Button variant="outline"` « Supprimer l’équipe » after the
  accordion, `self-start` (the event page's delete row shape). Its dialog is unchanged.
- `TeamPendingCancellations`: stays outside the accordion (actionable, like the pilot band). Its
  cards become one accent `FactTile` per pending cancellation (label = the cancelled event, action =
  the existing share button, filled).

### 2.4 Player

Hero (no `titleAction`), tabs unchanged, then — only when the team has FFBB links — one
`SectionAccordion` item « Compétitions FFBB » with `TeamFfbbLinkList canManage={false}` (read-only
today, unchanged content).

## 3. What doesn't change

Tabs, their ids, labels, badges, order per role and the `?tab=` replace-navigation; every tab's
content component; `TeamEditModal` (now triggered from the hero); all queries except the one lifted
in §2.2 (same key, cache shared).

## 4. Tests

- `TeamDetailPage.test.tsx`: `h1` = team name, eyebrow = owning club; « Entente CTC » only with 2+
  clubs; next-event tile links to the first upcoming event and survives toggling the agenda to
  « Passés »; no tile when nothing is upcoming; `?tab=` still selects each tab; manager sees the four
  accordion triggers collapsed, player sees none (or only « Compétitions FFBB »); opening each item
  renders its component (one error branch each, MSW); delete button only for owner admin.
- `backLink.test.ts`: labels without the arrow.
- Each settings component's test: `headingless` renders no `heading`.
- A11y: the bar's back link is named « Retour à … ».

## 5. Screenshots

390 manager (settings folded; one item open), 390 player, 1280 manager. Fixture: extend a copy of
`authenticated-admin-session.json` with the team, two clubs, roster, two upcoming events and one
FFBB link; commit it as `scripts/fixtures/team-detail-manager.json`.
