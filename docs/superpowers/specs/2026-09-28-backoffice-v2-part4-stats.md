# Back-office v2: Part 4, stats

Status: spec (implements Part 4 of [`2026-09-28-backoffice-browse-stats-actions-design.md`](./2026-09-28-backoffice-browse-stats-actions-design.md))
Date: 2026-09-28
Depends on: [Part 3](./2026-09-28-backoffice-v2-part3-search.md)

The metric list is in the design record; this part fixes how it's computed and shown.

## 1. Design gate

Canvas: https://claude.ai/artifact/FNS2XSTyweXA5h3zix6JKh (validated 2026-09-28).

As built: every chart is single-series blue-green with the current week in orange. The brand
teal fails the dataviz validator's chroma floor as a categorical colour, so matches and trainings
are two small charts rather than one two-colour chart. Tiles are `{ total, added }` counts (the
« +N sur la période » line) rather than a previous-window delta. The weekly SQL was run against a
real Postgres 16 with seeded data (CTC team counted in both clubs, a parent's answer, a stale
route) while it was written.

Canvas first, following the `dataviz` guidance on Parquet tokens (blue-green for series, orange
only for the highlighted value, warm neutrals for grid): the global dashboard with the range
picker (segmented control), three sections under `SectionHeading`s (Croissance, Engagement,
Santé), stat tiles with a delta and an optional link, weekly line/bar series, categorical bars;
the same block inside the club page's « Statistiques » tab; loading and empty states.

## 2. API

`GET /admin/stats?range=7d|30d|90d|season|all&clubId=` (both roles; aggregates only, no person
refs). Types in `@basketeasy/types/platform-admin-stats`:

```ts
export type AdminStatsRange = '7d' | '30d' | '90d' | 'season' | 'all';
export interface AdminStatPoint {
  weekStart: string;
  value: number;
}
export interface AdminStatTile {
  value: number | null;
  previous: number | null;
} // previous = same-length window before, null for 'all'
export interface AdminStats {
  range: AdminStatsRange;
  from: string;
  to: string;
  clubId: string | null;
  growth: {
    users: AdminStatTile;
    clubs: AdminStatTile;
    teams: AdminStatTile;
    players: AdminStatTile;
    claimedPlayerShare: number | null;
    active7d: number;
    active30d: number;
    active90d: number;
    guardianOnlyAccounts: number;
    ctcTeams: number;
    newUsers: AdminStatPoint[];
    newClubs: AdminStatPoint[];
    newTeams: AdminStatPoint[];
    newPlayers: AdminStatPoint[];
    teamsByCategory: { category: TeamCategory; gender: Gender; count: number }[];
  };
  engagement: {
    eventsByWeek: { weekStart: string; training: number; match: number }[];
    recurringShare: number | null;
    rsvpResponseRate: number | null;
    rsvpResponseRateByWeek: AdminStatPoint[];
    rsvpSplit: { going: number; notGoing: number; maybe: number };
    guardianAnswers: number;
    convocationsByWeek: AdminStatPoint[];
    matchesWithMeetingPoint: number;
    travelSplit: { meetingPoint: number; direct: number };
    votesCast: number;
    scoresheetCoverage: number | null;
    guardianLinksByWeek: AdminStatPoint[];
    emailOptOutShare: number | null;
    pushEnabledUsers: number;
    ffbbLinkedClubs: number;
    ffbbLinkedTeams: number;
  };
  health: {
    scoresheetsByStatus: Record<EventScoresheetStatus, number>;
    ocrFailureRate: number | null;
    avgOcrAttempts: number | null;
    needsReview: number;
    stuckScoresheets: number;
    unverifiedUsers: number;
    unverifiedOlderThan7d: number;
    pendingPlayerInvites: { live: number; expired: number };
    pendingGuardianInvites: { live: number; expired: number };
    minorsMissingConsent: number;
    accountsNearingErasure: number;
    clubsWithoutAdmin: number;
    teamsWithoutManager: number;
    lastRetentionRun: { ranAt: string; ok: boolean } | null;
    staleMeetingRoutes: number;
  };
}
```

A ratio is `null` when its denominator is 0 (renders « — », never « 0 % »). `previous` powers the
delta on count tiles.

## 3. Computation

`platform-admin-stats.service.ts`, three methods (`growth`, `engagement`, `health`) run in
`Promise.all`, each running its metrics in `Promise.all`:

- Window: `from`/`to` from the range; `season` via `seasonWindow(seasonYearFor(now))` from
  `server/src/team-stats/team-stats.service.ts`; `all` from the earliest `Club.createdAt`.
- Weekly series: one `$queryRaw` each, `date_trunc('week', "createdAt" AT TIME ZONE 'Europe/Paris')`,
  zero-filled in TypeScript so every series has the same weeks.
- Club scoping (`clubId`): users → `ClubMembership.clubId`; teams → `ClubTeam.clubId`; players →
  `Player.clubId`; events, RSVPs, convocations, votes, scoresheets → through the event's team's
  `ClubTeam`. The raw queries take the club id as a bound parameter, never interpolated.
- RSVP response rate: past events in range, `Σ rsvps / Σ current roster size` (hint says
  « sur l'effectif actuel »).
- `staleMeetingRoutes`: matches in the next 7 days whose stored `travelRouteKey` no longer matches
  the current route, reusing the key helper from `server/src/meeting-points/` (no recomputation).
- `lastRetentionRun` and `accountsNearingErasure` ignore `clubId` for the former; the latter is
  scoped to the club's members.

No cache in this part. A spec times the service against a seeded fixture only to assert the
query count (≤ 45 per call), not wall time.

## 4. Frontend

- `AdminStatsPanel({ clubId? })`: range picker (in the URL, `?range=`), the three sections.
  Charts: a small SVG line/bar component under `app/src/admin/stats/` built on the preset tokens
  (no chart library unless the canvas needs something SVG can't do cheaply; if one is added, it is
  lazy-loaded with the admin tree).
- Tiles marked « (link) » in the design record navigate to the Part 2 list with the matching
  filter (e.g. `minorsMissingConsent` → `/admin/players?minor=true&missingConsent=true`).
- `/admin` becomes the global dashboard; the club page gains the « Statistiques » tab.

## 5. Tests

Service spec per metric on a fixture that includes a CTC team linked to two clubs (counted in
both scoped results, once globally), an empty club (every ratio null), and a range boundary.
Component tests: range in the URL, each linked tile's URL, null ratio rendering.

## 6. As built

- Charts moved from hand-rolled SVG to Recharts (review on #207) behind the new
  `@basketeasy/ui/chart` wrapper (`ColumnChart`, `BarListChart`). Colours stay tokens
  (`currentColor` + tone class), the hidden table moved into the wrapper, and the dashboard's
  `WeeklyBars` / `BreakdownBars` keep their props.
