# Parents answering for their children (guardians)

Status: design (agreed with product owner 2026-09-27)
Date: 2026-09-27

Validated design canvas: https://claude.ai/artifact/XamFReY4Va2PeKMVdaRVxR (11 screens: parent
week, persona switcher, parent-player « Moi » view, a child's match, notifications, the child's
profile, invite acceptance, admin player table and « Parents » dialog, coach attendance, adult
player removing a parent). The app-wide restyle the canvas asked for shipped first, in #187.

Implementation is split into four PRs, each small enough to review on its own (see
[Delivery plan](#delivery-plan)), each with its own spec:

1. [Backend: guardian links](./2026-09-27-parent-guardian-part1-links-backend.md)
2. [Backend: acting as, respondent, fan-out](./2026-09-27-parent-guardian-part2-acting-as-backend.md)
3. [Frontend: linking](./2026-09-27-parent-guardian-part3-linking-ui.md)
4. [Frontend: acting as](./2026-09-27-parent-guardian-part4-acting-as-ui.md)

## Why

Most of a youth club's roster can't answer for itself. An U11 has no phone, no e-mail, and no
Kluvo account; today the coach chases parents on WhatsApp and types the answers into nothing.
Kluvo already has RSVP, convocations, the meeting point and notifications, but every one of them
is keyed on « the player's own account » (`Player.userId`). This feature lets one or more parents
act for a child: answer, choose how the child travels, receive the child's notifications, see
their team's stats and correct their profile.

## Scoping decisions

Each line is a decision taken with the product owner. The rest of the document is how each one is
built.

| #   | Decision                                      | Chosen                                                                                                                                                                             | Rejected                                                                                                                                |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Data model                                    | Separate `PlayerGuardian` link, many-to-many between `Player` and `User`                                                                                                           | Putting the parent's account on `Player.userId`: one child per parent per club, and the child can never get their own account           |
| 2   | Being a parent                                | A **derived state** (« has a `PlayerGuardian` row for a player of this club »), not a role                                                                                         | `ClubRole.GUARDIAN`: `ClubMembership` is unique per user and club, and a parent is often also a player, coach or admin of the same club |
| 3   | Club access of a parent who is nothing else   | No `ClubMembership` row. The guardian link itself opens the child's team pages, and nothing else                                                                                   | Making them `MEMBER`: they would see the whole club's member list                                                                       |
| 4   | How a parent is linked                        | An admin generates a one-time invite link per parent, sent by SMS/WhatsApp/e-mail                                                                                                  | CSV import, a child inviting a parent, parent request + admin approval (all later, if ever)                                             |
| 5   | Invite limits                                 | 7 days, one link per parent, max 4 guardians and 4 pending invites per player                                                                                                      |                                                                                                                                         |
| 6   | Existing accounts                             | The invite can be accepted by creating an account **or** by a logged-in user (a parent who already plays or coaches)                                                               | Register-only like `PlayerInvite`                                                                                                       |
| 7   | Parental consent                              | Ticking the consent box is part of accepting the invite when the child is a minor; it records a `ParentalConsent` attested by the parent. Staff attestation stays as the fallback  | Keeping staff attestation only                                                                                                          |
| 8   | Who answers when the child has an account too | Both. The last answer wins, and everyone sees who gave it (« Répondu par Sophie M. »)                                                                                              | Parent-only while minor; child-only once they have an account                                                                           |
| 9   | What a parent can do for a child              | RSVP, travel mode (RDV / direct), receive notifications, view the team's stats, edit the child's profile (first name, last name, birth date, gender)                               | Voting for the MVP, logistics (jerseys/balls), scoresheet upload, anything a manager does. See [Out of scope](#out-of-scope)            |
| 10  | Notifications                                 | The child's account (if any) and **every** guardian get them. Each person keeps their own e-mail/push preferences. One person concerned twice by one event gets one merged message | Parents only while minor; a per-child opt-in                                                                                            |
| 11  | Several children                              | A persona switcher (« Moi », Léo, Emma) in the header, like the club switcher. Hidden when there is only one persona                                                               | All children merged on one screen                                                                                                       |
| 12  | Playing parent                                | « Moi » is a persona like the children, with its own week and its own answers                                                                                                      |                                                                                                                                         |
| 13  | At 18                                         | The link stays. The adult player can remove a parent from their profile; an admin can always unlink; a parent can stop following a child                                           | Automatic cut on the 18th birthday                                                                                                      |
| 14  | Relationship label                            | None. A respondent reads as first name + last initial (« Sophie M. »), never « maman » / « papa »                                                                                  | A relationship field: more data, more ways to be wrong, no feature needs it                                                             |
| 15  | Volunteer duties (later module)               | One duty **per child**, taken by any one of that child's guardians. The guardian links are the pool; nothing else is stored now                                                    | Per family/household: no `Family` table is created                                                                                      |
| 16  | Separated parents                             | Both linked to the child, no household concept, admin can unlink either                                                                                                            | Two households per child                                                                                                                |
| 17  | Other parents' contact                        | A guardian sees co-guardians' **names** only, never their e-mail                                                                                                                   |                                                                                                                                         |

## Vocabulary

- **Guardian**: a `User` with a `PlayerGuardian` row for a `Player`. French UI: « parent » /
  « responsable légal·e ».
- **Child**: the `Player` a guardian is linked to. Nothing requires them to be a minor.
- **Persona**: who the current screen acts for: « Moi » (the user's own roster slots) or one child.
- **Acting as**: a request made by a user for a persona other than themselves.

## Data model

All in `server/prisma/schema.prisma`, one hand-written migration (sandbox rule).

```prisma
model PlayerGuardian {
  playerId  String
  userId    String
  createdAt DateTime @default(now())
  player    Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([playerId, userId])
  @@index([userId])
}

model GuardianInvite {
  id                String    @id @default(uuid())
  playerId          String
  tokenHash         String    @unique
  expiresAt         DateTime
  acceptedAt        DateTime?
  acceptedByUserId  String?
  createdByUserId   String?
  createdAt         DateTime  @default(now())
  player            Player    @relation(fields: [playerId], references: [id], onDelete: Cascade)
  acceptedBy        User?     @relation("GuardianInviteAcceptedBy", fields: [acceptedByUserId], references: [id], onDelete: SetNull)
  createdBy         User?     @relation("GuardianInviteCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([playerId])
}
```

- **`PlayerGuardian` has a composite key**, not a surrogate id: the pair is the identity, and a
  duplicate link is then a unique violation rather than a check.
- **Both relations cascade.** Deleting a player (`ClubsService.deletePlayer`) or erasing a
  parent's account (the retention sweep) removes the link and nothing else. No club history hangs
  off a guardian link, so rule 3 of the retention policy is untouched.
- **`GuardianInvite` is not `PlayerInvite` with a flag.** `PlayerInvite` is one-per-player
  (`playerId @unique`) and claims `Player.userId`; a guardian invite is one-per-parent and claims
  nothing on the player. Same token shape (`randomBytes(32)`, only `hashToken` stored), same
  « reused vs expired » distinction via `acceptedAt`.
- **`EventRsvp.respondedByUserId String?`** (`onDelete: SetNull`), written on every set. Null on
  rows that predate the feature and on rows whose respondent's account was erased; both read as
  « no author known » and render nothing. `respondedAt` already exists.
- **`ParentalConsent.source ParentalConsentSource @default(STAFF_ATTESTATION)`**, enum
  `STAFF_ATTESTATION | GUARDIAN_IN_APP`. `attestedByUserId` alone can't tell a staff member who
  ticked a box for a family apart from the parent confirming it themself, and the difference
  matters as evidence. Existing rows default to staff attestation, which is what they are.
- **`Notification.subjectFirstName String?`**: the first name of the child the notification is
  about, denormalised like `title`/`body` so the « pour qui » tag on a row still reads after the
  child is renamed or deleted. Null on a notification about the reader themself.

Nothing is added to `ClubMembership` or `ClubRole`.

## Authorization

### One helper decides « may this user act for this player »

`server/src/common/acting-as.ts`, a pure function over `PrismaService` (same convention as
`startParentalConsentRetention`: modules query Prisma directly instead of injecting each other's
services):

```ts
resolveActingTeamPlayer(prisma, { userId, teamId, forPlayerId }): Promise<TeamPlayer | null>
```

- `forPlayerId` absent → today's behaviour: the caller's own `TeamPlayer` on the team
  (`player.userId = userId`). `EventsService.findMyTeamPlayer` becomes a call to it.
- `forPlayerId` present → the `TeamPlayer` of that player on that team, **only if** the player's
  `userId` is the caller or a `PlayerGuardian(playerId, userId)` row exists. Otherwise
  `ForbiddenException`. A body-supplied id is never trusted on its own, which is the rule the RSVP
  spec already set.

### `ClubRolesGuard` learns one exception: `@AllowGuardians()`

A parent who is nothing else has no membership, so every club-scoped route would 403. A new
decorator on a route tells `ClubRolesGuard`: when the membership check fails, also pass if the
caller guards a player whose `Player.clubId` is the route's `:clubId`, and, on a route with a
`:teamId`, who is rostered on that team. One extra query, only on the failure path, so members pay
nothing.

Routes that get it (reads a player already has, plus the two writes decision 9 allows):

- `GET .../teams/:teamId`, `GET .../teams/:teamId/players` (roster), `GET .../teams/:teamId/stats`,
  `GET .../teams/:teamId/ffbb-poule-results`
- `GET .../events`, `GET .../events/:eventId`, `.../rsvps`, `.../convocations`, `GET .../votes`
  (results). The meeting plan needs nothing: it already rides on `TeamEvent.meetingPlan`
- `PATCH`/`DELETE .../events/:eventId/rsvp`, `PATCH .../events/:eventId/travel-mode`

The guard only opens the door to the club; each service still narrows through
`resolveActingTeamPlayer`, exactly as today's RSVP narrows a `MEMBER` to « rostered on this team ».

**CTC**: a child's `Player.clubId` is their own club, always one of the team's linked clubs
(`TeamsService.addTeamPlayer` enforces it). The frontend therefore always navigates a guardian
through the child's club, which the guard accepts. It never needs the partner club.

`TeamManagerGuard` and `EmailVerifiedGuard` are unchanged: a guardian link never grants manager
rights, and nothing in this feature hands out authority over other people's data.

## Backend

New module `server/src/guardians` (controller + service), plus changes in events, dashboard,
team-stats, meeting-points and notifications.

### Admin: managing a player's guardians

Under `clubs/:clubId/players/:playerId/guardians`, `ClubRoles('ADMIN')`, every call re-verifying
the player through `findPlayerInClub`:

- `GET` → `{ guardians: [{ userId, firstName, lastName, linkedAt, consentGivenAt | null }],
pendingInvites: [{ id, createdAt, expiresAt }] }`
- `POST .../invites` → `{ token, url, expiresAt }`. 400 when the player already has 4 guardians or
  4 live invites. The raw token is only returned here, like `createPlayerInvite`.
- `DELETE .../invites/:inviteId` cancels a pending invite.
- `DELETE .../:userId` removes a guardian.

`GET .../players` (the roster list) gains `guardianCount` per player, one `groupBy` for the page.

### Public: accepting an invite

Top-level `guardian-invites/:token`, beside `invites/:token`:

- `GET` (public) → `{ playerFirstName, playerLastName, clubName, teamNames, requiresConsent,
expiresAt }`. `requiresConsent` is `isMinorBirthDate(birthDate)`; an unknown birth date requires
  none, because `ParentalConsent` snapshots the birth date and can't be written without one.
- `POST .../accept` (public) `{ firstName, lastName, email, password, consent }` → registers,
  links, returns a session (same response shape as `InvitesService.accept`).
- `POST .../accept-as-me` (`JwtAuthGuard`) `{ consent }` → links the logged-in user.

Both accept paths run one transaction: re-check the invite is live, refuse a user who is the
player themself (`Player.userId`), refuse a fifth guardian, create `PlayerGuardian` (a duplicate
is a no-op success: accepting twice is not an error), mark the invite accepted, and when
`requiresConsent`, refuse without `consent: true` (`400 PARENTAL_CONSENT_REQUIRED`, the existing
code) and write `ParentalConsent` with `source: GUARDIAN_IN_APP`, `attestedByUserId` and
`attestedByName` from the parent, and the retention clock cleared (same effect as
`recordParentalConsent`). The invite's audit entries go through `AuditService.record()` like the
other token flows: `GUARDIAN_INVITE_ACCEPTED`.

### Me: personas, children, links

Not club-scoped, same reasoning as `MyTeamsController`:

- `GET /me/personas` → `{ self: { isPlayer, pendingCount } | null, children: [{ playerId,
firstName, lastName, clubId, clubName, teams: [{ teamId, teamName }], pendingCount }] }`.
  `self` is null for a guardian-only user (no membership, no `TeamAdmin`, no rostered player).
  `pendingCount` is « events in the next 14 days where this persona is rostered and has no
  answer », computed in one query per persona kind, not per child.
- `GET /me/children/:playerId` → the child's profile plus co-guardians' names (decision 17) and
  the consent record.
- `PATCH /me/children/:playerId` `{ firstName?, lastName?, birthDate?, gender? }`. Licence fields,
  `nationalId` and teams stay admin-only.
- `DELETE /me/children/:playerId` → the caller stops following the child.
- `GET /me/players/:playerId/guardians` and `DELETE /me/players/:playerId/guardians/:userId` →
  a player managing who follows them. The delete requires `player.userId = caller` **and**
  `!isMinorBirthDate(birthDate)`: a minor can't remove their own parents (decision 13).

### Acting as, on every read and write that has a « me »

`forPlayerId` is an optional query parameter (validated `IsUUID`) on:

- `GET .../events`, `GET .../events/:eventId`: `myRsvpStatus`, `myConvocation`, `myTravelMode`
  resolve for that player; `isMe` in roster responses flags the persona.
- `PATCH`/`DELETE .../rsvp`, `PATCH .../travel-mode`: the answer is written on the persona's
  `TeamPlayer`, with `respondedByUserId` = the caller.
- `GET /me/dashboard`: the agenda of the child's teams, answered as the child. No action items
  (those are manager work).
- `GET /me/teams`: the child's teams, so « Son équipe » resolves.
- `GET .../stats`: highlights the child's row.

`resolveMyEventState` keeps its bound (one shared lookup plus one `findMany` per concern): only
the lookup changes, from « my `TeamPlayer` » to `resolveActingTeamPlayer`.

`TeamEvent` and `MyAgendaEvent` gain `myRsvpRespondedBy: { firstName: string | null;
lastInitial: string | null; isMe: boolean } | null` and `myRsvpRespondedAt`. The roster breakdown
(`EventRsvpRosterEntry`) gains the same `respondedBy` plus `respondedByGuardian: boolean` (the
respondent is not the player), which is what the coach's « Donnée par » column reads. Fetched in
the same query as the RSVP rows (a `select` on the user), not per row.

### Notifications fan-out

One helper, `resolvePlayerAudience(prisma, teamPlayerIds)`, returns for each player their own
`userId` (if any) and their guardians' ids, in one query. Every emission point that today maps
`TeamPlayer → Player.userId` goes through it:

- `EventsService.notifyNewlyConvoked`: convocation.
- `EventsService.deleteEvent` / `notifyCancellation`: cancellation (recipients still gathered
  before the delete).
- `MeetingPointsService.announceMeetingChanges`: `EVENT_MEETING_FIXED` / `EVENT_MEETING_CHANGED`
  for players GOING with `MEETING_POINT`.
- Not `ScoresheetOcrProcessor`: it notifies the uploader, and parents don't upload (decision 9).

Per recipient and per event, the helper groups the subjects: « self » and/or children's first
names. The copy functions (`event-notification-copy.ts`, `meeting-notification-copy.ts`) take
that subject instead of assuming the reader:

- self only → today's copy (« Vous êtes convoqué·e »)
- one child → « Léo est convoqué », `subjectFirstName: 'Léo'`
- several subjects → one merged message (« Léo et vous êtes convoqués », « Léo et Emma sont
  convoqués »), never one per subject.

A guardian's `deepLink` carries `?pour=<playerId>`, so opening it switches the persona. The
existing « only newly convoked » diff and « one summary per series » rules apply unchanged: they
decide _which players_ are concerned, and the fan-out happens after.

### Retention and privacy

- Guardian-only accounts age out like any other through `User.lastActiveAt`; their links cascade.
- `GuardianInvite` rows cascade with the player. Expired invites are left alone: they are small,
  per player, and capped at 4 live.
- `ParentalConsent` written by a parent follows the existing lifecycle (clock starts at deletion).
- The retention spec's « not built yet: a parent-facing portal » line is this feature: update that
  line in `CLAUDE.md` when it ships.

## Frontend

### Acting-as plumbing

- `ActingAsProvider` (context, beside `ActiveClubProvider` in `ProtectedRoute`) holds the persona:
  `null` for « Moi » or a `playerId`. It reads `?pour=` on navigation (notification deep links),
  remembers the last choice per user in `localStorage` (wrapped in try/catch, a convenience only),
  and falls back to « Moi », or to the only child for a guardian-only user.
- `usePersonas()` over `GET /me/personas`.
- Every hook with a « me » (`useTeamEvents`, `useEvent`, the RSVP/travel mutations, `useDashboard`,
  `useMyTeamList`, team stats) takes the persona, puts `forPlayerId` in its params and in its
  **query key**, so switching never shows one persona's answers under another's name.

### Switcher and cue

- `PersonaSwitcher`: the header chip (avatar + name + chevron, with a `CountBadge` summing the
  _other_ personas' pending answers). Desktop: next to the club switcher. Mobile: in the compact
  top bar added by #187, left of the bell. Rendered only when there is more than one persona.
- The picker is a `Dialog` with a new `variant="sheet"` on `DialogContent` (bottom-anchored,
  `rounded-t-2xl`), not a second modal primitive. Rows are a `RadioCardGroup`.
- `ActingAsBanner` (« Vous répondez pour **Léo Martin** · Changer »): mounted in `ProtectedRoute`
  next to `EmailVerificationBanner`, for the same reason: the one place that renders at both
  breakpoints. Hidden on « Moi ».
- Bottom nav labels follow the persona: « Ma semaine » / « Mon équipe » on « Moi », « Semaine » /
  « Son équipe » for a child.

### Screens

- **Dashboard and event page**: unchanged components, fed by the persona. `EventRsvpControl`
  shows the respondent line under the buttons (« Répondu par Sophie M. · jeu. 19:12 », « Répondu
  par vous »), with the existing « Touchez à nouveau… » hint kept. Heading « Léo sera là ? » when
  acting for a child.
- **Notifications**: `NotificationItem` gets the « pour qui » tag from `subjectFirstName` (a soft
  `Badge`), and an avatar.
- **Child profile** `/children/:playerId`: react-hook-form + zod form over the four editable
  fields, a read-only « Licence et équipes » note, co-guardians' names, the consent record, and
  « Ne plus suivre Léo » (`ConfirmDialog`).
- **Account page**: « Mes enfants » (links to each profile) and, for a player with guardians,
  « Accès parents » with « Retirer » behind a `ConfirmDialog`, hidden while the player is a minor.
- **Invite page** `/guardian-invite/:token`: top level beside `/invite/:token` (opened from a
  message, must not bounce a stale session). « Créer un compte » / « J'ai déjà un compte » tabs;
  the consent fieldset only when `requiresConsent`; errors through `setError('root')` + `Alert`,
  the auth-form convention.
- **Admin**: `PlayerRow` gets « Parents (n) » / « Inviter un parent » and a `GuardiansDialog`
  (list, pending invites with « Annuler », « Retirer », new link with « Copier »), mirroring
  `PlayerInviteDialog`. The players table gets a « Parents » column through `ResponsiveTable`.
- **Coach attendance**: `EventRosterList` shows who answered (« Sophie M. · parent »).

Every query consumer keeps the `error → loading → empty → data` order; every new control composes
`focusRing`; no new colour outside `tailwind-preset.cjs`.

### Where the build differs from the canvas

- The canvas's coach row « Vous · coach » is dropped: a coach can't answer for a player today, and
  this feature doesn't add it.
- The canvas's sheet is built as a `Dialog` variant (above), per the one-modal rule.
- Invite links read `https://<FRONTEND_URL>/guardian-invite/<token>`.

## Out of scope

Each is a possible follow-up, not a gap in this one:

- A parent voting for the MVP, taking jerseys/balls, or uploading a scoresheet on a child's
  behalf.
- A coach or admin answering for a player.
- Inviting a parent from a CSV import, or a child inviting their own parent.
- Relationship labels, households, per-child notification opt-out.
- The volunteer rota itself (decision 15 only makes it possible).
- Age-gating a child's own account (RGPD's under-15 rule for online services); `PlayerInvite` is
  unchanged.
- Consent withdrawal, same as today.

## Delivery plan

Each PR is shippable alone and keeps CI green. PR 1 touches `server/prisma` and
`server/src/auth`, so `pr-scope.yml` flags it: its description must list the schema and guard
changes.

1. **Backend: guardian links.** Migration (`PlayerGuardian`, `GuardianInvite`,
   `EventRsvp.respondedByUserId`, `ParentalConsent.source`, `Notification.subjectFirstName`),
   `@basketeasy/types/guardians`, `guardians` module (admin, invite accept both ways, `/me/personas`,
   `/me/children`, player-side removal), `acting-as.ts`, `@AllowGuardians()` on
   `ClubRolesGuard`. Jest: guard pass/fail matrix, invite lifecycle (expired, reused, fifth
   guardian, self-guardian, consent required/not), adult vs minor removal.
2. **Backend: acting as + fan-out.** `forPlayerId` on the reads and writes listed above,
   `respondedBy`, `resolvePlayerAudience` in the three emission points, subject-aware copy. Jest:
   a guardian answering writes the child's row with their own id; a stranger's `forPlayerId` is a
   403; a playing parent convoked with their child gets one merged notification.
3. **Frontend: linking.** `GuardiansDialog`, the « Parents » column, the invite page (both tabs,
   consent), child profile page, account page sections. Vitest + screenshots.
4. **Frontend: acting as.** `ActingAsProvider`, `usePersonas`, persona in every hook's key,
   `PersonaSwitcher` + sheet, `ActingAsBanner`, respondent line, notification tag, coach column.
   Vitest (switching persona never reuses the other persona's cache) + screenshots at 390 and 1280. Then the `CLAUDE.md` « Guardians » section.

## Defaults decided without asking

Reversible, listed so they are visible: the invite TTL (7 days, same as `PlayerInvite`); the caps
(4 guardians, 4 live invites); « minor » is `isMinorBirthDate`; only admins invite in v1; the
14-day window of `pendingCount`; accepting an already-accepted link by the same user is a success,
not an error.
