# Team member roles (coach/player) + team-scoped admins

Status: draft (loop 0)
Date: 2026-08-10

## Why

Two gaps in the Teams module (`server/src/teams`, see `CLAUDE.md`'s Teams module section):

1. `TeamPlayer` roster rows have no notion of role — every rostered player reads as a
   player, even though a team's roster is really coaches and players.
2. Only a **club** `ADMIN` (of a club linked to the team) can manage a team's roster/events.
   There's no way to hand day-to-day running of one specific team to someone (a coach, a
   team manager) without making them a club-wide admin.

Both are P1/P2-adjacent ("volunteer role management" is P2 per `docs/feature-set.md`, but
this is scoped narrower: a per-team role label and a per-team admin flag, not the full
volunteer-role system with présidents/trésoriers/etc. described there — that's still
deferred).

## Scope

**In scope:**

- `TeamPlayer.role: COACH | PLAYER`, settable when rostering a player and editable after.
- `TeamAdmin`: a `User` ↔ `Team` grant, independent of club membership, giving that user
  admin rights over that one team's day-to-day management (roster, events, team info).
- The first `TeamAdmin` for a team can only be created by a club `ADMIN` of one of the
  team's linked clubs (there's no other authority to bootstrap from). Once at least one
  `TeamAdmin` exists, any existing `TeamAdmin` for that team can add/remove further ones —
  club `ADMIN`s always retain the same power too, they don't lose it by delegating.

**Out of scope (explicitly deferred, don't build speculatively):**

- CTC ownership actions — deleting a team, linking/unlinking partner clubs
  (`ClubTeam.isOwner`) — stay owner-club-`ADMIN`-only. A `TeamAdmin` is scoped to running
  the team day-to-day, not governing which clubs it belongs to; conflating the two would
  let a team-level grant reach into club-level CTC governance.
- The broader P2 volunteer/role system (président, trésorier, arbitrary role catalog).
- RSVP/convocations by role (e.g. "coaches see X, players see Y") — no such distinction
  exists yet in the Events module and isn't added here.
- A UI role picker with more than two values — `TeamMemberRole` is a fixed two-value enum,
  matching `ClubRole`'s precedent ("no coach/parent/président/trésorier yet" — this spec is
  what turns "coach" from deferred into built, but only the label, not a permissions system
  per role).

## Data model (Prisma)

```prisma
enum TeamMemberRole {
  COACH
  PLAYER
}

model TeamPlayer {
  id        String         @id @default(uuid())
  teamId    String
  playerId  String
  role      TeamMemberRole @default(PLAYER)
  createdAt DateTime       @default(now())
  team      Team           @relation(fields: [teamId], references: [id], onDelete: Cascade)
  player    Player         @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@unique([teamId, playerId])
  @@index([playerId])
}

model TeamAdmin {
  id        String   @id @default(uuid())
  teamId    String
  userId    String
  createdAt DateTime @default(now())
  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId])
  @@index([userId])
}
```

`Team.teamAdmins TeamAdmin[]` and `User.teamAdmins TeamAdmin[]` back-relations added.
Both `TeamPlayer` and `TeamAdmin` cascade-delete with their `Team` — same pattern already
used for `TeamPlayer`/`Event` (`CLAUDE.md`: "cascade-delete at the DB level ... so deleting
a player or disbanding a team never needs a manual cleanup transaction"). `TeamAdmin` also
cascades if the `User` is deleted (no user-deletion flow exists yet, but the FK needs an
`onDelete` policy regardless).

Default `role: PLAYER` on `TeamPlayer` means the existing `addTeamPlayer` call sites
(frontend not yet updated) keep working unchanged until the frontend adds a role picker.

## Authorization: `TeamManagerGuard`

A new guard, `server/src/auth/guards/team-manager.guard.ts`, alongside the existing
`ClubRolesGuard`. Grants access if the caller is **either**:

- a `ClubMembership` with `role: ADMIN` for the route's `:clubId`, **or**
- a `TeamAdmin` row for the route's `:teamId`.

Reads `request.params.clubId` and `request.params.teamId` — only usable on routes that
have both (every route under `clubs/:clubId/teams/:teamId/...`). Runs after `JwtAuthGuard`,
same ordering requirement as `ClubRolesGuard`.

It does **not** replace `ClubRolesGuard` everywhere — `ClubRolesGuard` still gates plain
club-membership reads (`GET .../teams`, `GET .../teams/:teamId`) and the owner-only CTC
routes keep `@ClubRoles('ADMIN')` unchanged (that check is "is ADMIN of _this specific_
club", which for CTC purposes must mean the owning club specifically — `TeamsService`'s
existing `assertTeamOwner` already re-verifies that server-side regardless of guard).

`TeamManagerGuard` replaces `@ClubRoles('ADMIN')` on:

- `PATCH clubs/:clubId/teams/:teamId` (team info edit)
- `POST/DELETE clubs/:clubId/teams/:teamId/players` (roster add/remove)
- `PATCH clubs/:clubId/teams/:teamId/players/:playerId` (role change — new route)
- `POST/DELETE clubs/:clubId/teams/:teamId/admins` (team-admin grant/revoke — new routes)
- `POST/PATCH/DELETE clubs/:clubId/teams/:teamId/events` (all of `EventsController`'s
  mutating routes)

Unaffected (stay `@ClubRoles('ADMIN')`, owner-club only via `assertTeamOwner`):

- `DELETE clubs/:clubId/teams/:teamId` (delete team)
- `POST/DELETE clubs/:clubId/teams/:teamId/clubs` (CTC partner-club add/remove)

## Team-admin bootstrap check

`addTeamAdmin(clubId, teamId, email)` looks the target user up by email (404 if none, same
pattern as `ClubsService.addMember`), then requires that user already hold a
`ClubMembership` (any role) in one of the team's linked clubs — reusing the same
"must belong to a linked club" rule `TeamsService.addTeamPlayer` applies to players, so a
team admin can't be a stranger to every club running the team. `400 BadRequestException` if
not linked, `409 ConflictException` if already a `TeamAdmin` for that team.

`removeTeamAdmin` has no "last admin" guard (unlike `ClubsService.removeMember`'s
last-`ADMIN` protection) — a team can safely have zero `TeamAdmin`s, since club `ADMIN`s
are always a valid fallback authority for the team; there is no equivalent fallback at the
club level, which is why that guard exists there and not here.

## API surface

New/changed routes, all under `server/src/teams` except the events guard swap:

| Method                            | Path                                            | Guard                          | Notes                                                 |
| --------------------------------- | ----------------------------------------------- | ------------------------------ | ----------------------------------------------------- |
| PATCH                             | `clubs/:clubId/teams/:teamId`                   | `TeamManagerGuard`             | was `@ClubRoles('ADMIN')`                             |
| POST                              | `clubs/:clubId/teams/:teamId/players`           | `TeamManagerGuard`             | was `@ClubRoles('ADMIN')`; body gains optional `role` |
| PATCH                             | `clubs/:clubId/teams/:teamId/players/:playerId` | `TeamManagerGuard`             | new — change a roster row's role                      |
| DELETE                            | `clubs/:clubId/teams/:teamId/players/:playerId` | `TeamManagerGuard`             | was `@ClubRoles('ADMIN')`                             |
| GET                               | `clubs/:clubId/teams/:teamId/admins`            | `@ClubRoles('ADMIN','MEMBER')` | new — list team admins                                |
| POST                              | `clubs/:clubId/teams/:teamId/admins`            | `TeamManagerGuard`             | new — grant, body `{email}`                           |
| DELETE                            | `clubs/:clubId/teams/:teamId/admins/:userId`    | `TeamManagerGuard`             | new — revoke                                          |
| POST/PATCH/DELETE `.../events...` | (existing paths)                                | `TeamManagerGuard`             | was `@ClubRoles('ADMIN')`                             |

**Why `listTeamAdmins` reads `ADMIN`+`MEMBER`, not `TeamManagerGuard` (considered and
rejected):** the closest read-route precedent in this controller is `listTeamPlayers`/
`listTeamClubs` (team-scoped, member-identifying data, `ADMIN`+`MEMBER`-visible), not
`ClubsController.listMembers` (a whole club's roster, `ADMIN`-only) — `listTeamAdmins`
exposes only the 1-2 admins of _this_ team, not a club-wide member dump, so the narrower
precedent applies. Restricting it to `TeamManagerGuard` was considered (it would tighten
PII exposure) but rejected: a genuine `TeamAdmin` who isn't also a club `ADMIN` has no
_local_ signal (nothing in their JWT or `useAccount()` membership list) to know they're
allowed to fetch it, unlike `useIsClubAdmin`, which reads purely local state. The frontend
would have to fire the request speculatively and treat a 403 as "not a manager" — workable,
but adds retry-storm risk and a slightly odd interaction for the exact code path that's
supposed to let a `TeamAdmin` see their own peers. Given the low sensitivity of "who
administers this specific team" in a small amateur-club context, the simpler, precedent-
matching route stays.

## Shared types (`packages/@basketeasy/types`)

- `teams.ts`: add `TeamMemberRole = 'COACH' | 'PLAYER'`; `TeamPlayer.role: TeamMemberRole`;
  `AddTeamPlayerRequest.role?: TeamMemberRole`; new `UpdateTeamPlayerRequest { role:
TeamMemberRole }`.
- new `team-admins.ts`: `TeamAdmin { userId, email, teamId, createdAt }`;
  `AddTeamAdminRequest { email: string }`.

## Frontend

`app/src/clubs/` gets the same one-hook-per-file treatment as the rest of the module:

- `teamLabels.ts` gains a `teamMemberRoleLabels` map (`COACH` → "Entraîneur", `PLAYER` →
  "Joueur" — French-first per `CLAUDE.md`'s locale convention).
- `TeamPlayerAddForm.tsx` gains a role select (defaults to `PLAYER`); `TeamPlayerRow.tsx`
  shows the role as a badge/label next to the player name.
- New `useTeamPlayerRoleUpdate.ts` hook (PATCH), wired to a small inline control on
  `TeamPlayerRow.tsx` — reusing the pattern of `useTeamClubRemove.ts`-style single-purpose
  mutation hooks already in the directory.
- New `useTeamAdminList.ts`, `useTeamAdminAdd.ts`, `useTeamAdminRemove.ts` hooks, a
  `TeamAdminAddForm.tsx` (email input, mirrors `ClubMemberAddForm.tsx`), and a
  `TeamAdminRow.tsx`. Wired into `TeamDetailPage.tsx` as a new section, visible to anyone
  who can see the team (read) but only actionable by `TeamManagerGuard`-eligible callers —
  same UI pattern already used to gate the CTC "add partner club" form on `isOwner`.

## Testing

Same split as the rest of the codebase: Jest `*.spec.ts` for `TeamsService`/
`TeamsController`/`TeamManagerGuard`/`EventsController` guard wiring; Vitest/RTL
`*.test.ts(x)` for the new/changed hooks and forms. No new E2E harness — none exists yet
for Teams either.
