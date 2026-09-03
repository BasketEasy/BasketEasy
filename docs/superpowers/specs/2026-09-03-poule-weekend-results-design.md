# Poule weekend results

Status: draft (research incomplete — see Open questions)
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

- `FfbbProvider.getPouleStandings(competitionRef)`: given a competition/poule reference (see
  "Where the poule reference comes from" below), returns every team's current standing (rank, played,
  won, lost, points) plus the most recently completed matchday's results (both scores, not just ours).
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

**This is the open design risk this spec can't fully close without live egress to
`competitions.ffbb.com`, which this sandbox doesn't have** (confirmed by a failed `WebFetch` against
the same example URL the calendar-import spec used — `EGRESS_BLOCKED`). What's already established by
the calendar-import work, reused here rather than re-derived:

- Every match's per-match detail page URL is `ligues/<x>/comites/<y>/competitions/<code>/match/<id>`
  (`server/src/ffbb/ffbb-page-scrape.provider.ts`, `MATCH_DETAIL_PATH_REGEX`) — already extracted
  today for venue resolution. The `<code>` segment (e.g. `dm3`) is very likely the poule/competition
  identifier FFBB itself uses, and it's already sitting in data this codebase parses; it just isn't
  captured anywhere yet.
- A competition/poule label is already read off the team page when present
  (`COMPETITION_LABEL_CANDIDATE_KEYS`: `libelleCompetition`, `libellePoule`, etc.) — confirming the
  concept exists in FFBB's own data, just not yet surfaced as a fetchable standings endpoint.

**Proposed (needs confirming against a live fetch before implementation):** capture that `<code>`
segment as `competitionRef` (full path `ligues/<x>/comites/<y>/competitions/<code>`, same "store the
full resolvable path, not a bare code" discipline as `TeamFfbbLink.ffbbEngagementRef`) the next time a
team's matches are fetched, and try a `.../competitions/<code>/classement` page (the French word for
"standings," matching FFBB's own site navigation) as the standings source. If that path 404s or
doesn't parse the way expected, this whole feature is blocked until a real fetch confirms the correct
path — this is a research spike, not a known-working target, unlike the original calendar-import
scrape which had a confirmed working URL before the data model was written.

## Data model (Prisma)

No new table. Poule data is fetched live and rendered, never persisted — same "don't store what we
don't own" posture as the rest of the FFBB integration (imported `Event`s are the one exception,
because those become entities *we* manage RSVP/convocations on top of; a poule standings row is never
going to be edited or annotated inside BasketEasy, so there's nothing a table would buy beyond a
cache). `Team` gains one derived field, not a column: `competitionRef`, read off the most recent FFBB
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
   * Standings and latest results for the poule a competitionRef belongs to.
   * competitionRef is the full path captured alongside a team's matches (see
   * FfbbEngagementFetchResult.competitionRef below) — not a bare code, same
   * "store the resolvable path" rule as parseEngagementRef.
   */
  getPouleStandings(competitionRef: string): Promise<FfbbPouleStandings>;
}
```

`FfbbEngagementFetchResult` gains `competitionRef: string | null` (null when the `<code>` segment
couldn't be extracted from any match's detail-page link — e.g. a team with no matches yet this
season). `FfbbPageScrapeProvider.getMatchesForEngagement` already builds
`MATCH_DETAIL_PATH_REGEX` matches internally; this only needs to keep the `ligues/.../competitions/<code>`
prefix it currently discards, not a new fetch.

### `FfbbPouleService` (new, `server/src/ffbb`)

`getPouleResults(clubId, teamId)`:

1. `assertTeamInClub` (existing pattern, every module in this codebase re-verifies the route's
   `:clubId` owns the target before touching it).
2. Load the team's `TeamFfbbLink`s; 404 if none. If more than one (a team in both a championship and a
   cup — see the calendar-import spec's "Multiple competitions per team"), use the most recently
   created link's `competitionRef` — a cup poule's standings aren't meaningful the way a league poule's
   are, and asking the coach to pick isn't worth building for a case CLAUDE.md's `TeamFfbbLink` docs
   already flag as the rarer one.
3. `FfbbProvider.getPouleStandings(competitionRef)`, wrapping any `FfbbPageFormatError` into a typed
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

- `FfbbPageScrapeProvider`: `competitionRef` extraction from a match detail link (already-covered
  regex, new assertion on what's kept); `getPouleStandings` fixture-driven once a real fetch confirms
  the target page's shape (blocked — see Open questions).
- `FfbbPouleService`: no-link team 404s; multiple-links team picks the most recent; provider error
  wraps to the typed failure response, not a raw throw.
- Frontend: `PouleResultsPanel` error/loading/empty/data branches; `isOurTeam`/`involvesOurTeam`
  visual distinction present; refresh button triggers a refetch and toasts only on failure.

## Open questions (resolve before implementation start)

1. **Does a standings/results page exist at a scrapeable URL, and what shape is its RSC payload?**
   Unresolved — this sandbox has no egress to `competitions.ffbb.com` (confirmed via a failed
   `WebFetch`, `EGRESS_BLOCKED`, against the same example URL the calendar-import spec used
   successfully from a sandbox that did have egress). Needs a session with working egress to fetch a
   real `.../competitions/<code>/classement`-shaped URL (exact path TBD — "classement" is a guess based
   on FFBB's own site language, not confirmed) and inspect the embedded RSC JSON, the same way the
   calendar-import spec's research section did for the team page. **This blocks writing
   `FfbbPageScrapeProvider`'s poule-standings extraction logic** — everything else in this spec (the
   service layer, API surface, frontend) can be built and tested against a mocked `FfbbProvider` in the
   meantime, with the real adapter landing once the page shape is confirmed.
2. **Whether `<code>` (e.g. `dm3`) is really the poule identifier or something coarser** (e.g. a whole
   division, of which our poule is one group among several). If it's coarser, `getPouleStandings` would
   return every poule in the division mixed together — needs a poule-scoping field in the fetched data
   to filter on, not yet confirmed present or absent.
3. **Whether FFBB's site exposes a "most recent completed matchday" grouping directly**, or whether
   this needs to be derived client-side from a flat results list by finding the highest `numeroJournee`
   with all matches `joue: true`. Affects `FfbbPouleResult.matchdayLabel`'s reliability.
4. **Rate limiting / robots.txt for a standings page specifically** — not checked, same caveat the
   calendar-import spec noted for the team page ("no documented rate limits... more brittle than even
   the REST API would have been").

Given open question 1 blocks the one piece of code that actually talks to FFBB, the recommended
implementation order is: land the service/API/frontend layers now against a mocked `FfbbProvider` (so
the feature is demoable and reviewable), and treat the real `FfbbPageScrapeProvider.getPouleStandings`
implementation as a follow-up loop once a session with live egress confirms the page shape — same
two-step pattern the venue-resolution spec
([`2026-09-01-ffbb-match-venue-address-design.md`](./2026-09-01-ffbb-match-venue-address-design.md))
used successfully.
