# Poule weekend results

Status: implemented (loop 2 — payload shape confirmed against a real captured page)
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

**Resolved — confirmed against a real captured page**, not a guess. A teammate opened
`https://competitions.ffbb.com/ligues/pdl/comites/0044/competitions/dm3?phase=200000002897998&poule=200000003056186&journee=1`
in a phone browser and saved the full page HTML (this sandbox still has no egress to
`competitions.ffbb.com`). Its embedded RSC payload was inspected directly (same
`self.__next_f.push(...)`-chunk-of-JSON architecture the calendar-import spec found on the team page),
and its exact field shapes were cross-checked against `Fimeo/ffbb-api-ts`
(a reverse-engineered FFBB API client on GitHub — reachable from this sandbox, unlike
`competitions.ffbb.com` itself — whose `Rencontre`/`Poule`/`Classement` interfaces matched the captured
payload's fields byte-for-byte). Findings, each closing one of the previous revision's open questions:

1. **URL shape, confirmed exactly:**
   `ligues/<ligueCode>/comites/<comiteCode>/competitions/<competitionCode>?phase=<phaseId>&poule=<pouleId>&journee=<n>`
   — `phase`/`poule`/`journee` are query parameters on the same competition page every match detail
   link's prefix already resolves to (`MATCH_DETAIL_PATH_REGEX`), not a separate `/classement` path.
2. **The query parameters don't scope what's returned — the whole phase comes back in one fetch.**
   The captured page's `journee` was `1` and its `poule` was one specific poule id, but the embedded
   payload contained **all five poules in the phase** (A through E), each with **all ten journées** of
   its full-season `rencontres`, not just journée 1. So `phase`/`poule`/`journee` are UI-selection state
   for which tab the page opens on, not a server-side filter — meaning **one fetch gets everything**:
   the whole poule's season of matches and its standings, no per-journée fetch loop needed. `poule` is
   still required to know _which_ of the five returned poules is ours, and `phase` to resolve the page
   at all, so both stay part of `pouleRef`; `journee` is dropped from the stored ref (see below) since
   it does nothing the fetch needs.
3. **Every `rencontre` object carries its own `idPoule` and `competitionId` (= phase id).** Confirmed
   both directly in the captured payload and in `ffbb-api-ts`'s `Rencontre` type
   (`idPoule: string` — the captured raw payload gives the richer `{id, nom}` shape; `Poule.id`/
   `Phase.id` line up with the same values). This means `pouleRef` needs **no second fetch to
   discover** — every match `FfbbPageScrapeProvider.getMatchesForEngagement` already pulls for a
   team's own calendar carries its poule id and phase id inline, sitting unread next to the
   already-extracted `numeroJournee`.
4. **The standings row shape (`Classement`), confirmed via `ffbb-api-ts`'s type, since every
   `classements` array in the captured page was empty** (that poule's season hadn't started — journée 1,
   every match still `joue: false`):
   ```typescript
   interface Classement {
     id: string;
     idEngagement?: { nom: string; id: string };
     matchJoues: string; // numeric fields are FFBB-API strings, same as resultatEquipe1/2 elsewhere
     points: string;
     position: string;
     gagnes: string;
     perdus: string;
   }
   ```
   No points-for/points-against or draws field exists (basketball has no draws) — confirms the design's
   original `{played, won, lost, points}` shape needed no points-differential column. **Residual risk,
   stated plainly:** this shape comes from a third-party client's reverse-engineering, not from a
   captured page with actual rows in it (none existed to capture — nobody's poule has played a match
   yet this early in the season). Treat `FfbbPageScrapeProvider`'s classement parsing as unverified
   against a populated example until one is captured; it fails closed (`FfbbPageFormatError`) rather
   than guessing if the fields it expects aren't there.

**`pouleRef` is stored as the full resolvable path+query, `journee` omitted** (point 2 above — the
provider always wants the whole poule, so there's nothing for a stored `journee` to pin):
`ligues/<x>/comites/<y>/competitions/<code>?phase=<id>&poule=<id>`.

## Data model (Prisma)

No new table. Poule data is fetched live and rendered, never persisted — same "don't store what we
don't own" posture as the rest of the FFBB integration (imported `Event`s are the one exception,
because those become entities _we_ manage RSVP/convocations on top of; a poule standings row is never
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

`FfbbEngagementFetchResult` gains `pouleRef: string | null` (null only when a team has zero matches
fetched — e.g. no fixtures published yet this season — so there's no `rencontre` object to read
`idPoule`/`competitionId` off at all). Built from the first fetched match: the `ligues/.../competitions/<code>`
prefix (already computed for `MATCH_DETAIL_PATH_REGEX`, previously discarded after venue resolution)
plus that match's own `idPoule.id` and `competitionId.id` (phase), composed into
`ligues/<x>/comites/<y>/competitions/<code>?phase=<phaseId>&poule=<pouleId>`.

`getPouleStandings(pouleRef)`'s implementation fetches the competition page at `pouleRef` once, parses
the RSC payload for the `phases[0].poules` array, finds the one entry whose `id` matches the `poule`
query param on `pouleRef`, and maps only that poule's `rencontres`/`classements` — the other four
poules in the same fetch are discarded, never surfaced past the adapter. Standings map
`Classement.idEngagement.id === ourEngagementId` (the trailing id of the `TeamFfbbLink.ffbbEngagementRef`
this `pouleRef` was derived from) to `isOurTeam`; sorted by `position` ascending. Latest results are
every `rencontre` with `joue: true` whose `numeroJournee` equals the highest `numeroJournee` among
`joue: true` matches in the poule (so a still-unplayed match sharing that journée number, e.g. a
postponement, is excluded from "results" — it has no score to show). An empty `classements`/no
`joue: true` matches yet (the common case early in a season, per point 4 above) is not an error: both
arrays come back empty and the frontend's empty-within-data copy handles it (see Frontend).

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

| Method | Route                                            | Guard          | Returns        |
| ------ | ------------------------------------------------ | -------------- | -------------- |
| GET    | `clubs/:clubId/teams/:teamId/ffbb-poule-results` | `JwtAuthGuard` | `PouleResults` |

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
  case above, not indistinguishable from empty. Within the `data` state, `standings`/`latestResults`
  each independently render their own small "pas encore de classement"/"aucun résultat pour le moment"
  line when empty (the common case before a poule's first journée is played, confirmed by the captured
  page — see "Where the poule reference comes from") rather than the whole panel falling back to the
  no-link empty state, which would misreport a real link as missing.
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

- `FfbbPageScrapeProvider`: `pouleRef` built correctly from a match's `idPoule`/`competitionId` plus the
  detail-link prefix; `getPouleStandings` against a captured-fixture-derived payload (the poule this
  spec's research used, with its 5-poule/10-journée shape, trimmed to fixture size) — selects only the
  matching poule id out of the five returned, maps `Classement` fields, computes `isOurTeam` off the
  engagement id, derives latest-journée results correctly when some matches in that journée are still
  `joue: false`, and returns empty arrays (not an error) for a not-yet-started poule; a payload missing
  the expected shape throws `FfbbPageFormatError` rather than guessing.
- `FfbbPouleService`: no-link team 404s; multiple-links team picks the most recent; provider error
  wraps to the typed failure response, not a raw throw.
- Frontend: `PouleResultsPanel` error/loading/empty/data branches; empty standings/results within the
  `data` state render their own small copy rather than falling back to the no-link empty state;
  `isOurTeam`/`involvesOurTeam` visual distinction present; refresh button triggers a refetch and
  toasts only on failure.

## Research findings (resolved — see "Where the poule reference comes from")

The previous revision's four open questions are now closed:

1. **URL shape** — confirmed exactly from a captured real page (above).
2. **Where `phase`/`poule` ids come from** — confirmed: every already-fetched `rencontre` object
   carries its own `idPoule`/`competitionId`, no second fetch needed.
3. **Whether `journee` is required / how "latest" is found** — resolved the other way: `journee`
   filters nothing (the whole poule's season comes back regardless), so "latest completed matchday" is
   derived client-side from the one fetch's full `rencontres` list, and `journee` is dropped from the
   stored `pouleRef` entirely.
4. **Rate limiting / robots.txt** — still genuinely unchecked; unchanged risk, noted here rather than
   re-stated as open, since nothing this loop's research could resolve it.

One thing is still unverified rather than resolved: the `Classement` row shape (point 4 in "Where the
poule reference comes from") comes from a third-party client's type declarations, not from a captured
page with actual standings rows in it — every poule sampled so far is pre-season. `FfbbPageScrapeProvider`
is written to fail loud (`FfbbPageFormatError`) rather than silently mis-map if a populated classement
turns out to use different field names once one is captured later in the season.
