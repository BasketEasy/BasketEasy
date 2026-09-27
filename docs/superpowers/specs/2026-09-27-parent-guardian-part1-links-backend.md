# Parents (guardians): Part 1, backend (guardian links)

Status: spec (implements Part 1 of [`2026-09-27-parent-guardian-design.md`](./2026-09-27-parent-guardian-design.md))
Date: 2026-09-27

The data model, the invite flow in both directions, the « me » endpoints a parent and a player
need to manage the link, and the one authorization change that lets a parent who is nothing else
open their child's team. Nothing here changes what an existing member sees or answers: acting as a
child (`forPlayerId`) and the notification fan-out are Part 2.

`pr-scope.yml` flags this PR (`server/prisma`, `server/src/auth`); the description lists the
schema and guard changes.

## 1. Schema

One hand-written migration, `20260928000000_add_player_guardians`.

```prisma
enum ParentalConsentSource {
  STAFF_ATTESTATION
  GUARDIAN_IN_APP
}

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
  id               String    @id @default(uuid())
  playerId         String
  tokenHash        String    @unique
  expiresAt        DateTime
  acceptedAt       DateTime?
  acceptedByUserId String?
  createdByUserId  String?
  createdAt        DateTime  @default(now())
  player           Player    @relation(fields: [playerId], references: [id], onDelete: Cascade)
  acceptedBy       User?     @relation("GuardianInviteAcceptedBy", fields: [acceptedByUserId], references: [id], onDelete: SetNull)
  createdBy        User?     @relation("GuardianInviteCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([playerId])
}
```

Plus, on existing models:

- `EventRsvp.respondedByUserId String?` + relation `respondedBy User? @relation("EventRsvpRespondedBy", onDelete: SetNull)`.
  Written from Part 2 on; added now so the migration is one file.
- `ParentalConsent.source ParentalConsentSource @default(STAFF_ATTESTATION)`.
- `Notification.subjectFirstName String?`. Written from Part 2 on.
- `AuditEventType.GUARDIAN_INVITE_ACCEPTED`.
- Back-relations on `User` (`guardianOf`, `guardianInvitesAccepted`, `guardianInvitesCreated`,
  `rsvpsResponded`) and `Player` (`guardians`, `guardianInvites`).

## 2. Shared types: `@basketeasy/types/guardians`

New file plus its `exports` entry.

```ts
export const MAX_GUARDIANS_PER_PLAYER = 4;
export const MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER = 4;

export type ParentalConsentSource = 'STAFF_ATTESTATION' | 'GUARDIAN_IN_APP';

// Admin view
export interface PlayerGuardianSummary {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string; // admin only: the admin needs to tell two parents apart
  linkedAt: string;
  consentGivenAt: string | null; // this guardian's own in-app consent for this player, if any
}
export interface PendingGuardianInvite {
  id: string;
  createdAt: string;
  expiresAt: string;
}
export interface PlayerGuardians {
  guardians: PlayerGuardianSummary[];
  pendingInvites: PendingGuardianInvite[];
}
export interface GuardianInviteLink {
  id: string;
  token: string;
  url: string;
  expiresAt: string;
}

// Public invite page
export interface GuardianInvitePreview {
  playerFirstName: string;
  playerLastName: string;
  clubName: string;
  teamNames: string[];
  requiresConsent: boolean;
  expiresAt: string;
}
export interface AcceptGuardianInviteRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  consent?: boolean;
}
export interface AcceptGuardianInviteAsMeRequest {
  consent?: boolean;
}
export interface AcceptedGuardianInvite {
  playerId: string;
  clubId: string;
}

// Me
export interface PersonaTeam {
  teamId: string;
  teamName: string;
}
export interface SelfPersona {
  pendingCount: number;
  playerIds: string[];
} // own Player ids, one per club
export interface ChildPersona {
  playerId: string;
  firstName: string;
  lastName: string;
  clubId: string;
  clubName: string;
  teams: PersonaTeam[];
  pendingCount: number;
}
export interface MyPersonas {
  self: SelfPersona | null;
  children: ChildPersona[];
}

export interface GuardianName {
  firstName: string | null;
  lastName: string | null;
}
export interface MyChildProfile {
  playerId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  gender: Gender | null;
  isMinor: boolean;
  clubId: string;
  clubName: string;
  teams: PersonaTeam[];
  coGuardians: GuardianName[]; // never e-mails (decision 17), never the caller
  consent: { consentGivenAt: string; attestedByName: string; source: ParentalConsentSource } | null;
}
export interface UpdateMyChildRequest {
  firstName?: string;
  lastName?: string;
  birthDate?: string | null;
  gender?: Gender | null;
}
export interface MyPlayerGuardian extends GuardianName {
  userId: string;
  linkedAt: string;
}
export interface MyPlayerGuardians {
  playerId: string;
  isMinor: boolean;
  guardians: MyPlayerGuardian[];
}
```

`@basketeasy/types/players`' `Player` gains `guardianCount: number`. `ParentalConsent` gains
`source`. The invite reuses `INVITE_ALREADY_ACCEPTED_CODE` and `PARENTAL_CONSENT_REQUIRED_CODE`.

`SelfPersona` replaces the design's `isPlayer` flag with `playerIds` (the caller's own `Player`
rows): `isPlayer` is `playerIds.length > 0`, and the account page needs the ids to list who follows
the player (Part 3). `self` is non-null exactly when the user has a roster slot, a `TeamAdmin`
grant or a membership.

## 3. Authorization

### `@AllowGuardians()` on `ClubRolesGuard`

`server/src/auth/decorators/allow-guardians.decorator.ts` sets `ALLOW_GUARDIANS_KEY`.
`ClubRolesGuard`, when the membership check fails **and** the route carries the metadata, runs one
query:

```ts
prisma.playerGuardian.findFirst({
  where: {
    userId,
    player: { clubId, ...(teamId ? { teamPlayers: { some: { teamId } } } : {}) },
  },
  select: { playerId: true },
});
```

and passes when it finds a row. A member never pays for it. Routes without the decorator are
unchanged.

Routes that get it, all reads a rostered `MEMBER` already has, plus the two writes decision 9
allows:

| Controller    | Route                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clubs`       | `GET :clubId` (the header reads the club name)                                                                                                                                          |
| `teams`       | `GET :teamId`, `GET :teamId/players`, `GET :teamId/clubs`, `GET :teamId/ffbb-links`, `GET :teamId/ffbb-poule-results`                                                                   |
| `team-stats`  | `GET`                                                                                                                                                                                   |
| `events`      | `GET`, `GET :eventId`, `GET :eventId/rsvps`, `GET :eventId/convocations`, `GET :eventId/votes`, `GET :eventId/scoresheet`, `PATCH`/`DELETE :eventId/rsvp`, `PATCH :eventId/travel-mode` |
| `scoresheets` | `GET` (the extraction a rostered member already reads on the match page)                                                                                                                |

Not `GET .../teams` (the club's team list), not `GET :teamId/admins` (it carries each coach's e-mail, decision 17), not `GET .../members` or `.../players`, not votes
`PATCH`, logistics, scoresheet upload or retry: those stay member-only.

Until Part 2 wires `forPlayerId`, a guardian-only caller who reaches the RSVP write gets the
existing 403 « Vous n'êtes pas inscrit… »: the guard opens the door, the service still narrows.

### `server/src/common/acting-as.ts`

```ts
export async function resolveActingTeamPlayer(
  prisma: PrismaService | Prisma.TransactionClient,
  { userId, teamId, forPlayerId }: { userId: string; teamId: string; forPlayerId?: string },
): Promise<TeamPlayer | null>;
```

- No `forPlayerId` → `teamPlayer.findFirst({ where: { teamId, player: { userId } } })`, today's
  `findMyTeamPlayer`, which becomes a call to it.
- `forPlayerId` → one `teamPlayer.findFirst({ where: { teamId, playerId: forPlayerId, player: {
OR: [{ userId }, { guardians: { some: { userId } } }] } } })`. When that finds nothing, a second
  lookup tells the two failures apart: the player isn't on this team → `null` (the caller behaves
  as « not rostered », same as today); the caller may not act for them →
  `ForbiddenException('Vous ne pouvez pas répondre pour ce joueur')`.

Also exports `canActForPlayer(prisma, userId, playerId): Promise<boolean>` (self or guardian),
used by the `/me/children` routes.

## 4. `server/src/guardians`

`GuardiansModule` (imports `AuthModule` for `AuthService`, `AuditModule`), three controllers.

### Admin: `clubs/:clubId/players/:playerId/guardians`

`JwtAuthGuard, ClubRolesGuard`, `@ClubRoles('ADMIN')`. Every call re-verifies the player through
the service's own `findPlayerInClub` (404 « Player not found »).

- `GET` → `PlayerGuardians`. Guardians ordered by `createdAt`; `consentGivenAt` is the newest
  `ParentalConsent` for this player with `source: GUARDIAN_IN_APP` and `attestedByUserId` = that
  guardian (one `findMany` for the whole list). `pendingInvites` = `acceptedAt: null` and
  `expiresAt > now`, newest first.
- `POST invites` → `GuardianInviteLink` (201). 400 « Ce joueur a déjà 4 parents liés » when the
  player has `MAX_GUARDIANS_PER_PLAYER` links; 400 « 4 invitations sont déjà en attente pour ce
  joueur » at `MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER` live invites. Token: `randomBytes(32)`,
  only `hashToken` stored, TTL 7 days. URL: `${FRONTEND_URL}/guardian-invite/${token}`.
- `DELETE invites/:inviteId` (204). 404 unless the invite belongs to the player and is still
  pending. Deletes the row: a cancelled link is simply unknown afterwards.
- `DELETE :userId` (204). 404 when no such link.

`ClubsService.listPlayers` adds `guardianCount` from one `playerGuardian.groupBy({ by:
['playerId'], where: { playerId: { in: pageIds } } })`; `createPlayer`/`updatePlayer` return `0`
/ the count for that one player.

### Public: `guardian-invites/:token`

- `GET` (no auth) → `GuardianInvitePreview`. Unknown or expired → 404 « Invitation invalide ou
  expirée »; accepted → 409 `INVITE_ALREADY_ACCEPTED_CODE`, the `PlayerInvite` rule verbatim.
  `teamNames` from the player's `TeamPlayer` rows. `requiresConsent = isMinorBirthDate(birthDate)`.
- `POST accept` (no auth, `assertSameOrigin`) `AcceptGuardianInviteDto` → `AccessTokenResponse`
  and the refresh cookie, same as `InvitesController.accept`. Validates the invite and the
  consent rule **before** registering, so a refused consent never leaves an orphan account.
  Registers through `AuthService.register`, writes `firstName`/`lastName` on the new user, then
  links (below), then re-reads the user through `AuthService.me`.
- `POST accept-as-me` (`JwtAuthGuard`) `AcceptGuardianInviteAsMeDto` → `AcceptedGuardianInvite`.

**Linking, one transaction for both paths** (`GuardiansService.linkFromInvite`):

1. Re-read the invite by id inside the transaction. Accepted by this same user → return (a
   double submit is a success). Accepted by someone else → 409 `INVITE_ALREADY_ACCEPTED_CODE`.
   Expired → 404.
2. `player.userId === userId` → 400 « Vous ne pouvez pas être votre propre parent ».
3. Already linked → skip to 5 (no duplicate, no count check).
4. Count links; at `MAX_GUARDIANS_PER_PLAYER` → 400 « Ce joueur a déjà 4 parents liés ». Create
   `PlayerGuardian`.
5. When `requiresConsent`: `consent !== true` → 400 `PARENTAL_CONSENT_REQUIRED_CODE`; else clear
   any running retention clock on this player's consent rows and create `ParentalConsent` with
   `source: GUARDIAN_IN_APP`, `attestedByUserId: userId`, `attestedByName: "<first> <last>"` (or
   the e-mail when the account has no name), and the identity snapshot, like
   `recordParentalConsent`.
6. Mark the invite `acceptedAt`, `acceptedByUserId`.

Then `AuditService.record({ type: 'GUARDIAN_INVITE_ACCEPTED', userId, metadata: { playerId } })`,
fire-and-forget as elsewhere.

The consent rule is checked in step 5 but also up front in `accept` (before `register`), so the
only transaction-time refusal a new account can hit is a race, the same accepted cost as
`InvitesService.accept`.

No `ClubMembership` is created: decision 3.

### Me: `me/personas`, `me/children`, `me/players`

`JwtAuthGuard` only; not club-scoped (same reasoning as `MyTeamsController`).

- `GET me/personas` → `MyPersonas`. Four reads in parallel: the caller's memberships count, their
  `TeamAdmin` count, their own `TeamPlayer` rows (with team), their guardian links (with player,
  club and the player's `TeamPlayer` rows with team). Then **one** `event.findMany` for the next
  14 days over the union of every persona's team ids, and **one** `eventRsvp.findMany` over the
  union of every persona's `TeamPlayer` ids for those events. `pendingCount` per persona = events
  on that persona's teams with no RSVP from that persona's `TeamPlayer` on that team. `self` is
  null when the caller has no membership, no `TeamAdmin` grant and no roster slot. Children are
  ordered by first name.
- `GET me/children/:playerId` → `MyChildProfile`. 404 unless the caller is a guardian of the
  player (not merely the player: that is the account page's own profile).
- `PATCH me/children/:playerId` `UpdateMyChildDto` → `MyChildProfile`. Same 404 rule. Only the
  four fields; the DTO whitelists them, so `nationalId`, licence fields and teams can't be sent.
- `DELETE me/children/:playerId` (204): deletes the caller's own link. 404 if none.
- `GET me/players/:playerId/guardians` → `MyPlayerGuardians`, only when `player.userId` is the
  caller (404 otherwise). No e-mails.
- `DELETE me/players/:playerId/guardians/:userId` (204): same ownership rule; 403 « Un joueur
  mineur ne peut pas retirer ses parents » while `isMinorBirthDate(player.birthDate)`; 404 when
  no such link.

## 5. Retention

Nothing to add: `PlayerGuardian` and `GuardianInvite` cascade with both the player and the
account, so the sweep's per-account transaction already removes them. The spec test that asserts
the sweep never calls `player.deleteMany` is untouched.

## 6. Tests (Jest)

- `club-roles.guard.spec.ts`: the guardian fallback runs only when the membership check fails
  and the route has the metadata; a club-level route matches any guarded player of the club; a
  team route needs the child rostered on that team; no row → 403; a route without the metadata
  never queries `playerGuardian`.
- `acting-as.spec.ts`: no `forPlayerId` → own slot; self id → own slot; guardian → child's slot;
  stranger → 403; child not on the team → null.
- `guardians.service.spec.ts`: invite cap (4 guardians, 4 pending); preview 404/409/consent flag;
  accept: expired, reused by another user (409), reused by the same user (success, no second
  link), self-guardian (400), fifth guardian (400), consent missing on a minor (400, nothing
  written), consent on a minor writes `GUARDIAN_IN_APP` consent, adult needs none, no membership
  created; register path refuses a missing consent before `register` is called; personas'
  pending counts and `self: null` for a guardian-only user; child profile hides e-mails and the
  caller; update refuses a non-guardian; adult removes a parent, minor can't.
- `clubs.service.spec.ts`: `guardianCount` from one `groupBy`.

## Files

- `server/prisma/schema.prisma`, `server/prisma/migrations/20260928000000_add_player_guardians/migration.sql`
- `packages/@basketeasy/types/guardians.ts`, `package.json` exports, `players.ts`, `parental-consent.ts`
- `server/src/auth/decorators/allow-guardians.decorator.ts`, `server/src/auth/guards/club-roles.guard.ts`
- `server/src/common/acting-as.ts`
- `server/src/guardians/*` (module, service, three controllers, DTOs, specs)
- `server/src/events/events.service.ts` (`findMyTeamPlayer` → `resolveActingTeamPlayer`)
- `server/src/clubs/clubs.service.ts` (`guardianCount`, consent `source`)
- The controllers listed in §3 (decorator only)
- `server/src/app.module.ts`
