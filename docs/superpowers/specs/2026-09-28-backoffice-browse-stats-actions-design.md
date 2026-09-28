# Back-office v2: browse, search, stats, support actions

Status: draft
Date: 2026-09-28
Extends: [`2026-09-06-backoffice-design.md`](./2026-09-06-backoffice-design.md)
Implementation plan: [`2026-09-28-backoffice-browse-stats-actions-plan.md`](./2026-09-28-backoffice-browse-stats-actions-plan.md)

## Why

The v1 back-office was scoped to retention and erasure oversight: the sweep's run history, a
redacted list of accounts nearing the inactivity cutoff, one audited user detail page, export and
erase. It answers "is the sweep running" and "erase this person". It can't answer the questions
support actually gets:

- "I'm the president of club X, I can't see my U13 team" — what does X own, who is its admin?
- "My son doesn't get convocations" — which player is he, is he rostered, is a guardian linked?
- "The scoresheet has been stuck for two days" — what status, what failure reason?
- "How many clubs are active this season?" — nothing measures that today.

Every one of those is a `psql` session today, which is exactly what the v1 spec set out to avoid.

v1 deliberately listed "a general admin CRUD panel over every table" as out of scope. This spec
lifts that cut on purpose, but not all the way: it adds **browsing** over the club graph, a
**stats** dashboard, a closed list of **support actions**, and **club creation**. It is still not
a generic table editor: every write is a named action with its own endpoint, reason and audit
row. Nothing edits arbitrary columns.

## Decisions taken with the product owner

| Topic             | Decision                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Browsable records | Clubs + memberships, teams + roster + TeamAdmins, players + guardians + consent, events + RSVP/convocations + scoresheets, users              |
| Navigation        | Every id shown is a link to its detail page; the graph is walkable in both directions                                                         |
| PII by role       | `SUPPORT` sees initials + ids only; `DATA_OFFICER` sees names and e-mails                                                                     |
| Audit of reads    | Only opening a **person** detail page (user, player) writes `ADMIN_PII_VIEWED`; list views are not audited                                    |
| Finding things    | Global search box + per-list filters + stats home                                                                                             |
| Stats             | Growth, engagement, health/ops (no security stats); global dashboard **and** the same tiles scoped per club; selectable range, weekly buckets |
| Support actions   | Account fixes, memberships/roles, scoresheet ops, guardians/consent; **both roles**, each with a mandatory reason and an audit row            |
| Create            | Club + first admin only; the first admin must be an **existing** account                                                                      |
| Impersonation     | Not built; specified below as the next step                                                                                                   |
| Delivery          | Phased, one stacked PR per phase; every UI phase starts with a Claude Design canvas in the Parquet system                                     |

## What does not change

- The step-up model: `JwtAuthGuard` + `PlatformAdminGuard` + the 15-minute `X-Platform-Token`,
  `PLATFORM_JWT_SECRET` / `PLATFORM_TOTP_ENCRYPTION_KEY` opt-in, out-of-band grants, lockout.
  Every new route sits behind the same two guards.
- Export and erasure stay `DATA_OFFICER`-only with their current semantics.
- `AdminShell` still wears no product chrome and stays `React.lazy`-loaded.
- The retention page keeps its content; it moves under a "Rétention" nav entry.

## Redaction model

Redaction happens **on the server, once**, in a single helper. The client never receives data it
then hides, because a hidden field is still in the network tab.

```ts
// @basketeasy/types/platform-admin-browse
export interface AdminPersonRef {
  kind: 'user' | 'player';
  id: string;
  /** DATA_OFFICER: "Jean Dupont". SUPPORT: "J. D." (or "—" when no name is known). */
  displayName: string;
  /** DATA_OFFICER only; null for SUPPORT and for a player with no account. */
  email: string | null;
  /** Both roles: the domain alone ("gmail.com") carries no identity. */
  emailDomain: string | null;
  redacted: boolean;
}
```

`toPersonRef(role, row)` in `server/src/platform-admin/redaction.ts` is the only place that
builds one. Every browse, search and stats response that mentions a person goes through it; a
spec test asserts that no `SUPPORT` response body contains a known first name, last name or
e-mail local part.

Fields beyond the name follow the same rule:

| Field                                                | SUPPORT                         | DATA_OFFICER |
| ---------------------------------------------------- | ------------------------------- | ------------ |
| First/last name, full e-mail                         | initials, domain                | yes          |
| Player birth date                                    | `isMinor` boolean only          | yes          |
| Licence number, national id                          | no                              | yes          |
| Club name, team name, event location, opponent       | yes (organisations, not people) | yes          |
| `ParentalConsent` attester name                      | initials                        | yes          |
| Scoresheet `parsedData` (contains handwritten names) | no, status + counts only        | yes          |
| Scoresheet `failureReason`                           | yes (server-composed French)    | yes          |

### Audit of reads

`GET /admin/users/:id` and `GET /admin/players/:id` write `ADMIN_PII_VIEWED` **only when the
caller is a `DATA_OFFICER`** (a `SUPPORT` response carries no PII, so there is nothing to log).
The player variant stores `metadata.subjectPlayerId`, plus `subjectUserId` when the player is
linked to an account, so the existing `?userId=` audit filter still finds it. A new
`?playerId=` filter covers unclaimed players.

`GET /admin/users/:id` becomes readable by `SUPPORT` too (redacted). It is `DATA_OFFICER`-only
today because it only ever returned PII.

## Browse

All lists are paginated with the existing `PaginatedResult` (default 25, max 100) and branch
`error → loading → empty → data` on the client.

| Route                          | Returns                                                                                                                             | Filters                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /admin/clubs`             | id, name, FFBB code, createdAt, member/admin/team/player counts                                                                     | `q` (name or FFBB code), `hasAdmin`, `createdFrom/To`, sort                                            |
| `GET /admin/clubs/:id`         | club + meeting-point defaults + counts                                                                                              | —                                                                                                      |
| `GET /admin/clubs/:id/members` | `AdminPersonRef` + role + joinedAt                                                                                                  | `role`                                                                                                 |
| `GET /admin/teams`             | id, name, category, gender, owner club, partner clubs, roster/admin counts                                                          | `clubId`, `category`, `gender`, `q`, `hasAdmin`                                                        |
| `GET /admin/teams/:id`         | team + linked clubs (owner flag) + TeamAdmins + FFBB links                                                                          | —                                                                                                      |
| `GET /admin/teams/:id/roster`  | `TeamPlayer` rows: player ref, role, linked user ref                                                                                | `role`                                                                                                 |
| `GET /admin/users`             | `AdminPersonRef`, verified, lastActiveAt, daysUntilErasure, club/team counts, platform role                                         | `q`, `clubId`, `teamId`, `clubRole`, `verified`, `inactiveSoon`, `isGuardian`, `hasPlatformRole`, sort |
| `GET /admin/users/:id`         | profile + memberships (club links) + TeamAdmin grants + rostered players (team links) + guardian-of (player links) + sessions count | —                                                                                                      |
| `GET /admin/players`           | player ref, club, claimed, isMinor, consent state, team count                                                                       | `clubId`, `teamId`, `claimed`, `minor`, `missingConsent`, `q`                                          |
| `GET /admin/players/:id`       | player + club + linked user + teams + guardians + guardian invites + player invite + consent history                                | —                                                                                                      |
| `GET /admin/events`            | id, team, type, startsAt, venue, opponent, RSVP counts, convocation count, scoresheet status                                        | `clubId`, `teamId`, `type`, `from`, `to`, `scoresheetStatus`                                           |
| `GET /admin/events/:id`        | event + team + meeting plan + RSVP roster + convocations + scoresheet + extraction summary                                          | —                                                                                                      |
| `GET /admin/scoresheets`       | event ref, team, status, attemptCount, failureReason, uploadedAt                                                                    | `status`, `clubId`, `from`, `to`                                                                       |

The v1 `GET /admin/users` (inactivity list) becomes `GET /admin/users?inactiveSoon=true`, with
the same ordering. The response shape changes (it gains `AdminPersonRef` and counts), which is
fine: the only consumer is `AdminUsersPage`, rewritten in the same phase.

`q` on people depends on the role, because a free-text search is itself a way to read data:

- `DATA_OFFICER`: case-insensitive substring on first name, last name and e-mail.
- `SUPPORT`: **exact** e-mail match only (someone on the phone gives their address). The hit comes
  back redacted. A substring search would let SUPPORT rebuild names one letter at a time from the
  result counts.

Organisation searches (club name, team name, FFBB code) are open to both roles.

Queries go through `PrismaService` directly, following the cross-module convention of Events,
Dashboard and Team stats, and are bounded: one `count` + one `findMany` per list, with `_count`
for the counters, never a query per row.

## Global search

`GET /admin/search?q=` returns at most 5 hits per kind, grouped:
`{ clubs, teams, users, players, events }`, each with `id`, a label and its kind.

- A string that parses as a UUID is looked up by primary key in **every** table at once
  (`Promise.all`, one `findUnique` each), so pasting an id from a log or a support e-mail lands
  on the record whatever its type. A single exact hit redirects straight to its detail page on
  the client.
- Anything else is matched with the same per-role rules as the list `q` above. Events are only
  found by id.
- Minimum 2 characters, 300 ms debounce on the client.

## Stats

### Range and buckets

`GET /admin/stats?range=7d|30d|90d|season|all&clubId=` returns one `AdminStats` payload.

- `season` is the current 1 September → 31 August, using the same rule as the Team stats module.
- Buckets are ISO weeks (`date_trunc('week', …)` in Europe/Paris) for every range, including
  `all`, so the series shape never changes. `all` starts at the earliest `Club.createdAt`.
- `clubId` scopes every metric to that club. A CTC team, and everything under it, counts in
  **each** of its linked clubs, so per-club figures intentionally don't sum to the global ones.
- Computed on read, no cache in v1. Every metric is one aggregate query (`count`, `groupBy` or a
  single `$queryRaw` for weekly series), run in parallel. If this ever gets slow, add a
  60-second in-process cache keyed by `(range, clubId)` rather than a snapshot table.

### Metrics

**Growth**

| Metric                                          | Kind   | Source                                       |
| ----------------------------------------------- | ------ | -------------------------------------------- |
| Users, clubs, teams, players (totals)           | tile   | `count`                                      |
| New users / clubs / teams / players per week    | series | `createdAt`                                  |
| Players with a linked account (claimed %)       | tile   | `Player.userId not null`                     |
| Active users in the last 7 / 30 / 90 days       | tiles  | `User.lastActiveAt`                          |
| Guardian-only accounts (no membership, ≥1 link) | tile   | `PlayerGuardian` without `ClubMembership`    |
| Teams by category and gender                    | bar    | `groupBy`                                    |
| CTC teams (linked to 2+ clubs)                  | tile   | `ClubTeam` `groupBy teamId having count > 1` |

A weekly **active users** series is deliberately absent: `lastActiveAt` is a single overwritten
timestamp, and `AuditLog` records logins but not token refreshes, so a user who stays logged in
would never be counted. Adding history for this is its own decision (a daily activity table), not
something to approximate from logins.

**Engagement**

| Metric                                            | Kind          | Source                                                   |
| ------------------------------------------------- | ------------- | -------------------------------------------------------- |
| Events per week, by type (training / match)       | series        | `Event.startsAt` in range                                |
| Recurring vs one-off events                       | tile          | `recurrenceId`                                           |
| RSVP response rate                                | tile + series | RSVP rows ÷ (roster size × events), past events in range |
| RSVP split (going / not going / maybe)            | bar           | `EventRsvp.status`                                       |
| Answers given by a guardian                       | tile          | `EventRsvp.respondedByUserId` ≠ the player's `userId`    |
| Convocations sent per week                        | series        | `EventConvocation.createdAt`                             |
| Matches with a meeting point set                  | tile          | `EventMeeting` / resolved plan                           |
| Travel mode split (meeting point / direct)        | bar           | `EventRsvp.travelMode` where `GOING`                     |
| MVP votes cast                                    | tile          | `EventVote` count only, never who voted                  |
| Scoresheet coverage (past matches with an upload) | tile          | `EventScoresheet` ÷ past `MATCH` events                  |
| Guardian links created per week                   | series        | `PlayerGuardian.createdAt`                               |
| E-mail notifications opt-out rate                 | tile          | `emailNotificationsEnabled = false`                      |
| Users with Web Push enabled                       | tile          | distinct `PushSubscription.userId`                       |
| FFBB-linked clubs / teams                         | tile          | `ffbbClubCode`, `TeamFfbbLink`                           |

The RSVP response rate uses the **current** roster size, because roster history isn't stored. The
tile says so in its hint ("sur l'effectif actuel").

**Health / ops**

| Metric                                                 | Kind         | Source                                              |
| ------------------------------------------------------ | ------------ | --------------------------------------------------- |
| Scoresheets by status, and failure rate in range       | bar + tile   | `EventScoresheet.status`                            |
| Average OCR attempts, sheets needing review            | tiles        | `ScoresheetExtraction.attemptCount`, `NEEDS_REVIEW` |
| Sheets stuck in QUEUED/PROCESSING for more than 1 hour | tile (link)  | `status` + `uploadedAt`                             |
| Unverified e-mails (total, and older than 7 days)      | tiles (link) | `emailVerifiedAt is null`                           |
| Pending player / guardian invites (live vs expired)    | tiles        | `PlayerInvite`, `GuardianInvite`                    |
| Minors missing parental consent                        | tile (link)  | `birthDate` minor + no live `ParentalConsent`       |
| Accounts nearing erasure                               | tile (link)  | existing `inactiveSoon` rule                        |
| Clubs with no ADMIN, teams with no manager             | tiles (link) | memberships / `TeamAdmin` + club admins             |
| Last retention run: status, date                       | tile (link)  | `RetentionRun`                                      |
| Meeting-point routes waiting to be recomputed          | tile         | `EventMeeting` with a stale `travelRouteKey`        |

Every "(link)" tile opens the matching filtered list, so a number is always one click from the
records behind it. That is the reason the filters above exist.

Per-club scoping applies to every metric except the retention run (global by nature). Club detail
pages show the same components with `clubId` set.

## Support actions

Every action:

- is its own `POST` route under the record it acts on, open to **both** roles
  (`@PlatformRoles()` not set);
- requires `reason` (10–500 characters, same DTO rule as erase);
- writes one `ADMIN_SUPPORT_ACTION` audit row **in the same transaction as the write**, with
  `metadata: { action, reason, subjectUserId?, subjectPlayerId?, clubId?, teamId?, eventId?, before?, after? }`;
- reuses the domain service that already owns the rule where one exists, rather than
  re-implementing it, so a back-office fix can't produce a state the product itself refuses;
- shows its outcome as a `toast()`, per the Feedback convention.

`ADMIN_SUPPORT_ACTION` is **one** new `AuditEventType` with a typed `metadata.action`, not one
enum value per action. The v1 split into per-type values exists so a DPO can filter precisely on
_disclosures_ ("who looked at this person"); writes are one family, and fourteen enum values would
cost a migration each time an action is added. The audit-log page gains an `action` filter.

This widens `AuditLog` beyond authentication activity, as the v1 admin types already did. The
volume is a handful of rows a day, so the reason v1 gave for keeping it narrow (write volume on
every request) doesn't apply.

| Action                     | Route                                                       | Behaviour / reuse                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resend verification e-mail | `POST /admin/users/:id/resend-verification`                 | `AccountSecurityService.sendVerificationEmail`; 409 if already verified                                                                                                                |
| Mark e-mail verified       | `POST /admin/users/:id/mark-verified`                       | sets `emailVerifiedAt`; for someone who can't receive the mail and proved the address another way                                                                                      |
| Send password-reset e-mail | `POST /admin/users/:id/send-password-reset`                 | `AccountSecurityService.requestPasswordReset`; staff never see or set a password                                                                                                       |
| Revoke all sessions        | `POST /admin/users/:id/revoke-sessions`                     | revokes every live `RefreshToken`; access tokens expire on their own                                                                                                                   |
| Change club role           | `POST /admin/clubs/:id/members/:userId/role`                | `ADMIN` ↔ `MEMBER`; demoting the **last** ADMIN is refused (409): that is how a club ends up orphaned                                                                                  |
| Remove membership          | `POST /admin/clubs/:id/members/:userId/remove`              | `ClubsService.removeMember`; same last-ADMIN refusal                                                                                                                                   |
| Add TeamAdmin              | `POST /admin/teams/:id/admins`                              | `userId` must be a member of a linked club (same eligibility as `TeamsService.listEligibleAdmins`); `EmailVerifiedGuard` is **not** applied: staff checked the person out-of-band      |
| Remove TeamAdmin           | `POST /admin/teams/:id/admins/:userId/remove`               | no last-admin block: staff are the fallback when someone is locked out                                                                                                                 |
| Transfer team ownership    | `POST /admin/teams/:id/owner`                               | `clubId` must already be linked; flips `isOwner` on both `ClubTeam` rows in one transaction                                                                                            |
| Retry OCR                  | `POST /admin/scoresheets/:id/retry`                         | `ScoresheetsService.enqueueOcr` with the same `CONFIRMED` refusal as `retryOcr`                                                                                                        |
| Cancel guardian invite     | `POST /admin/players/:id/guardian-invites/:inviteId/cancel` | `GuardiansService.cancelInvite`                                                                                                                                                        |
| Remove guardian link       | `POST /admin/players/:id/guardians/:userId/remove`          | `GuardiansService.removeGuardian`                                                                                                                                                      |
| Record parental consent    | `POST /admin/players/:id/parental-consent`                  | `ClubsService.recordParentalConsent` (gains an optional `source` parameter), with new `source: PLATFORM_STAFF` and `attestedByName` = the admin; body carries who gave consent and how |

Two schema additions come with this phase: `AuditEventType.ADMIN_SUPPORT_ACTION` and
`ParentalConsentSource.PLATFORM_STAFF`. The latter keeps the evidence truthful: a Kluvo employee
recording consent on a club's behalf is not the club's own staff attestation.

### UI

Actions sit on the detail page of the record they change, grouped in an "Actions support" card.
Each one opens a `Dialog` (one blessed modal, react-hook-form + zod) with a summary of what will
happen, the mandatory reason field and a confirm button. Destructive ones (revoke sessions,
remove membership, remove guardian) use the danger button. No action is ever a one-click inline
control: every one needs a reason, which is exactly the "explicit confirm step" case in the
modal convention.

## Create: club + first admin

`POST /admin/clubs` with `{ name, ffbbClubCode?, firstAdminUserId, reason }`, both roles.

- Reuses `ClubsService.createClub(firstAdminUserId, …)`, which already creates the club and its
  ADMIN membership in one write, and the same FFBB-code conflict handling.
- The first admin must be an existing account. The dialog picks them through the same search as
  the users list (so `SUPPORT` finds them by exact e-mail).
- An **unverified** first admin is allowed, with a warning in the dialog: the product's
  `EmailVerifiedGuard` on `POST /clubs` protects against self-service abuse, and staff creating a
  club after a phone call is the out-of-band check.
- Audited as `ADMIN_SUPPORT_ACTION` with `action: 'CLUB_CREATED'`.

## Frontend

Routes under `/admin` (all lazy, inside `AdminShell`):

| Route                                  | Page                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/admin`                               | Stats home (global)                                                                              |
| `/admin/search?q=`                     | Full search results (the header box shows a dropdown with the top hits)                          |
| `/admin/clubs`, `/admin/clubs/:id`     | List; detail with tabs Membres / Équipes / Joueurs / Statistiques / Actions                      |
| `/admin/teams`, `/admin/teams/:id`     | List; detail with clubs, roster, admins, events                                                  |
| `/admin/users`, `/admin/users/:id`     | List (inactivity is a filter preset); detail with clubs, teams, children, sessions, export/erase |
| `/admin/players`, `/admin/players/:id` | List; detail with club, account, teams, guardians, invites, consent                              |
| `/admin/events/:id`                    | Event detail (reached from team pages and search)                                                |
| `/admin/scoresheets`                   | Ops list, default filter "échecs + bloquées"                                                     |
| `/admin/retention`                     | The current retention page, moved                                                                |
| `/admin/audit-log`                     | Audit log with the new `action` / `playerId` filters                                             |

Conventions that apply: filters and the page live in the URL (`?clubId=…&page=2`), so any view
can be pasted into a support ticket; `ResponsiveTable` for every list; `TextLink` for every
cross-record link; `Badge` tones for status; `SectionHeading` for sections; `?tab=` tabs as in
`TeamDetailPage`. A redacted name renders with a `Badge` "masqué" hint so `SUPPORT` knows it's
policy, not missing data. Copy is French.

**Design first.** Before any frontend code in phases 2, 3, 4, 5 and 6, a Claude Design canvas is
produced in the Parquet system (tokens from `packages/@basketeasy/ui/tailwind-preset.cjs`,
surfaces ladder, Big Shoulders / Atkinson, court-line rules) and validated by the product owner.
The canvas link goes in that phase's PR description. Charts follow the `dataviz` guidance
with the brand palette: blue-green for structure/series, orange only for the highlighted value.

## Next step: read-only impersonation (not built here)

"See the app as this user", for the bugs that only reproduce with someone's own data.

- `DATA_OFFICER` only, with a reason, audited as its own `ADMIN_IMPERSONATION_STARTED` type (it's
  a disclosure, like export).
- Mints a separate, short-lived (15 min, non-refreshable) access token with claims
  `{ sub: subjectUserId, act: adminUserId, scope: 'impersonation-readonly' }`, signed with
  `PLATFORM_JWT_SECRET`, never `JWT_ACCESS_SECRET`.
- A global guard rejects every non-`GET` request carrying that scope (403), so no write can slip
  through a route someone forgot to annotate. `LastActiveInterceptor` and notification read-marking
  skip it, so impersonating never changes the subject's data.
- The product renders a permanent banner "Vue en tant que J. D. · lecture seule · Quitter".
- Deserves its own spec and threat model before code: it's the first time a credential acts as
  someone else.

## Out of scope

- Editing arbitrary fields (names, birth dates, event details): clubs own their data, and every
  write here is a named fix.
- Creating memberships, teams, rosters or invites on a club's behalf (only the club itself).
- Security stats (failed logins, lockouts).
- Historical active-user series (needs an activity history table).
- A geographic breakdown (`Club` has no city or department).
- Search indexes (`pg_trgm`): `ILIKE` is fine at launch scale; revisit past ~50k users.
