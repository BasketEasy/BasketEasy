# Poule weekend results

Status: draft (loop 1 — poule URL confirmed by hand, payload shape still open)
Date: 2026-09-03

## Why

A team's own match result already lives in BasketEasy once its scoresheet is confirmed
(`server/src/scoresheets`, `EventScoresheet`/`ScoresheetExtraction`). What a coach can't see today is
how the rest of their **poule** (the FFBB group of ~8-10 teams a team is competing against all season)
did the same weekend — did the two teams above us in the standings both win, is our next opponent on
a losing streak. That's context a coach currently gets by opening `competitions.ffbb.com` by hand and
reading it off the federation's own site, which is exactly the "companion layer to the FFBB's
mandatory federal stack" gap `CLAUDE.md` calls out: FFBB already computes and publishes this, we
shouldn't ask anyone to re-enter it.

The `server/src/ffbb` module (see
[`2026-08-26-ffbb-calendar-import-design.md`](./2026-08-26-ffbb-calendar-import-design.md)) already
proved the mechanism: `competitions.ffbb.com` team pages carry their data as embedded Next.js RSC
JSON, fetchable with no auth. This spec extends that same boundary — one new `FfbbProvider` method,
one new adapter file section — to pull the **poule's** results and standings, not just one team's own
fixtures.

## Scope

**In scope:**

- `FfbbProvider.getPouleStandings(pouleRef)`: given a poule reference (see
  "Where the poule reference comes from" below — a competition code plus its `phase`/`poule` ids),
  returns every team's current standing (rank, played, won, lost, points) plus the most recently
  completed matchday's results (both scores, not just ours).
- A read-only **"Résultats de la poule"** panel on the team's Agenda, scoped to the weekend just
  passed, plus a full standings table.
- A manual refresh, mirroring the existing FFBB calendar import's manual-button pattern — no
  scheduled job this cut.

**Out of scope (deferred, don't build speculatively):**

- **Automatic/scheduled re-fetch.** Same reasoning as the calendar import: v1 is a manual action.
- **Writing poule data into `Event`/`MatchPlayerStat`.** This is federation data about other clubs'
  matches, not something BasketEasy manages — it renders in its own panel and never touches a table
  this app treats as its own source of truth. In particular it must never overwrite a `MatchPlayerStat`
  row derived from our own confirmed scoresheet, even when both describe the same match.
- **Per-opponent detail (their roster, their box score).** The poule page gives final scores and
  standings, not a box score — there is nothing more granular to show.
- **Any poule for a team with no `TeamFfbbLink`.** Same precondition as the calendar import: no link,
  no FFBB data, full stop.
- **Cup/knockout competitions.** `getPouleStandings` targets a round-robin poule (rank/played/won/lost
  makes sense there); a cup bracket is a different shape and isn't handled by this design.

## Where the poule reference comes from

**Resolved this loop — the URL shape is confirmed, by hand, against a live page** (this sandbox still
has no egress to `competitions.ffbb.com`; a teammate opened the real site and supplied it):

```
https://competitions.ffbb.com/ligues/pdl/comites/0044/competitions/dm3?phase=200000002897998&poule=200000003056186&journee=1
```

This changes the original guess in two ways, both load-bearing for the data model below:

1. **It's the competition's own page, not a `/classement` sub-path.** `ligues/<x>/comites/<y>/competitions/<code>` — the same prefix already parsed out of every match detail link
   (`MATCH_DETAIL_PATH_REGEX`) — resolves directly, with `phase`/`poule`/`journee` as **query
   parameters**, not further path segments. So the "try `.../classement`" plan in the previous
   revision of this section is wrong and is replaced by the shape above.
2. **A poule sits under a `phase` inside a `competition`, and both need their own ids.** `dm3` alone
   is the competition (division), not the poule — confirming Open question 2 below the coarser way:
   `<code>` is coarser than a poule, and `phase`/`poule` are what actually scope it. Both are FFBB
   internal numeric ids (`200000002897998`, `200000003056186` — the same id shape as
   `TeamFfbbLink.ffbbEngagementRef`'s trailing engagement id), not human-readable, so there is no way
   to construct them from a competition code alone — they have to be **read off already-fetched data**,
   the same way `opponentLabel`/`isHome` are read off `idEngagementEquipe1`/`2` today.

**Still open, now narrower (see Open questions):** where `phase`/`poule` ids are readable from. The
working hypothesis, consistent with how `numeroJournee` already surfaces on every `FfbbMatch` in the
team-page payload (see the calendar-import spec's research section): each `rencontre` object likely
carries its own `idPhase`/`idPoule` (or similarly named) fields alongside `numeroJournee`, the same
object that already yields `id`, `date_rencontre`, `joue`, `idEngagementEquipe1/2`. If so, no second
fetch is needed to *discover* the poule ref — it's sitting in the payload the calendar import already
pulls, just not extracted yet. **What a live fetch still needs to confirm:** the exact field names for
`phase`/`poule`, whether `journee` on the standings URL is required (does omitting it default to "the
current/latest journée," or 400/redirect?), and the embedded RSC payload shape at that URL (does it
carry the classement for the whole season plus that one journée's results, or does classement need its
own fetch without `journee` set?).

**Proposed data shape**, updated for the confirmed query-param structure: capture a `pouleRef` as the
**full resolvable URL** (`ligues/<x>/comites/<y>/competitions/<code>?phase=<id>&poule=<id>`, `journee`
omitted so the provider can pick "latest" itself once that's confirmed) — same "store the whole
resolvable reference, not a bare id" discipline `TeamFfbbLink.ffbbEngagementRef` already established.

## Data model (Prisma)

No new table. Poule data is fetched live and rendered, never persisted — same "don't store what we
don't own" posture as the rest of the FFBB integration (imported `Event`s are the one exception,
because those become entities *we* manage RSVP/convocations on top of; a poule standings row is never
going to be edited or annotated inside BasketEasy, so there's nothing a table would buy beyond a
cache). `Team` gains one derived field, not a column: `pouleRef`, read off the most recent FFBB
import rather than stored — see Service logic.

## Service logic

### `FfbbProvider` (extended)

```typescript
export interface FfbbPouleTeamStanding {
  teamLabel: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  /** True for the team whose link this standings fetch was reached through. */
  isOurTeam: boolean;
}

export interface FfbbPouleResult {
  matchdayLabel: string | null; // e.g. "Journée 3", when FFBB exposes one
  homeLabel: string;
  awayLabel: string;
  homeScore: number;
  awayScore: number;
  /** True when either side is the team whose link this fetch was reached through. */
  involvesOurTeam: boolean;
}

export interface FfbbPouleStandings {
  standings: FfbbPouleTeamStanding[];
  /** The most recently completed matchday's results, most recent first. */
  latestResults: FfbbPouleResult[];
}

export interface FfbbProvider {
  // ...existing methods...

  /**
   * Standings and latest results for one poule. pouleRef is the full
   * resolvable path+query captured alongside a team's matches (see
   * FfbbEngagementFetchResult.pouleRef below) —
   * `ligues/<x>/comites/<y>/competitions/<code>?phase=<id>&poule=<id>`,
   * never a bare code/id, same "store the whole resolvable reference" rule
   * parseEngagementRef already follows for TeamFfbbLink.ffbbEngagementRef.
   */
  getPouleStandings(pouleRef: string): Promise<FfbbPouleStandings>;
}
```

`FfbbEngagementFetchResult` gains `pouleRef: string | null` (null when `phase`/`poule` ids can't be
read off any fetched match — e.g. a team with no matches yet this season, or a competition shape where
they genuinely aren't present). Building it needs two things `FfbbPageScrapeProvider.getMatchesForEngagement`
doesn't extract today: the `ligues/.../competitions/<code>` prefix (already computed for
`MATCH_DETAIL_PATH_REGEX`, currently discarded after venue resolution) and each raw match object's
`phase`/`poule` id fields (exact key names TBD — see Open questions), which aren't read at all yet
because nothing needed them before this spec.

### `FfbbPouleService` (new, `server/src/ffbb`)

`getPouleResults(clubId, teamId)`:

1. `assertTeamInClub` (existing pattern, every module in this codebase re-verifies the route's
   `:clubId` owns the target before touching it).
2. Load the team's `TeamFfbbLink`s; 404 if none. If more than one (a team in both a championship and a
   cup — see the calendar-import spec's "Multiple competitions per team"), use the most recently
   created link's `pouleRef` — a cup poule's standings aren't meaningful the way a league poule's
   are, and asking the coach to pick isn't worth building for a case CLAUDE.md's `TeamFfbbLink` docs
   already flag as the rarer one.
3. `FfbbProvider.getPouleStandings(pouleRef)`, wrapping any `FfbbPageFormatError` into a typed
   response the frontend renders as "Impossible de récupérer les résultats de la poule pour le
   moment" rather than a raw 500 — matching the calendar import's own failure-surfacing convention.

No caching layer this cut — a manual "Rafraîchir" button re-fetches every time, same cost profile as
the existing "Importer le calendrier" action.

## API surface

| Method | Route                                              | Guard          | Returns             |
| ------ | --------------------------------------------------- | -------------- | -------------------- |
| GET    | `clubs/:clubId/teams/:teamId/ffbb-poule-results`     | `JwtAuthGuard` | `PouleResults`       |

Same read audience as the team's events/stats — no write route, this is a pass-through read. `404`
when the team has no `TeamFfbbLink`, so the frontend can render the panel's "link a competition first"
empty state (linking to the existing FFBB-link UI, per the calendar-import spec) instead of a generic
error.

## Shared types (`packages/@basketeasy/types/ffbb.ts`)

```ts
export interface PouleTeamStanding {
  teamLabel: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  isOurTeam: boolean;
}

export interface PouleResult {
  matchdayLabel: string | null;
  homeLabel: string;
  awayLabel: string;
  homeScore: number;
  awayScore: number;
  involvesOurTeam: boolean;
}

export interface PouleResults {
  competitionLabel: string | null;
  standings: PouleTeamStanding[];
  latestResults: PouleResult[];
}
```

## Frontend

- New tab or panel? **Panel, not a tab** — this isn't a per-team owned resource the way roster/events/
  stats are; it's a read-only window onto FFBB's own data, closer in spirit to a widget than a section
  of the team's own record. Lands as a collapsible card on the **Agenda** tab (`TeamDetailPage`,
  `?tab=events`), placed below the upcoming-events list, per the same "don't add a sixth tab for
  something not owned by this team" reasoning that kept the FFBB-links list inline on team info rather
  than its own tab.
- **`PouleResultsPanel`** (`app/src/clubs/`): branches `error → loading → empty → data`, per
  `CLAUDE.md`'s query-branch rule — "empty" here specifically means "team has no `TeamFfbbLink`," with
  a `TextLink` to the team-info FFBB-linking section; "error" is the wrapped-`FfbbPageFormatError`
  case above, not indistinguishable from empty.
- Standings render as a `ResponsiveTable` (rank implicit from array order, team/played/won/lost/points
  columns, `.tabular` on the numeric ones), the row for `isOurTeam` visually distinguished — not with
  a new colour at the call site (`CLAUDE.md`'s closed-prop-API rule), but by giving `ResponsiveTable`'s
  row an existing `tone`/highlight prop if one exists, or adding one to the component itself if not.
- Latest results render as a simple list of `home — score : score — away` lines above the standings
  table, `involvesOurTeam` rows using `Text` with a `tone="brand"` heavier weight rather than a raw
  colour class.
- A "Rafraîchir" `Button` (`variant="ghost"` or similar low-emphasis existing variant — this is a
  secondary action next to the main Agenda content) triggers a refetch; outcome via `toast()` only on
  failure (success is just the panel updating in place, which is itself the confirmation — no need to
  toast a successful read the way a mutation's outcome would need one).
- Copy: "Résultats de la poule", "Classement", "Derniers résultats", "Rafraîchir".

## Testing

- `FfbbPageScrapeProvider`: `pouleRef` extraction from a match detail link (already-covered
  regex, new assertion on what's kept); `getPouleStandings` fixture-driven once a real fetch confirms
  the target page's shape (blocked — see Open questions).
- `FfbbPouleService`: no-link team 404s; multiple-links team picks the most recent; provider error
  wraps to the typed failure response, not a raw throw.
- Frontend: `PouleResultsPanel` error/loading/empty/data branches; `isOurTeam`/`involvesOurTeam`
  visual distinction present; refresh button triggers a refetch and toasts only on failure.

## Open questions (resolve before implementation start)

1. **URL shape — resolved this loop.** Was "does a standings page exist at all," now confirmed:
   `ligues/<x>/comites/<y>/competitions/<code>?phase=<id>&poule=<id>&journee=<n>`, a real URL from the
   live site. **Still open, narrower:** the embedded RSC payload's shape at that URL — same class of
   unknown the calendar-import spec resolved for the team page (plain JSON objects inside
   `self.__next_f.push(...)` chunks, or something else entirely for this page). **This still blocks
   writing `FfbbPageScrapeProvider`'s poule-standings extraction logic** — everything else in this spec
   (service layer, API surface, frontend) can be built and tested against a mocked `FfbbProvider` in the
   meantime. A follow-up session with live egress is fetching this now (per the calendar-import spec's
   own research method: fetch with a browser-like `Referer`/`Origin`/User-Agent, extract the
   `self.__next_f.push(...)` chunks, `JSON.parse` each candidate object) — when it reports back, replace
   this whole section and the Data model's field list with the confirmed shape rather than layering
   another guess on top.
2. **Where `phase`/`poule` ids are read from — narrowed, not yet confirmed.** `dm3` (the competition
   code) is confirmed coarser than a poule (see "Where the poule reference comes from"), so `phase`/
   `poule` ids are required and must come from somewhere already fetched. Working hypothesis: each raw
   match object in the team-page payload carries its own `idPhase`/`idPoule` (exact key names
   unconfirmed) alongside the already-known `numeroJournee`. The live-egress session should check the
   raw match objects it already has (the same ones venue resolution already parses) for these fields
   before assuming a second fetch is needed.
3. **Whether `journee` is required on the URL, and how "latest completed matchday" is found.** Does
   omitting `journee` default to the most recent one, or is it mandatory? If mandatory, does the page
   (at any single `journee` value) also expose the full-season classement, or does classement need its
   own fetch? If neither, this needs deriving client-side: fetch each journée in turn (or a range) and
   pick the highest with every match `joue: true`. Affects `FfbbPouleResult.matchdayLabel`'s reliability
   and whether `getPouleStandings` needs to make one fetch or several.
4. **Rate limiting / robots.txt for this page specifically** — not checked, same caveat the
   calendar-import spec noted for the team page ("no documented rate limits... more brittle than even
   the REST API would have been").

Given open questions 1–3 all resolve from the same live fetch, the recommended implementation order is
unchanged from the previous revision: land the service/API/frontend layers now against a mocked
`FfbbProvider` (so the feature is demoable and reviewable), and treat the real
`FfbbPageScrapeProvider.getPouleStandings` implementation as a follow-up loop once the live-egress
session's findings land — same two-step pattern the venue-resolution spec
([`2026-09-01-ffbb-match-venue-address-design.md`](./2026-09-01-ffbb-match-venue-address-design.md))
used successfully.
