# Back-office v2: Part 2, browse UI

Status: spec (implements Part 2 of [`2026-09-28-backoffice-browse-stats-actions-design.md`](./2026-09-28-backoffice-browse-stats-actions-design.md))
Date: 2026-09-28
Depends on: [Part 1](./2026-09-28-backoffice-v2-part1-read-api.md)

The list and detail screens over Part 1's endpoints, and the links that make the club graph
walkable. No server change beyond a filter Part 1 turns out to have missed.

## 1. Design gate

A Claude Design canvas in the Parquet system is produced and validated **before** any code in
this part. It covers:

- `AdminShell` with the new nav (desktop sidebar or top bar, and the phone layout).
- A list page: filter bar, `ResponsiveTable` in table and card layouts, pagination, empty /
  error / loading states.
- Club detail with its tabs, team detail, user detail, player detail, event detail, scoresheets list.
- An `AdminPersonRef` rendered in full (`DATA_OFFICER`) and redacted (`SUPPORT`, with its
  « masqué » badge).

The validated canvas is the reference for the rest of this part; its link goes in the PR.

## 2. Structure (as built)

Canvas: https://claude.ai/artifact/BWG7d8qBDX7xRjKK5Xs5k7 (validated 2026-09-28).

One page per file directly under `app/src/admin/` (`AdminClubsPage`, `AdminClubDetailPage`,
`AdminTeamsPage`, `AdminTeamDetailPage`, `AdminUsersPage`, `AdminUserDetailPage`,
`AdminPlayersPage`, `AdminPlayerDetailPage`, `AdminEventsPage`, `AdminEventDetailPage`,
`AdminScoresheetsPage`, `AdminAuditLogPage`, `AdminRetentionPage`), with the shared pieces in
`app/src/admin/shared/`. All reads live in `useAdminQueries.ts`, keys in `queryKeys.ts` (one
prefix per area so a later mutation can invalidate a whole area). A folder per area was planned;
thirteen files didn't earn the extra nesting.

The lists that a record page embeds (`AdminTeamsList`, `AdminPlayersList`, `AdminEventsList`)
are exported next to their page and take the fixed scope (`clubId`, `teamId`) plus a URL
`prefix`, so a club page's tabs keep separate filters in one URL (`t.q`, `p.minor`, `e.page`).

## 3. Shared pieces

- `useAdminListParams(keys, prefix)`: filters + `page` in the URL (`replace` on filter changes,
  a history entry on page changes, page reset on filter change). Filters are controlled by the
  URL directly rather than a react-hook-form form: nothing is submitted or validated, and a
  second copy of the state would have to be kept in sync with Back/Forward.
- `AdminFilters.tsx`: `AdminFilterBar`, `AdminSearchFilter` (debounced 300 ms, re-seeded when
  the URL changes under it), `AdminSelectFilter` (an « all » sentinel never sent to the API),
  `AdminPresets` (`SegmentedControl`).
- `AdminLinks.tsx`: `AdminLink`, `AdminClubLink`, `AdminTeamLink`, `AdminPersonLink` (« masqué »
  badge when redacted, optional contact line); `adminPaths.ts` is the only place a route is spelled.
- `AdminLayout.tsx`: `AdminPageHeader` (breadcrumb), `AdminSection`, `AdminFacts`, `AdminTable`
  (`ResponsiveTable` in a flush card on desktop, unwrapped card stack on a phone),
  `AdminLinkedList` (a record's linked records, one row each), `AdminStat(s)`, `AdminPagination`,
  `AdminTwoColumn`.
- `AdminQueryBranch`: the `error → loading → empty → data` ladder, once.
- `adminFormat.ts`: dates in Europe/Paris, labels and badge tones.

## 4. Pages

| Route                | Content                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/clubs`       | name, FFBB code, members, admins (danger badge at 0), teams, players, created                                                                                                                                                         |
| `/admin/clubs/:id`   | header (name, code, created, counts) + `?tab=` Membres / Équipes / Joueurs / Événements. Équipes and Joueurs reuse the teams / players list components with `clubId` fixed. The Statistiques tab arrives in Part 4, Actions in Part 5 |
| `/admin/teams`       | name, category/gender, owner club, partners, roster, managers                                                                                                                                                                         |
| `/admin/teams/:id`   | clubs (owner badge), managers, roster table (player, club, role, linked account), recent and upcoming events list, FFBB links                                                                                                         |
| `/admin/users`       | person, verified, last active, erasure countdown, clubs, guardian-of, platform role. Filter presets: « Bientôt effacés » (`inactiveSoon`), « Non vérifiés »                                                                           |
| `/admin/users/:id`   | profile, memberships → clubs, TeamAdmin → teams, linked players → player + teams, guardian-of → players, active sessions, audit-log link (`?userId=`), then export and erase (`DATA_OFFICER` only)                                    |
| `/admin/players`     | person, club, account (linked or not), minor, consent state, teams                                                                                                                                                                    |
| `/admin/players/:id` | club, linked account, teams, guardians, guardian invites, player invite, consent history, audit-log link (`?playerId=`)                                                                                                               |
| `/admin/events`      | date, team, type, opponent, RSVP counts, convocations, scoresheet status                                                                                                                                                              |
| `/admin/events/:id`  | event facts, roster with RSVP / responder / convocation, scoresheet summary                                                                                                                                                           |
| `/admin/scoresheets` | default filter `FAILED,NEEDS_REVIEW` + stuck; team, match, status, attempts, failure reason                                                                                                                                           |
| `/admin/retention`   | the existing page, moved                                                                                                                                                                                                              |
| `/admin/audit-log`   | the existing audit table (moved out of the user page into its own route) with `userId` / `playerId` filters; the user page links to it                                                                                                |

`/admin` redirects to `/admin/clubs` until Part 4 adds the dashboard, and the nav has no
« Tableau de bord » entry until then. The audit log entry is shown to a `DATA_OFFICER` only.

Person detail queries keep the v1 settings (`staleTime: Infinity`, no focus/reconnect refetch,
no retry), since each fetch can be an audit row. Every query consumer branches
`error → loading → empty → data`.

## 5. Tests and screenshots

- Vitest + RTL per page: the four branches, filters written to the URL, redacted rendering,
  links resolving to the right routes, tabs.
- `scripts/fixtures/admin-browse.json`: a `DATA_OFFICER` session, a CTC team across two clubs, a
  minor with a guardian, a failed scoresheet. The redacted rendering is covered by component
  tests rather than a second fixture.
