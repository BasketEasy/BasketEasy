# Guest RSVP link: Part 1, backend

Status: spec (implements Part 1 of [`2026-09-29-guest-rsvp-link-design.md`](./2026-09-29-guest-rsvp-link-design.md))
Date: 2026-09-29

Everything the guest page and the manager card need from the server, and nothing of either UI.
`pr-scope.yml` flags this PR (`server/prisma`); the description lists the behaviour changes below.

## 1. Schema

One hand-written migration, `20260929040000_add_guest_rsvp_link`: `TeamGuestLink`, `EventRsvpSource`,
`EventRsvp.source`, `EventRsvpChange`, and the enum values `AuditEventType.GUEST_LINK_ENABLED` /
`_REGENERATED` / `_DISABLED` and `NotificationType.GUEST_INVITE_REQUESTED`. Models exactly as in the
design doc. Back-relations: `Team.guestLink`, `User.guestLinksCreated`, `User.rsvpChanges`,
`Event.rsvpChanges`, `TeamPlayer.rsvpChanges`.

## 2. Shared types: `@basketeasy/types/guest-links`

New file plus its `exports` entry: `TeamGuestLinkInfo`, `GuestRosterMember`, `GuestAttendanceEntry`,
`GuestEvent`, `GuestTeamPage`, `GuestRsvpRequest`, `EventRsvpChangeEntry`, `GUEST_RSVP_CLOSED_CODE`,
`GUEST_WINDOW_DAYS` (14). `events.ts` gains `EventRsvpRosterEntry.viaLink`.

## 3. Module `server/src/guest-links`

- `GuestLinksService` (manager side): `get`, `enable` (idempotent), `regenerate`, `disable`,
  `history`. Each re-verifies the team belongs to `:clubId` (`ClubTeam`), like `TeamsService`. Token =
  `randomBytes(32).toString('base64url')`. Enable/regenerate/disable write the `GUEST_LINK_*` audit row
  through `AuditService.record` (actor `userId`, `metadata.teamId`). `enable` on an existing link
  returns it and writes nothing. The URL is `FRONTEND_URL + /r/<token>` (same resolution as
  `MailService.absoluteUrl`).
- `GuestLinkGuard`: resolves `:token` with one `teamGuestLink.findUnique`, puts `{ teamId }` on the
  request, plain `NotFoundException` otherwise.
- `GuestRateLimiter`: in memory, sliding window. 30 writes / 10 min per `token + ip`, 300 / h per token.
  `429` on breach. Only writes (`PUT`, `DELETE`, `invite-request`) are counted.
- `GuestRsvpService` (public side): `getPage`, `setRsvp`, `clearRsvp`, `requestInvite`.
- Controllers: `TeamGuestLinkController` (`JwtAuthGuard` + `TeamManagerGuard`) and
  `GuestRsvpController` (`public/guest/:token`, `GuestLinkGuard`, no JWT; `Referrer-Policy: no-referrer`
  and `X-Robots-Tag: noindex` on every response).

## 4. Rules that need a decision the design doc left open

- **Window** is `now < startsAt <= now + 14 d`, evaluated on the server clock per request.
- **Reads** load events in the window, the roster, that window's `EventRsvp` and `EventConvocation`
  rows, and plans through `MeetingPointsService.resolvePlans`: 5 queries however many events.
- **`GuestEvent.attendance`** has one entry per roster member. `travelMode` is non-null only for a
  `GOING` answer on a `MATCH`, same rule as `EventRsvpRosterEntry`.
- **`setRsvp` travel mode:** the body's `travelMode` is accepted only with `GOING` on a `MATCH`
  (`400` otherwise). Omitted on `GOING`, an existing choice is kept and a first answer starts at
  `MEETING_POINT`, exactly like the app's `setMyRsvp`. Leaving `GOING` resets it.
- **`clearRsvp`** with no existing row still writes no history row and answers with the event.
- **History for app writes:** `EventsService.setMyRsvp`, `clearMyRsvp` and `setMyTravelMode` add an
  `EventRsvpChange` (`source: APP`, `respondedByUserId: caller`) in the same `$transaction` as the
  write. A clear of a non-existent answer writes nothing.
- **History endpoint** returns `{ status, travelMode, source, respondedBy: EventRsvpRespondent | null,
createdAt }` newest first, capped at 50, for a `teamPlayerId` on the team and an event of the team.
- **`invite-request`** is a no-op branch-for-branch as in the design doc; "live `PlayerInvite`" means
  unaccepted and unexpired. The 7-day de-duplication reads existing `GUEST_INVITE_REQUESTED`
  notifications for the same recipients whose `deepLink` carries the player id (no new table).
  Recipients: `TeamAdmin`s of the team plus `ADMIN`s of the owner club, deduplicated. Deep link:
  `/clubs/<ownerClubId>/teams/<teamId>?tab=roster&invite=<playerId>`.
- **`viaLink`** on `EventRsvpRosterEntry` is `source === GUEST_LINK`.

## 5. Tests

Unit specs beside each service/guard/limiter, covering the design doc's list, plus
`test/db/guest-rsvp.db-spec.ts`: upsert + change insert in one transaction, cascades from `Event` and
`TeamPlayer`, and the `token` unique constraint.
