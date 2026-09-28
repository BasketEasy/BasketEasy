# Back-office v2: Part 1, read API

Status: spec (implements Part 1 of [`2026-09-28-backoffice-browse-stats-actions-design.md`](./2026-09-28-backoffice-browse-stats-actions-design.md))
Date: 2026-09-28

The server side of browsing: shared types, the per-role redaction helper, and the list and detail
endpoints over clubs, teams, users, players, events and scoresheets. No schema change. The
frontend is only adapted enough to keep compiling against the new user types; the real browse
screens are Part 2.

`pr-scope.yml` flags this PR (`server/src/auth`): the description names the guard change
(`PlatformAdminGuard` now attaches the caller's role to the request) and the two authorization
changes (`GET /admin/users/:userId` opens to `SUPPORT`, redacted, and `GET /admin/users` stops
being inactivity-only).

## 1. Types

New file `packages/@basketeasy/types/platform-admin-browse.ts`, exported as
`@basketeasy/types/platform-admin-browse`.

```ts
export interface AdminPersonRef {
  kind: 'user' | 'player';
  id: string;
  displayName: string; // "Jean Dupont" | "J. D." | "—"
  email: string | null; // DATA_OFFICER only
  emailDomain: string | null;
  redacted: boolean;
}

export interface AdminClubRef {
  id: string;
  name: string;
}
export interface AdminTeamRef {
  id: string;
  name: string;
  category: TeamCategory;
  gender: Gender;
}

// Lists
export interface AdminClubSummary extends AdminClubRef {
  ffbbClubCode: string | null;
  createdAt: string;
  memberCount: number;
  adminCount: number;
  teamCount: number;
  playerCount: number;
}
export interface AdminTeamSummary extends AdminTeamRef {
  createdAt: string;
  ownerClub: AdminClubRef | null; // null only for a data inconsistency, rendered as such
  partnerClubs: AdminClubRef[];
  rosterCount: number;
  teamAdminCount: number;
}
export interface AdminUserSummary {
  person: AdminPersonRef;
  emailVerified: boolean;
  createdAt: string;
  lastActiveAt: string;
  daysUntilErasure: number;
  clubCount: number;
  guardianOfCount: number;
  platformRole: PlatformRole | null;
}
export interface AdminPlayerSummary {
  person: AdminPersonRef;
  club: AdminClubRef;
  linkedUserId: string | null;
  isMinor: boolean | null; // null when no birth date is known
  consentState: 'not-required' | 'recorded' | 'missing' | 'unknown';
  teamCount: number;
  createdAt: string;
}
export interface AdminEventSummary {
  id: string;
  team: AdminTeamRef;
  type: 'TRAINING' | 'MATCH';
  startsAt: string;
  location: string;
  opponentName: string | null;
  rsvpCounts: { going: number; notGoing: number; maybe: number };
  convocationCount: number;
  scoresheetStatus: EventScoresheetStatus | null;
}
export interface AdminScoresheetSummary {
  id: string;
  event: { id: string; startsAt: string; opponentName: string | null };
  team: AdminTeamRef;
  status: EventScoresheetStatus;
  attemptCount: number | null; // null before the first extraction row exists
  failureReason: string | null;
  uploadedAt: string;
}

// Details
export interface AdminClubDetail extends AdminClubSummary {
  meetingPointName: string | null;
  meetingPointAddress: string | null;
  arrivalBufferMinutes: number;
}
export interface AdminClubMember {
  person: AdminPersonRef;
  role: ClubRole;
  joinedAt: string;
}
export interface AdminTeamDetail extends AdminTeamSummary {
  teamAdmins: { person: AdminPersonRef; grantedAt: string }[];
  ffbbLinks: { id: string; url: string }[];
}
export interface AdminRosterEntry {
  teamPlayerId: string;
  player: AdminPersonRef;
  club: AdminClubRef;
  role: 'COACH' | 'PLAYER';
  linkedUser: AdminPersonRef | null;
  joinedAt: string;
}
export interface AdminUserDetail extends AdminUserSummary {
  memberships: { club: AdminClubRef; role: ClubRole; joinedAt: string }[];
  teamAdminOf: { team: AdminTeamRef; grantedAt: string }[];
  linkedPlayers: { player: AdminPersonRef; club: AdminClubRef; teams: AdminTeamRef[] }[];
  guardianOf: { player: AdminPersonRef; club: AdminClubRef; linkedAt: string }[];
  activeSessionCount: number;
}
export interface AdminPlayerDetail extends AdminPlayerSummary {
  birthDate: string | null; // DATA_OFFICER only
  licenseNumber: string | null; // DATA_OFFICER only
  gender: Gender | null;
  linkedUser: AdminPersonRef | null;
  teams: { teamPlayerId: string; team: AdminTeamRef; role: 'COACH' | 'PLAYER' }[];
  guardians: { person: AdminPersonRef; linkedAt: string }[];
  guardianInvites: {
    id: string;
    createdAt: string;
    expiresAt: string;
    state: 'live' | 'expired' | 'accepted';
  }[];
  playerInvite: {
    createdAt: string;
    expiresAt: string;
    state: 'live' | 'expired' | 'accepted';
  } | null;
  consents: {
    id: string;
    source: ParentalConsentSource;
    attestedBy: string;
    consentGivenAt: string;
  }[];
}
export interface AdminEventDetail extends AdminEventSummary {
  venue: 'HOME' | 'AWAY' | null;
  notes: string | null;
  recurrenceId: string | null;
  roster: {
    teamPlayerId: string;
    player: AdminPersonRef;
    role: 'COACH' | 'PLAYER';
    rsvp: 'GOING' | 'NOT_GOING' | 'MAYBE' | null;
    respondedBy: AdminPersonRef | null;
    convoked: boolean;
  }[];
  scoresheet: AdminScoresheetSummary | null;
}
```

One `…Query` interface per list (the DTOs implement them), all with `page?`/`pageSize?`:

| Query                   | Fields                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AdminClubsQuery`       | `q?`, `hasAdmin?: boolean`, `sort?: 'name' \| 'createdAt'`, `order?`                                                                                       |
| `AdminTeamsQuery`       | `q?`, `clubId?`, `category?`, `gender?`, `hasAdmin?`                                                                                                       |
| `AdminUsersQuery`       | `q?`, `clubId?`, `teamId?`, `clubRole?`, `verified?`, `inactiveSoon?`, `isGuardian?`, `hasPlatformRole?`, `sort?: 'createdAt' \| 'lastActiveAt'`, `order?` |
| `AdminPlayersQuery`     | `q?`, `clubId?`, `teamId?`, `claimed?`, `minor?`, `missingConsent?`                                                                                        |
| `AdminEventsQuery`      | `clubId?`, `teamId?`, `type?`, `from?`, `to?`, `scoresheetStatus?`                                                                                         |
| `AdminScoresheetsQuery` | `status?: EventScoresheetStatus[]`, `clubId?`, `from?`, `to?`                                                                                              |
| `AdminClubMembersQuery` | `role?`                                                                                                                                                    |

Booleans travel as `'true' | 'false'` strings and are parsed in the DTO (`@Transform`).

`platform-admin.ts` loses `RedactedUserSummary`, `PlatformUserListStatus`,
`ListPlatformUsersParams` and `PlatformUserDetail` (replaced; dead-code rule) and gains
`playerId?` on `ListAuditLogParams`.

## 2. Role on the request

`PlatformAdminGuard.canActivate` already loads the grant. It now sets
`request.platformRole = admin.role` before returning. A `@CurrentPlatformRole()` param decorator
(`server/src/auth/decorators/current-platform-role.decorator.ts`) reads it and throws if absent
(a handler using it without the guard is a programming error, not a 403).

## 3. Redaction

`server/src/platform-admin/redaction.ts`:

- `userRef(role, { id, email, firstName, lastName })` and `playerRef(role, { id, firstName, lastName, user?: { email } | null })` return an `AdminPersonRef`.
- `initialsOf(firstName, lastName)`: `"J. D."`, `"J."` when only one part is known, `"—"` when neither.
  Diacritics are kept (`"É. L."`), hyphenated first names give one initial (`"J.-P."` is not worth the edge cases).
- A user with no name set shows, for `DATA_OFFICER`, the e-mail as `displayName`; for `SUPPORT`, `"—"`.
- `emailDomainOf` moves here from `platform-admin.service.ts` (it has one other caller: the v1 list, folded in).

A spec runs every builder under `SUPPORT` on a fixture and asserts the serialised output contains
none of the fixture's first name, last name or e-mail local part.

## 4. Endpoints

All under `JwtAuthGuard, PlatformAdminGuard`, no `@PlatformRoles` (both roles), in one
`PlatformAdminBrowseController` backed by one `platform-admin-browse.service.ts`. Every list: one `count` +
one `findMany` with `select` + `_count`, never per-row queries. Detail endpoints: one
`findUnique` with nested `select`, plus at most one extra query where Prisma can't express it.

| Route                              | Notes                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /admin/clubs`                 | `q`: `name` `contains` insensitive OR `ffbbClubCode` equals (upper-cased). `hasAdmin`: `memberships some/none role ADMIN`. `adminCount` needs a second `groupBy` over the page's club ids. |
| `GET /admin/clubs/:clubId`         | 404 `Club introuvable`.                                                                                                                                                                    |
| `GET /admin/clubs/:clubId/members` | paginated, ordered by role then lastName.                                                                                                                                                  |
| `GET /admin/teams`                 | `clubId`: `clubTeams some clubId`. `hasAdmin=false`: no `TeamAdmin` rows (club ADMINs are not counted: the question is "does anyone manage this team specifically").                       |
| `GET /admin/teams/:teamId`         |                                                                                                                                                                                            |
| `GET /admin/teams/:teamId/roster`  | not paginated (a roster is bounded), ordered COACH first then lastName.                                                                                                                    |
| `GET /admin/users`                 | see §5.                                                                                                                                                                                    |
| `GET /admin/users/:userId`         | both roles; `ADMIN_PII_VIEWED` awaited before returning, `DATA_OFFICER` only.                                                                                                              |
| `GET /admin/players`               | `q` per role (§5). `minor`/`missingConsent` computed from `birthDate` against today (`isMinorBirthDate`'s cutoff turned into a date bound so it runs in SQL).                              |
| `GET /admin/players/:playerId`     | same audit rule; metadata `{ subjectPlayerId, subjectUserId? }`.                                                                                                                           |
| `GET /admin/events`                | default window: none (ordered `startsAt desc`). RSVP counts: one `groupBy` over the page's event ids.                                                                                      |
| `GET /admin/events/:eventId`       |                                                                                                                                                                                            |
| `GET /admin/scoresheets`           | `status` accepts a comma list; default all; ordered `uploadedAt desc`.                                                                                                                     |

The v1 `GET /admin/users?status=inactive-soon` is replaced by `inactiveSoon=true`; the v1
`getUserDetail` and `listInactiveSoonUsers` are removed from `PlatformAdminService`.

`GET /admin/audit-log` gains `playerId`, matched on `metadata.subjectPlayerId`. When both are
given the filters AND together.

## 5. Person search rule (`q`)

`peopleSearchWhere(role, q)` in the browse service, used by users and players:

- trimmed; under 2 characters is ignored.
- `DATA_OFFICER`: `OR` of `firstName`, `lastName`, `email` (users only) `contains` insensitive, plus
  "first last" split on the first space matching both.
- `SUPPORT`: users, `email` `equals` (insensitive) only; players, `user.email` `equals`. A name
  query from `SUPPORT` matches nothing and the list returns empty rather than a 403, so the UI
  doesn't need a role branch to render it.

## 6. Frontend (compile-only)

- `useAdminQueries.ts`: `usePlatformUsers` takes `AdminUsersQuery` and returns
  `PaginatedResult<AdminUserSummary>`; `usePlatformUser` returns `AdminUserDetail`.
- `AdminUsersPage` passes `{ inactiveSoon: true }` and reads `user.person.emailDomain` (still no
  name shown there: Part 2 rewrites the page).
- `AdminUserDetailPage` renders from `AdminUserDetail`; for `SUPPORT` the export and erase sections
  stay hidden (they are `DATA_OFFICER` routes), and the route is no longer DATA_OFFICER-gated on the
  client.
- Tests updated to the new shapes.

## 7. Tests

- `redaction.spec.ts` (§3).
- `platform-admin-browse.service.spec.ts`: each list's `where` for each filter, pagination maths,
  the SUPPORT/DATA_OFFICER `q` rule, audit row written for DATA_OFFICER detail only and awaited
  before return, 404s.
- Guard spec: `platformRole` attached.
- Controller e2e-style spec (existing Nest testing module pattern): a SUPPORT caller gets
  redacted refs from `/admin/users/:id`.

## 8. Docs

CLAUDE.md, Platform back-office: replace "List views carry no PII" with the per-role rule and
list the browse routes in one line.
