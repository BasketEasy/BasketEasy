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

## 2. Structure

```
app/src/admin/
  AdminShell.tsx, AdminRoute.tsx, AdminLoginForm.tsx, platformSession.ts, queryKeys.ts
  shared/   AdminPersonLink, AdminRecordLink, AdminFilterBar, useAdminListParams, AdminDetailHeader
  clubs/    AdminClubsPage, AdminClubDetailPage (tabs), useAdminClubs
  teams/    AdminTeamsPage, AdminTeamDetailPage, useAdminTeams
  users/    AdminUsersPage, AdminUserDetailPage, AdminEraseDialog, AdminUserExportDialog, useAdminUsers
  players/  AdminPlayersPage, AdminPlayerDetailPage, useAdminPlayers
  events/   AdminEventsPage, AdminEventDetailPage, useAdminEvents
  scoresheets/ AdminScoresheetsPage
  retention/   AdminRetentionPage
  audit/       AdminAuditLogPage
```

Moving files keeps their tests next to them. `useAdminQueries.ts` is split per area and deleted.

## 3. Shared pieces

- `useAdminListParams<T>(defaults)`: reads and writes filters + `page` in the URL search params
  (`replace: true` on filter changes, a history entry on page changes), resets `page` to 1 when a
  filter changes. Every list uses it, so any view can be pasted into a ticket.
- `AdminFilterBar`: a row of `SelectField`s / a search `Input` / boolean `Checkbox`es, wrapping on
  mobile; driven by react-hook-form (`watch` → params, debounced 300 ms for text).
- `AdminPersonLink`: renders `displayName` as a `TextLink` to `/admin/users/:id` or
  `/admin/players/:id`; when `redacted`, a `Badge variant="soft" tone="muted"` « masqué ».
  E-mail on a second `Text variant="meta"` line when present.
- `AdminRecordLink`: club / team / event refs to their detail pages.
- Dates via one `formatAdminDate` / `formatAdminDateTime` (Europe/Paris, `.tabular`).

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

`/admin` redirects to `/admin/clubs` until Part 4 adds the dashboard.

Person detail queries keep the v1 settings (`staleTime: Infinity`, no focus/reconnect refetch,
no retry), since each fetch can be an audit row. Every query consumer branches
`error → loading → empty → data`.

## 5. Tests and screenshots

- Vitest + RTL per page: the four branches, filters written to the URL, redacted rendering,
  links resolving to the right routes, tabs.
- `scripts/fixtures/admin-browse.json` (a `DATA_OFFICER` session, one CTC team across two clubs, a
  minor with a guardian, a failed scoresheet) plus an `admin-browse-support.json` variant with
  redacted refs. Screenshots of every page at desktop and phone width in the PR.
