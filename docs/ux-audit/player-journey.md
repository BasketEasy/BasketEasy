# Kluvo — The Player's Golden Journey

Date: 2026-09-02. Scope: the whole logged-in app, re-read from the point of view of the account type that outnumbers every other one — a plain licensed player, and the parent who holds a young player's account. Analysis and proposals only; no code under `app/` or `packages/` was changed in this pass.

Companion artefacts:

- **Implementation plan:** [`./player-first-implementation-plan.md`](./player-first-implementation-plan.md) — the build order for everything below: design-system work first, then ten phases, with the frontend-only ones front-loaded.
- **Mockups (high-fidelity, real Parquet tokens):** [`./mockups/index.html`](./mockups/index.html) — seven screens, player and manager variants, phone + desktop. PNG renders in [`./mockups/png/`](./mockups/png/).
- **Flow wireframes:** [`./wireframes/player-golden-journey.svg`](./wireframes/player-golden-journey.svg), [`./wireframes/proposed-player-home.svg`](./wireframes/proposed-player-home.svg), [`./wireframes/proposed-role-split.svg`](./wireframes/proposed-role-split.svg).

---

## 0. What this supersedes in the 2026-08-11 audit

The [previous audit](./README.md) and its [scoping plan](./scoping-plan.md) have effectively all shipped: `EmptyState` exists and is used everywhere, `TeamDetailPage` is a tab shell, the club switcher and `useAdminClubs()` landed, `GET /me/dashboard` backs a real dashboard, the day-grouped agenda replaced the events table as the default, and `ResponsiveTable` collapses tables on mobile. The Parquet direction then rebuilt the surface language on top of that. **None of that work is questioned here.**

**Still holds:**

- Tables are the wrong default for events and rosters (2.1) — and the fix landed.
- `TeamDetailPage` needed tabs (2.2) — landed.
- The header did not scale past a couple of admin clubs (2.4) — the switcher landed.
- Mobile needs non-tabular layouts (2.6) — landed.

**What this pass supersedes:**

| Prior framing                                                                                 | Why it needs revising                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The dashboard should show **stat tiles**, an agenda strip, and team cards" (2.5, scoping §4) | Correct for an admin. For a player the four tiles collapse to two counters (`DashboardPage.tsx:180-192`) that report a number nobody can act on, above the only content that matters.                             |
| "One tab set on `TeamDetailPage`, role-gated by hiding two tabs" (scoping §2)                 | Hiding two tabs is not the same as designing for the other role. What is left — Effectif / Statistiques / Événements plus two stacked view-mode toggles — is still a management page with the management removed. |
| "Mobile = collapse tables into cards" (2.6)                                                   | Presentational only. The mobile problem for a player is **navigational**: every destination is behind a burger, and none of them is "my next match".                                                              |
| "The month grid (5b) waits for RSVP/convocation data"                                         | RSVP, convocations, venue, logistics and votes have all since landed — the data exists now. The grid is still not proposed, but for a different reason: see §8.                                                   |

The structural finding this pass adds is not a defect list. It is that **the information architecture is club-shaped** — create a club, administer a club, list its members, drill into a team — while the overwhelming majority of accounts are licensees who traverse those administration surfaces to reach three facts about themselves.

---

## 1. Personas

Three, drawn from the CD44 market the product targets (`docs/market-research.md`, `docs/brand.md`). Names and clubs used consistently across every mockup.

### 1.1 Léa Moreau, 24 — senior player (the majority case)

Rostered on **Seniors Filles 1** at **AS Saint-Herblain**, a CTC team shared with ESB Rezé. One `TeamPlayer` row, `role: PLAYER`, no `ClubMembership.role = ADMIN`, no `TeamAdmin` grant. She opens the app perhaps four times a week, always on a phone, usually for under a minute.

Jobs, in her words:

1. « Je suis convoquée samedi ? » — am I in the 12?
2. « J'ai répondu ? » — did my answer go through, can I change it?
3. « C'est où, à quelle heure, comment j'y vais ? »
4. « Qui vient ? » — is there a real session tonight or are we five?
5. « C'est moi qui apporte les ballons ? »
6. « On a gagné combien ? J'ai marqué combien ? »
7. « Le vote est encore ouvert ? »

Six of those seven are answered by data the API already stores. Zero of them are answered on the screen she lands on.

### 1.2 Karim Benali, 41 — parent of Yanis (U13)

Yanis is 12. He does not have a phone. Karim reads the convocations, answers for him, drives him to the gym, and wants to know whether other parents are coming to the away match at Orvault.

**Karim cannot exist in the data model.** `Player.userId` is a single nullable link to one `User` (`server/prisma/schema.prisma:32`), and `@@unique([clubId, userId])` (`schema.prisma:43`) forbids one account from holding two players in the same club — so a parent of two kids in one club is structurally impossible. Today the only workable arrangement is the one SportEasy users already fall into: **the child's account is held by the parent**.

Design consequence, and it is a real one: French product copy on every player-facing surface must be **`vous`, adult-register, and never assume the reader is the player**. « Vous êtes convoquée » works for Léa and for Karim reading on Yanis's behalf; « Tu es convoqué » only works for one of them. The mockups follow this rule throughout. The real fix is a `PlayerGuardian` model — `docs/feature-set.md`'s P2 "parent/player self-service" — and is out of scope here, listed in §7.

### 1.3 Inès Petit, 38 — coach **and** rostered player

Coach of Seniors Filles 1 (`TeamPlayer.role: COACH`), `TeamAdmin` on the U15 Filles, and still turns out as a player when the seniors are short. The data model already describes her precisely: `canManage` and `isRostered` are resolved independently (`EventDetailPage.tsx:112-113`), and `CLAUDE.md` is explicit that a `COACH` roster row grants no permissions.

Nothing in the UI expresses that double role. She sees the manager surfaces; her own RSVP control appears in the same place a player's does, with no signal that it is hers rather than a management widget. Her jobs are a superset: everything Léa needs, **plus** « qui n'a pas répondu et à qui je dois écrire ce soir ? », « le groupe est-il fait pour samedi ? », « la feuille de match est-elle rentrée ? ».

---

## 2. The weekly loop, mapped

A club's week has a fixed rhythm: trainings mid-week, matches on Saturday, the scoresheet and the vote in the days after. Léa's loop and the app's answer to it:

| Moment                | Her question                   | Where the answer lives today                                  | Taps from launch  |
| --------------------- | ------------------------------ | ------------------------------------------------------------- | ----------------- |
| Wed 19:00, at the gym | « c'est bien ce soir ? »       | Dashboard → "Cette semaine" row                               | 0–1               |
| Wed 21:00, in the car | « je suis convoquée samedi ? » | Dashboard row **if within 7 days**, else invisible            | 1, or unreachable |
| Wed 21:01             | « je réponds oui »             | Team page → Événements tab → find card → RSVP                 | 4                 |
| Fri                   | « c'est où déjà ? »            | Event detail → Aperçu → Lieu tile (text only)                 | 5                 |
| Fri                   | « qui vient ? »                | Event detail → Effectif tab                                   | 6                 |
| Sat 23:00             | « on a gagné ? »               | Nowhere for her                                               | ∞                 |
| Sun                   | « je vote pour la MVP »        | Team page → Événements → toggle "Passés" → find match → Voter | 6                 |

The loop is not broken — every capability exists — but it is **routed through the club hierarchy**, and half of it is behind a date window that excludes the exact events she cares about.

---

## 3. Friction inventory

Ordered by how much of the weekly loop each one blocks. Every item cites the code.

### 3.1 The dashboard's agenda rows do not lead to the event

`AgendaRow` links to `/clubs/:clubId/teams/:teamId?tab=events` (`app/src/pages/DashboardPage.tsx:49`) — the **team page**, not the event. The row already renders `myConvocation` and `myRsvpStatus` (`DashboardPage.tsx:60,66-70`), so it knows the player has not answered, and then sends them to a page where they have to find the same event again in a list. Three taps and one visual search stand between "I know I must answer" and "I can answer".

This is the single most expensive defect in the product's core loop, and the cheapest to fix.

### 3.2 The agenda window ends before the weekend a player cares about

`DEFAULT_AGENDA_WINDOW_DAYS = 7` (`server/src/dashboard/dashboard.service.ts:7`), resolved in `resolveRange` (`dashboard.service.ts:89-96`), and `useMyAgenda()` (`app/src/clubs/useMyAgenda.ts:6-11`) never passes `from`/`to`. Checked on a Wednesday, a match on the _following_ Saturday (10 days out) does not exist. That match is precisely the one with a convocation to answer and travel to organise. The parameters to fix this already exist on the endpoint and in `GetDashboardParams` (`packages/@basketeasy/types/my-dashboard.ts:28-33`).

### 3.3 A player's home screen opens with two counters and no action

For a user with no manage rights, `DashboardPage` renders "Événements — 7 prochains jours" and "En attente de réponse" (`DashboardPage.tsx:180-192`). The second is computed from exactly the events that are one tap below it (`DashboardPage.tsx:136-138`): the screen counts the player's outstanding decisions and then makes them navigate to act on them. Below that, "Cette semaine" (`DashboardPage.tsx:195-219`), then a full "Mes équipes" card grid (`DashboardPage.tsx:221-242`) that duplicates `MyTeamsPage` (`MyTeamsPage.tsx:149-169`) — a second nav destination reproduced on the landing page.

"Voir le calendrier →" (`DashboardPage.tsx:199`) points at `/my-teams`, which is a table of teams, not a calendar.

The user's own email address sits under the greeting (`DashboardPage.tsx:147-151`) — account data on a screen about the week.

### 3.4 There is no post-match surface for a player at all

Three separate mechanisms conspire:

- The agenda window is forward-only (§3.2), so a played match never appears on the home screen.
- The vote window opens 1 h after tip-off and closes 5 days later (`app/src/clubs/voteWindow.ts:8-9`), and the "Votes ouverts · N j restants" badge (`EventVoteBadge.tsx:15-28`) is rendered only inside `TeamEventsAgenda`/`EventRow` — i.e. on a team page, under the "Passés" toggle (`TeamDetailPage.tsx:859-869`).
- The **score does not exist as an event field**. `TeamEvent` (`packages/@basketeasy/types/events.ts:19-51`) has no result. The final score lives only in `ParsedScoresheetData.homeScore/awayScore` (`packages/@basketeasy/types/scoresheet-extraction.ts:48-61`), behind a per-event `GET .../scoresheet-extraction` and only after a manager confirms.

So the half of the loop the product is actually differentiated on — AI scoresheet capture, MVP voting, per-player season stats — is invisible to the player it was built for, unless she goes looking for it in a management page's secondary toggle.

### 3.5 Navigation gives a player almost nothing, and hides it behind a burger

`AppHeader` renders four links (`AppHeader.tsx:157-174`): Tableau de bord, Mes équipes, Effectif (admin-only, `AppHeader.tsx:165-169`), **Créer un club**. For a licensee that is two useful destinations and one — "Créer un club" — that will never apply to them, occupying a permanent slot in the primary navigation.

Below the desktop breakpoint the whole thing collapses into a burger panel (`AppHeader.tsx:204-226` and `229-246`). The Parquet active-nav treatment (`bg-orange-tint` + `shadow-nav-active`, `AppHeader.tsx:80`) is real and good — and invisible on a phone, because the panel is closed almost always. Nothing on screen says where you are, and no destination is "my next match".

For a player with exactly one team, `/my-teams` is a whole nav destination that renders a one-row table with a "Voir" button (`MyTeamsPage.tsx:149-169`) — a click-through page standing in for a link.

### 3.6 The event page buries the decision

On `EventDetailPage`, in source order: back link (`:167-169`), `<h1>` (`:173-175`), a badge row (`:178-180`), the hero card with the time block and the VS row (`:183-282`) — and only then the "Convoqué par le coach" badge and the RSVP control (`:284-318`). At 390 px that is a scroll before the player can answer the question they opened the page for.

`myConvocation` is a bare boolean (`events.ts:36`) and the UI renders it as a bare badge: it never says who called you up, out of how many, or by when. There is no deadline anywhere in `Event` (`schema.prisma:185-207`).

### 3.7 "How do I get there" is not served

`event.location` is a free-text string (`events.ts:24`) rendered as an `InfoTile` of plain text (`EventDetailPage.tsx:375-391`). No map link, no itinerary, no distance — for a persona whose second question is « c'est où ? » and whose third is « comment j'y vais ? », on an away match in a gym they have never visited. A `maps:` deep link built from `encodeURIComponent(location)` is frontend-only and needs no schema change.

### 3.8 "Who else is coming" is behind a tab named after something else

`EventRosterTab` sits under a tab labelled **Effectif** (`EventDetailPage.tsx:335,444-451`). "Effectif" means the squad; the question is "who is coming tonight". The aggregate counts exist only inside that tab's collapsible breakdown (`EventRosterBreakdown` / `EventRow.tsx:103-104`), each of which fetches on expand — correct for one row, unusable as a summary on a card or above the fold.

### 3.9 The team page is a management page with the management hidden

For a player the tab list resolves to Effectif / Statistiques / Événements (`TeamDetailPage.tsx:177-193`, `518-536`), with `events` as the default. Above the content sit **two stacked segmented controls** — Agenda/Liste (`:848-856`) and À venir/Passés (`:859-869`) — one of which only leads to the paginated admin table (`:957-993`) that a player has no use for. The tab badges count roster size and event totals — management framing.

### 3.10 Season statistics never surface the player's own line

`TeamSeasonStatsTab` renders an 8-column table over the whole squad (`TeamSeasonStatsTab.tsx:16-25,160-164`). To answer « combien j'ai marqué cette saison ? » the player scans for her own name. **She cannot even be highlighted client-side**: `TeamSeasonPlayerStats` carries no `isMe` (`packages/@basketeasy/types/team-stats.ts:10-37`) and the client never learns its own `teamPlayerId` — `MyTeamSummary` carries only `rosterRole` (`packages/@basketeasy/types/my-teams.ts:9`). This is the one hard blocker in the whole redesign, and it is one server-side field, on the model of `EventRsvpRosterEntry.isMe` (`events.ts:139`).

### 3.11 Smaller items, worth folding into the same pass

- Every viewer of a team page triggers `GET .../teams/:teamId/admins` via `useIsTeamManager` (`app/src/clubs/useIsTeamManager.ts:5-13`); the endpoint is open to `MEMBER` (`server/src/teams/teams.controller.ts:203-205`), so a plain player fetches — and could read — the team admins' e-mail addresses on every visit. Not a UX issue; flagged because this pass touched it.
- `EventDetailPage`'s back link is hardcoded to the team page (`EventDetailPage.tsx:168`) while `TeamDetailPage` uses the origin-aware `useBackLink()` (`app/src/clubs/backLink.ts`). A player arriving from the dashboard cannot get back to it.
- `TeamFfbbLinkList` renders above the tabs for everyone (`TeamDetailPage.tsx:503`), pushing a player's content further down for a row of competition chips.
- **Nothing sends a reminder.** No mailer or scheduled job exists in `server/src`; the BullMQ "scheduled reminders" of `docs/architecture.md` are unbuilt. The entire RSVP loop therefore depends on the player opening the app unprompted — which makes every tap saved in §3.1–3.3 worth more than it looks.

---

## 4. The redesign

Five moves. Each is scoped so a player-facing improvement never costs a manager a capability.

### 4.1 `/dashboard` becomes two different screens

The route stays; the content branches on `hasManageRights`, a branch that **already exists** (`DashboardPage.tsx:130`) and today only chooses which counters to print.

**Player — « Ma semaine »** ([`mockups/player-home.html`](./mockups/player-home.html)). Four blocks, in this order, each answering one question:

1. **« Prochain rendez-vous »** — the next event, whatever its type: time block, address, `Itinéraire`, my answer, my equipment duty, a presence summary. _Where am I going next._
2. **« À répondre (n) »** — upcoming events with `myRsvpStatus === null`, convocations first, **each carrying the tri-state control inline**. _What do I owe an answer on._ The block vanishes when nothing is outstanding — the only empty state in the app that is good news.
3. **« Les 14 prochains jours »** — day-grouped agenda over a fortnight, not a week. _What is coming._
4. **« Après le match »** — result, my line, the open vote window. _What just happened._

Removed for this persona: the stat tiles, the "Mes équipes" card grid (the bottom bar owns that), the e-mail line.

**Manager — « Accueil »** ([`mockups/admin-home.html`](./mockups/admin-home.html)). The four tiles, "Cette semaine" and the team cards are all **kept verbatim**, including the documented club-scoped definition of "Joueurs au total" (`dashboard.service.ts:42-44`). What changes: a **« À traiter (n) »** band goes above them — match with no convocations sent, event at J-3 with N non-responders, played match with no confirmed scoresheet, licensees with no `Player.userId` — and the agenda rows gain response counts instead of only the manager's own RSVP (`DashboardPage.tsx:66-70`).

### 4.2 A bottom tab bar replaces the burger

[`mockups/mobile-nav.html`](./mockups/mobile-nav.html). Four fixed items, contents by role:

|                    | 1                                          | 2                                           | 3                               | 4          |
| ------------------ | ------------------------------------------ | ------------------------------------------- | ------------------------------- | ---------- |
| Player / parent    | **Ma semaine** (badge: réponses attendues) | **Mon équipe** — or **Mes équipes** with >1 | **Résultats**                   | **Profil** |
| Coach / club admin | **Accueil** (badge: à traiter)             | **Équipes**                                 | **Club** (active club's roster) | **Profil** |

Justification against the existing header, which the header cannot meet:

- **The context is a gym.** One hand, phone held low, poor light. A 44 px target at thumb height beats a burger in the top-right corner.
- **The active state becomes visible.** Parquet's active-nav treatment already exists; on mobile it is simply never on screen.
- **The item count is structurally fixed at four**, which the header was not before the switcher landed.
- The header **stays**, carrying the club switcher (admin), the context line and the account avatar. It loses the burger and the link list.
- **"Créer un club" leaves the primary nav** for the account menu, for both roles: it is a once-in-a-lifetime action for an admin and never applies to a player.

`/my-teams` is not deleted. It becomes the player's tab 2 _when they have more than one team_ — the parent of two children, the senior who fills in for the U18s.

### 4.3 The event page is reordered around the decision

[`mockups/player-event-detail.html`](./mockups/player-event-detail.html) / [`mockups/manager-event-detail.html`](./mockups/manager-event-detail.html). Same route, same page, one branch on `useIsTeamManager()`.

**Player:** hero → **decision band** (convocation stated as a sentence — « Inès vous a retenue dans le groupe des 12 » — plus the RSVP control) → **« S'y rendre »** (address, `Itinéraire`, transport note, equipment duty) → **« Qui vient ? »** (meter + first names + "voir les 12") → coach notes. **The tabs disappear**: without the management tools the page fits in one scroll.

**Manager:** hero → **pilot band** (convoked count, non-responders, meter, `Modifier la convocation`, `Relancer les N sans réponse`) → logistique → match roster with per-row RSVP and convocation state → **« Après la rencontre »** with the scoresheet capture CTA. Nothing is removed: Modifier, Supprimer, Convocations, Logistique and the scoresheet flow are all present, regrouped by _when they are used_ (before / during / after) rather than by tab.

A rostered coach keeps her own RSVP control, rendered under the pilot band — the double role of §1.3 made visible for the first time.

### 4.4 The team page splits by role

[`mockups/player-team.html`](./mockups/player-team.html) / [`mockups/admin-team.html`](./mockups/admin-team.html).

**Player: three tabs — Agenda · Effectif · Mes stats.**

- _Agenda_ is the default and drops the Agenda/Liste toggle entirely; À venir/Passés stays. Every card carries its own RSVP control, so the weekly loop closes here as well as on the home screen.
- _Mes stats_ leads with a personal card (MJ, PTS/M, meilleur total, FA/M, the points-repartition bar, distinctions) and then a compact squad ranking **with the player's own row marked**. The repartition legend's wording is carried over verbatim — the "this is not a shooting percentage" rule in `CLAUDE.md` outranks any compression of this screen. MPG and minutes stay absent, for the reason `CLAUDE.md` gives.

**Manager: the five tabs stay exactly as they are**, plus a « à traiter » band at the top of the agenda and response counts + a `Convoquer` action on each card. The paginated Liste view is kept in full and framed as the manager's desktop tool.

### 4.5 A post-match surface exists

The **Résultats** tab (player) and the "Après le match" block (both roles) read the _same_ `GET /me/dashboard` with an inverted window — `from = now − 30 j`, `to = now`. Each past match shows the score, the player's own line, and the vote state while the 5-day window is open. This closes the half of the loop that today has no entry point, and it is the surface that finally makes the scoresheet-capture differentiator visible to the people it produces data about.

---

## 5. Prioritized changes

Ranked by (loop impact ÷ cost). "Blocking API" marks items that cannot ship frontend-only.

| #   | Change                                                                                                                 | Why                                                                                                         | Size        | API                 |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------- | ------------------- |
| 1   | Dashboard agenda rows link to the **event** and carry the RSVP control inline                                          | Removes 3 taps + a visual search from the most repeated action in the product (§3.1)                        | **S**       | none                |
| 2   | `/dashboard` becomes « Ma semaine » for a player: next-RDV hero, « À répondre », no stat tiles, no team-card duplicate | Turns a status readout into the week's to-do list (§3.3)                                                    | **M**       | partial (§6.1)      |
| 3   | Bottom tab bar; role-aware nav; « Créer un club » to the account menu                                                  | A player currently has two useful destinations, both behind a burger, neither being their next match (§3.5) | **M**       | none                |
| 4   | Agenda window 7 → 14 days for players                                                                                  | One query parameter; makes next Saturday's match exist (§3.2)                                               | **XS**      | none                |
| 5   | Event page reordered: decision band above the fold, « S'y rendre » with an itinerary link, « Qui vient ? » inline      | Answers jobs 1–4 without a scroll or a tab (§3.6–3.8)                                                       | **M**       | partial (§6.2–6.3)  |
| 6   | Post-match surface: result + vote CTA on home, « Résultats » destination                                               | The entire second half of the loop has no entry point today (§3.4)                                          | **L**       | **blocking** (§6.4) |
| 7   | Team page role split: player gets Agenda / Effectif / Mes stats; power views stay manager-only                         | Two segmented controls and a paginated admin table sit above a player's content (§3.9)                      | **M**       | none                |
| 8   | `isMe` on season stats + personal stats card                                                                           | One server field unblocks the only screen a player literally cannot use today (§3.10)                       | **S**+**M** | **blocking** (§6.5) |
| 9   | Manager: « À traiter » band on home and on the team agenda                                                             | The manager's own loop is equally undirected — nothing flags a match with no convocations                   | M           | **blocking** (§6.6) |
| 10  | Response counts (`rsvpSummary`) on every agenda card, both roles                                                       | Removes the per-event expand-to-fetch pattern from list contexts                                            | S+**API**   | **blocking** (§6.2) |
| 11  | `Relancer les N sans réponse`                                                                                          | Without any reminder channel the whole RSVP loop is opt-in by the player                                    | L           | **blocking** (§6.7) |
| 12  | Parent/guardian model                                                                                                  | The U13-parent persona has no representation at all (§1.2)                                                  | L           | **blocking** (§6.8) |

Suggested sequencing: **1 → 4 → 3 → 2 → 5 → 7** are frontend-only or one-parameter changes and deliver most of the loop. **8 → 10 → 9 → 6** follow as small, additive backend work. **11 → 12** are separate initiatives.

---

## 6. New API needs

Written types-first, per `CLAUDE.md` (`packages/@basketeasy/types` → NestJS DTO → frontend caller).

### 6.1 `MyAgendaEvent` should carry what `TeamEvent` carries

`MyAgendaEvent` (`packages/@basketeasy/types/my-dashboard.ts:4-20`) has drifted behind `TeamEvent` (`events.ts:19-51`): it lacks `venue`, `timeConfirmed`, `logistics`, `isImported`, `recurrenceId`. The home screen therefore cannot show "Domicile / Extérieur", "Heure à confirmer", or "Vous apportez les chasubles" — three of the seven things a player opens the app for. `DashboardService.toAgendaEvent` (`dashboard.service.ts:99-115`) already has the row in hand; this is a `select`/mapping change, not a new query.

### 6.2 Aggregate RSVP counts per event

`rsvpSummary: { going, notGoing, maybe, pending }` plus `convokedCount`, on both `TeamEvent` and `MyAgendaEvent`. Today the breakdown exists only by expanding a per-event `GET .../rsvps` (`EventRow.tsx:103-104`, `EventRosterTab`), which is correct for one row and unusable for a list or an above-the-fold summary. This is the single most reused new field across the mockups (screens 1, 2, 3, 5, 7).

### 6.3 A response deadline

`rsvpDeadline` on `Event`. « Réponse attendue avant vendredi 20h00 » is the phrase that converts a passive notification into an obligation, and nothing in the schema stores it (`schema.prisma:185-207`). Needs a migration and an edit control; small.

### 6.4 A match result on the event

`result: { ourScore, theirScore, outcome: 'WIN' | 'LOSS' | 'DRAW' } | null`, derived from the **confirmed** `ScoresheetExtraction` and `Event.venue` — the same `venue → home/away` resolution `MatchPlayerStat` writing already uses. Reasons to put it on the event rather than have clients read `parsedData`:

- `parsedData` is the verbatim OCR read and must stay that way (`CLAUDE.md`, Team stats module); a projection is the established pattern.
- A player must never be shown an unconfirmed score.
- Reading it per-event from the scoresheet endpoint makes a results list N+1.

Plus a per-match personal line for the player: reuse `MatchPlayerStat`, exposed as `myMatchStats: { points, fouls } | null`.

### 6.5 `isMe` on `TeamSeasonPlayerStats`

`packages/@basketeasy/types/team-stats.ts:10-37`. One boolean, resolved server-side exactly as `EventRsvpRosterEntry.isMe` is (`events.ts:139`). **Hard blocker**: the client cannot derive it, because it never learns its own `teamPlayerId` on this screen. Everything else in §4.4's player stats tab is composition over data that already ships.

_(The mockup shows a jersey number, « n° 7 ». `CLAUDE.md` explicitly forbids a `jerseyNumber` column on `TeamPlayer`, for a documented reason. If it is wanted it must be derived from the most recent `MatchPlayerStat`; otherwise drop it from the design. Flagged rather than silently designed in.)_

### 6.6 Action items on the dashboard

`actionItems` on `GET /me/dashboard` for managers: `MATCH_WITHOUT_CONVOCATIONS`, `EVENT_PENDING_RSVPS` (with a J-n threshold), `MATCH_WITHOUT_CONFIRMED_SCORESHEET`, `PLAYERS_WITHOUT_ACCOUNT`. All four derive from data already stored; none is queryable in one round trip today.

### 6.7 Reminders

`POST .../events/:eventId/reminders` (targeted at non-responders) and the scheduled job behind it. Brevo is already the chosen mail provider (`docs/backend-stack.md`) and BullMQ is already in the architecture — neither is wired. Until this exists, every RSVP depends on the player opening the app of their own accord, which is the strongest argument for items 1–4 above.

### 6.8 `PlayerGuardian`

A join model letting one `User` act for one or more `Player`s, replacing the 1–1 `Player.userId` + `@@unique([clubId, userId])` arrangement (`schema.prisma:32,43`) for the parent case. `docs/feature-set.md` P2. Until it exists, the product should say plainly that a minor's account is held by a parent, and its copy should read that way.

### 6.9 Not needed

- A geocoded venue. `location` as free text is enough for a `maps:` deep link; a distance or an embedded map is not.
- A `GET /me/next-event`. The existing dashboard endpoint with a window answers it.
- A past-events endpoint. `GET /me/dashboard?from=…&to=…` with an inverted window already works.

---

## 7. Where the design met a `CLAUDE.md` constraint

Per the repo rule, these are raised rather than transcribed into the mockups.

1. **The bottom tab bar's active state needs a new token.** `shadow-nav-active` is `inset 0 -2px 0 #D4622A` (`packages/@basketeasy/ui/tailwind-preset.cjs:72`) — a rule at the _bottom_ of the item, correct for a top nav and wrong for a bottom bar, where it must sit at the top edge. The constraint ("every token lives in one file; add it there and name it") wins: this needs a named `nav-active-top`, never a `shadow-[inset_0_2px_0_…]` at the call site. The mockups' CSS marks it explicitly as a proposed token.
2. **Bottom-bar icons must be `@basketeasy/ui/icons/*` with a `tone` prop**, not `text-*` classes at the call site. Three icons do not exist yet (home, person, bell) and would need adding to the icon set with the shared `icon-variants` tone API.
3. **"Convoquée" is a `Badge` `tone`, never a colour.** The mockups use `solid`/`brand` for the convocation and `soft`/`structure` for the venue; if a call site ever needs a look these enums cannot express, the fix is a new variant on `Badge`, not a class.
4. **The stats screen's compression stops at the legend.** The « ce n'est pas une adresse » sentence and the point _counts_ (never percentages) are reproduced verbatim on the personal card — the module's rule outranks the desire for a tighter mobile card.
5. **Modal vs. inline holds.** RSVP stays an inline segmented control everywhere (single-field, low-risk, high-frequency); convocation editing stays a `Dialog` (multi-field, infrequent); the delete confirm stays a `Dialog`. The redesign adds no modal.
6. **Query branches.** Every new block (« À répondre », « Après le match », « À traiter », « Mes stats ») is a query consumer and must branch `error → loading → empty → data`, in that order. Trap 4 of the Parquet spec — rewriting a file loses its error branch — applies directly to `DashboardPage` and `TeamDetailPage`, which this work rewrites.
7. **Responsive record = one component.** The event card for the player home, the team agenda and the results feed is _one_ component branching on `useTableLayout()`/viewport, not a `…Card`/`…Row` pair.

---

## 8. What is deliberately not proposed

- **The month-grid calendar** (audit item 5b). The blocking data now exists, so the old reason is spent — but a player never asks "what does September look like"; they ask "what is next and am I in it". A grid answers a planner's question, and the planner is the manager, on a desktop. Revisit as a manager-only desktop view if scheduling (P1 créneaux) lands and needs it.
- **In-app chat.** `docs/feature-set.md` deprioritises it and the loop above does not need it; « Relancer » (§6.7) covers the one message that matters.
- **A separate player app or route namespace.** Every proposal here reuses the existing routes and the three role signals already in the client (`useIsClubAdmin`, `useIsTeamManager`, `useMyTeamList().rosterRole`). No new authorization concept is introduced — only ordering and vocabulary change.
- **Removing anything from the manager.** Every management surface, toggle, table and action survives; the "Liste" view keeps its search, date bounds, sort and pagination.

---

## 9. Mockups

All under [`./mockups/`](./mockups/), self-contained HTML using the real tokens from `packages/@basketeasy/ui/tailwind-preset.cjs` and the two Parquet typefaces; phones at 390 px, desktop at 980 px. PNG renders in [`./mockups/png/`](./mockups/png/). Start at [`./mockups/index.html`](./mockups/index.html).

| Planche                                                            | Rôle     | Contenu                                                        |
| ------------------------------------------------------------------ | -------- | -------------------------------------------------------------- |
| [`player-home.html`](./mockups/player-home.html)                   | Joueur   | « Ma semaine » — mobile + desktop                              |
| [`player-event-detail.html`](./mockups/player-event-detail.html)   | Joueur   | Match : convocation, réponse, s'y rendre, qui vient            |
| [`manager-event-detail.html`](./mockups/manager-event-detail.html) | Coach    | Le même match, côté pilotage                                   |
| [`player-team.html`](./mockups/player-team.html)                   | Joueur   | Équipe : onglets Agenda et Mes stats                           |
| [`admin-team.html`](./mockups/admin-team.html)                     | Coach    | Équipe : cinq onglets + bande « à traiter » — mobile + desktop |
| [`mobile-nav.html`](./mockups/mobile-nav.html)                     | Les deux | Burger actuel vs. barre d'onglets basse, par rôle              |
| [`admin-home.html`](./mockups/admin-home.html)                     | Coach    | « Accueil » — mobile + desktop                                 |

Flow wireframes, in the existing house SVG format: [`player-golden-journey.svg`](./wireframes/player-golden-journey.svg) (the loop, today vs. proposed, with tap counts), [`proposed-player-home.svg`](./wireframes/proposed-player-home.svg) (block structure and data sources), [`proposed-role-split.svg`](./wireframes/proposed-role-split.svg) (which screens fork and which do not).
