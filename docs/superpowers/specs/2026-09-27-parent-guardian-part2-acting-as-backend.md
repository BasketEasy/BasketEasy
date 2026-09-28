# Parents (guardians): Part 2, backend (acting as, respondent, notification fan-out)

Status: spec (implements Part 2 of [`2026-09-27-parent-guardian-design.md`](./2026-09-27-parent-guardian-design.md))
Date: 2026-09-27

Builds on Part 1: the schema already carries `EventRsvp.respondedByUserId` and
`Notification.subjectFirstName`, `resolveActingTeamPlayer` exists and `@AllowGuardians()` already
opens the routes below to a guardian. No migration here.

## 1. `forPlayerId`

One optional query parameter, `forPlayerId` (`IsUUID`), shared through
`server/src/common/dto/acting-as-query.dto.ts` (`ActingAsQueryDto`) and mixed into the existing
DTOs (`ListEventsDto`, `GetDashboardDto`, `GetTeamStatsDto`). In `@basketeasy/types`:
`ActingAsParams { forPlayerId?: string }`, extended by `ListEventsParams`, `GetDashboardParams`,
`GetTeamStatsParams`.

Absent, every route behaves exactly as today. Present, it names the persona:

| Route                                       | Effect                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET .../events`, `GET .../events/:id`      | `myRsvpStatus`, `myConvocation`, `myTravelMode`, `myMatchStats`, `myRsvpRespondedBy`/`At` resolve for the persona's slot |
| `PATCH`/`DELETE .../events/:id/rsvp`        | reads and writes the persona's `EventRsvp`                                                                               |
| `PATCH .../events/:id/travel-mode`          | same                                                                                                                     |
| `GET .../events/:id/rsvps`, `/convocations` | `isMe` flags the persona's row instead of the caller's                                                                   |
| `GET .../stats`                             | `isMe` flags the persona's row                                                                                           |
| `GET /me/dashboard`                         | the persona's agenda (§3)                                                                                                |
| `GET /me/teams`                             | the persona's teams (§3)                                                                                                 |

Resolution always goes through Part 1's helpers, so a stranger's `forPlayerId` is a 403
« Vous ne pouvez pas répondre pour ce joueur », never silently « not rostered ». A read with a
`forPlayerId` of a guarded child who isn't on this team resolves like a non-rostered caller
(`myRsvpStatus: null`, writes 403 « … pas inscrit … »), the same as today.

`EventsService` changes one lookup: `resolveMyEventState(teamId, userId, eventIds,
forPlayerId?)` calls `resolveActingTeamPlayer` instead of `findMyTeamPlayer`; the three writes do
the same. The bound stays one shared lookup plus one `findMany` per concern. Votes, logistics and
scoresheet uploads keep `findMyTeamPlayer` (no `forPlayerId`, decision 9).

The rosters' `isMe` and the stats' `isMe` compare `playerId` to `forPlayerId` when it is given,
after one `canActForPlayer` check (403 otherwise).

## 2. Who answered

### Write

`setMyRsvp` writes `respondedByUserId: userId` (the caller, never the persona) on both `create`
and `update`, next to `respondedAt`. `setMyTravelMode` doesn't touch either: the respondent line
is about the presence answer, and a parent switching « RDV » to « Direct » isn't a new answer.
`clearMyRsvp` deletes the row as today.

### Contract

```ts
export interface EventRsvpRespondent {
  userId: string;
  firstName: string | null;
  lastInitial: string | null; // "M", never the full last name (decision 14)
  isMe: boolean; // the respondent is the caller (not the persona)
}
```

- `TeamEvent.myRsvpRespondedBy: EventRsvpRespondent | null` and `myRsvpRespondedAt: string | null`.
  Null when there is no answer, or when the answer predates the column or its author's account
  was erased (`respondedByUserId: null`).
- `MyAgendaEvent` gains the same two fields.
- `EventRsvpRosterEntry.respondedBy: EventRsvpRespondent | null` and `respondedByGuardian:
boolean` (a respondent is known and isn't the player's own account), which is the coach's
  « parent » tag.

### Read

The `eventRsvp.findMany` calls that already exist (`resolveMyEventState`, the dashboard's RSVP
read, `listEventRsvps`' include) add `respondedBy: { select: { id, firstName, lastName } }`. No
new query. `buildOwnAnswer` knows the respondent is the caller and reads their name with one
`user.findUnique`, in parallel with its existing `isConvoked`.

## 3. Dashboard and « my teams » for a persona

`DashboardService.getDashboard(userId, from?, to?, forPlayerId?)`: with a `forPlayerId`, after
`canActForPlayer` (403 otherwise), the roster rows are the child's `TeamPlayer` rows instead of
the caller's; admin grants and admin clubs are empty, so `totalPlayers: 0` and `actionItems: []`.
Each agenda row's `clubId` is the child's own `Player.clubId` (always one of the team's linked
clubs), which is the club `@AllowGuardians()` accepts. Without `forPlayerId`, nothing changes; a
guardian-only user's own agenda is empty, and the frontend (Part 4) opens on the child.

`TeamsService.listMyTeams(userId, forPlayerId?)`: with a `forPlayerId`, the child's roster teams,
`isTeamAdmin: false`, `rosterRole` from the child's slot, `clubId` the child's club.

## 4. Notification fan-out

### Audience

`server/src/common/player-audience.ts`:

```ts
export interface PlayerAudienceEntry {
  teamPlayerId: string;
  playerId: string;
  firstName: string;
  clubId: string; // Player.clubId
  userId: string | null; // the player's own account
  guardianUserIds: string[];
}
export async function resolvePlayerAudience(prisma, teamPlayerIds): Promise<PlayerAudienceEntry[]>;
```

One `teamPlayer.findMany` selecting the player and its guardians' `userId`.

```ts
export interface RecipientSubjects {
  userId: string;
  self: boolean;
  children: { playerId: string; firstName: string; clubId: string }[]; // ordered by first name
}
export function groupByRecipient(entries: PlayerAudienceEntry[]): RecipientSubjects[];
```

Pure; merges « self » and every child a user is concerned by into one row per user, so a playing
parent convoked with their child, or a parent of two convoked children, gets one notification.

### Copy

`server/src/common/notification-subject.ts` (pure, tested):

- `subjectLabel(r)`: null when `self`, else the children's first names joined « Léo », « Léo et
  Emma », « Léo, Emma et Noé ». Written to `Notification.subjectFirstName` (the « pour qui » tag).
- `convocationSentence(r)`: « Vous êtes convoqué·e », « Léo est convoqué·e », « Léo et vous êtes
  convoqué·es », « Léo et Emma sont convoqué·es ».
- `forWhomPrefix(r)`: « » when self-only, « Pour Léo : » otherwise, « Pour Léo et vous : » when
  both. Used by copy that isn't phrased around the reader (cancellation, RDV).

`convocationNotification(teamName, event, meeting, subject)` uses `convocationSentence` in the
title and body; `cancellationNotification` and the two meeting functions take the subject and
prefix the body with `forWhomPrefix`. Self-only output is byte-identical to today, so existing
copy tests keep passing unchanged.

`NotifyInput` gains `subjectFirstName?: string | null`, written by `notify`'s `createMany`;
`AppNotification` gains `subjectFirstName: string | null`.

### Deep links

A recipient with `self: true` keeps today's link. Otherwise the link goes through the first
child's own club (`/clubs/<child.clubId>/…`, which `@AllowGuardians()` accepts on a CTC team
too) and ends with `?pour=<child.playerId>`, so opening it switches the persona.

### Emission points

- `EventsService.notifyNewlyConvoked`: `resolvePlayerAudience(newlyConvokedIds)` →
  `groupByRecipient` → one `notify` input per recipient.
- `EventsService.deleteEvent`: the transaction reads convoked `teamPlayerId`s (instead of
  `userId`s) before the delete; `resolvePlayerAudience` runs after, on ids whose `TeamPlayer`
  rows still exist (the delete removes events, not roster slots).
- `MeetingPointsService.announceMeetingChanges`: the GOING + `MEETING_POINT` RSVP rows give
  `(eventId, teamPlayerId)`; audience and grouping run per event. The club chosen for a
  self-recipient stays « my own club among the team's linked clubs »; a guardian-only
  recipient's link uses the child's club.
- Not `ScoresheetOcrProcessor` (decision 9).

The « only newly convoked » diff, the serializable read before the delete and the « one summary
per series » rule are untouched: they decide which players are concerned, the fan-out comes after.

## 5. Tests (Jest)

- `events.service.spec.ts`: a guardian's `setMyRsvp` with `forPlayerId` upserts the child's
  `TeamPlayer` row with `respondedByUserId` = the guardian; a stranger's `forPlayerId` → 403 and
  nothing written; `listEventRsvps` returns `respondedBy`/`respondedByGuardian`; a convocation of
  a child and their playing parent sends one merged notification with no `subjectFirstName`; a
  child-only recipient gets `subjectFirstName`, `?pour=` and the child's club in the link.
- `notification-subject.spec.ts`, `player-audience.spec.ts`: every phrasing and the grouping.
- `dashboard.service.spec.ts`: `forPlayerId` → the child's agenda, child's club, no action items;
  stranger → 403.
- `meeting-points.service.spec.ts`: a guardian of a GOING/MEETING_POINT child is notified with
  the prefix; the child's own account too, each once.
- `event-notification-copy.spec.ts`, `meeting-notification-copy.spec.ts`: existing assertions
  unchanged plus the child and merged subjects.

## Files

- `packages/@basketeasy/types/{events,my-dashboard,team-stats,my-teams,notifications,guardians}.ts`
- `server/src/common/{acting-as,player-audience,notification-subject}.ts`, `common/dto/acting-as-query.dto.ts`
- `server/src/events/{events.service,events.controller,event-notification-copy}.ts`, DTOs
- `server/src/dashboard/*`, `server/src/teams/{teams.service,my-teams.controller}.ts`, `server/src/team-stats/*`
- `server/src/meeting-points/{meeting-points.service,meeting-notification-copy}.ts`
- `server/src/notifications/notifications.service.ts`
