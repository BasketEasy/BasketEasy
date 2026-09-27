# Match meeting point: Part 2, backend (player travel choice and notifications)

Status: spec (implements Part 2 of [`2026-09-27-match-meeting-point-design.md`](./2026-09-27-match-meeting-point-design.md))
Date: 2026-09-27

Builds on Part 1 (the schema already carries `EventRsvp.travelMode` and
`Event.meetingAnnouncedKey`; no migration needed here beyond one enum value).

## 1. Player travel choice

### Contract

- `@basketeasy/types/events` gains:
  - `TeamEvent.myTravelMode: EventTravelMode | null`, non-null only for a MATCH the caller is
    `GOING` to. A GOING player who never chose reads `'MEETING_POINT'`: the column default _is_
    the "counts as RDV" rule, so there is no fourth state to render.
  - `EventRsvpRosterEntry.travelMode: EventTravelMode | null`, same rule per roster row (null
    unless that row is GOING on a MATCH).
  - `SetEventTravelModeRequest { travelMode: EventTravelMode }`.
- `PATCH …/events/:eventId/travel-mode` (`ClubRoles('ADMIN','MEMBER')`, narrowed in the service):
  - 404 if the event isn't on the team (`assertEventInTeam`).
  - 400 « Le mode de déplacement ne concerne que les matchs » on a TRAINING.
  - 403 if the caller has no `TeamPlayer` on the team (same message as RSVP).
  - 400 « Indiquez d'abord que vous êtes présent·e » unless the caller's RSVP is `GOING`.
  - Returns the updated `TeamEvent`, same round-trip-avoiding shape as `setMyRsvp`.
- Self-service only. The `TeamPlayer` is resolved from `player.userId`, never from the body.

### RSVP interaction

- `setMyRsvp` with a status other than `GOING` also writes `travelMode: MEETING_POINT`, so a
  player who goes GOING → MAYBE → GOING starts from the default instead of a stale « Direct ».
- `setMyRsvp(GOING)` over an existing GOING leaves `travelMode` untouched. Re-tapping « Présent »
  must not undo a « Direct ».
- `clearMyRsvp` deletes the row, which resets it naturally.

### Read path

`resolveMyEventState` already reads the caller's `EventRsvp` rows; it now also returns
`travelModes: Map<eventId, EventTravelMode>` from the same rows (no extra query). `toTeamEvent`
derives `myTravelMode` from `(type, myRsvpStatus, travelMode)`. `listEventRsvps` adds
`travelMode` from the row it already includes.

## 2. Notifications

### New type

`NotificationType.EVENT_MEETING_FIXED` (the hour becomes known) and `EVENT_MEETING_CHANGED` (a
known RDV moves), in the Prisma enum and the shared type. Two values rather than one, so a later
preferences screen can filter them apart. The frontend picks no icon by type today
(`NotificationList` renders every row the same way), so no app change is needed.

Hand-written migration `20260927010000_add_meeting_changed_notification` adds both values.

Copy lives in `meeting-points/meeting-notification-copy.ts` (`meetingFixedNotification`,
`meetingChangedNotification`, `describeMeeting`). `describeEvent` / `formatEventMoment` /
`formatTime` move to `common/event-copy.ts`, shared with the events copy, so `meeting-points/`
never imports from `events/`.

### Convocation copy

`convocationNotification(teamName, event, meeting?)`. When the event's plan has a known
`meetsAt` and a meeting point, the body ends with
« RDV à 19:15 — Parking salle Coubertin. », formatted in Europe/Paris like the rest of the copy.
`EventsService.notifyNewlyConvoked` resolves the plan through
`MeetingPointsService.resolvePlans(teamId, [event])` (one query) before composing.

### Change announcements: `MeetingPointsService.announceMeetingChanges(eventIds)`

```
events ← findMany MATCH in eventIds with startsAt ∈ (now, now + 7 days], with EventMeeting
         (one query; far-off matches aren't read at all)
contexts ← loadTeamContexts(distinct teamIds) (one query for every team)
in parallel, for each event:
  plan ← resolveMeetingPlan(event, eventMeeting, team, club)
  if !plan?.meetingPoint or !plan.meetsAt: skip           // unknown never notifies
  key ← name | address | meetsAt
  if key === eventMeeting.meetingAnnouncedKey: skip
  conditional updateMany meetingAnnouncedKey = key where it still equals the key read
  if nothing was updated: skip                           // a racing write announced it
recipients ← EventRsvp where eventId ∈ changed, status GOING, travelMode MEETING_POINT,
             teamPlayer.player.userId not null (one query)
notify one row per (user, event):
  first known → EVENT_MEETING_FIXED, « RDV fixé — <team> »
  otherwise   → EVENT_MEETING_CHANGED, « RDV modifié — <team> », body « Nouveau rendez-vous pour
                le match contre X du samedi 12 septembre à 20:30 : 19:15 — Parking salle
                Coubertin. »
  deepLink /clubs/<club>/teams/<team>/events/<id>
```

A match further out than the window keeps its old key. The first announce that runs once it is
inside the window compares against what players last heard, so nothing is lost; it just isn't
pushed while it can still change several times.

The deep-link club is the recipient's own membership among the team's linked clubs, falling back
to the owner club: the same rule as `ScoresheetOcrProcessor.resolveNavigationClubId`, so a CTC
reader never lands on a 403. That lookup is **one** `clubMembership.findMany` for every recipient,
not one per recipient. Notification writes go through `NotificationsService.notify` (in-app row
synchronous, e-mail/push best-effort), so `MeetingPointsModule` imports `NotificationsModule`.

A failure inside `announceMeetingChanges` is logged and swallowed. A missed "RDV changed"
notification must never fail the manager's save or the recompute job.

### Where it is called

Every path that can move a resolved RDV to a new _known_ value:

| Caller                                                          | Events                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MeetingPointsService.recomputeTravel` (job and « Recalculer ») | the one event                                                                                                                                                                                                                                                          |
| `MeetingPointsService.setEventMeeting`                          | the one event                                                                                                                                                                                                                                                          |
| `updateClubSettings` / `updateTeamSettings`                     | a moved address queues recomputes, which announce as they land; a buffer or name change moves no route, so an `announce` job on the `meeting-travel` queue sweeps the scope's matches inside the window. Either way the PATCH returns once the settings row is written |
| `EventsService.updateEvent` / `updateEventTimeOfDay`            | the updated rows (kick-off moves the RDV)                                                                                                                                                                                                                              |
| `FfbbImportService.upsertMatch`                                 | updated rows, collected and announced once per import                                                                                                                                                                                                                  |

`FfbbImportService`'s update and `EventsService.updateEventTimeOfDay` also clear
`EventMeeting.meetsAtOverride` when they move a kick-off, matching `updateEvent` (Part 1). Both were missed in
Part 1 and are picked up here.

## Tests

- `events.service.spec.ts`:
  - `setMyTravelMode` rules (TRAINING 400, not rostered 403, not GOING 400, success).
  - `setMyRsvp` resets `travelMode` on NOT_GOING/MAYBE and leaves it on GOING.
  - `myTravelMode` derivation (null on TRAINING and when not GOING, the default read as
    MEETING_POINT).
  - The roster `travelMode`.
  - Convocation copy with and without a known plan.
  - `announceMeetingChanges` called from `updateEvent`.
- `meeting-points.service.spec.ts` (`announceMeetingChanges`):
  - The first known value notifies with « RDV fixé » (revised with the Part 4 design); unknown never notifies.
  - An unchanged key is a no-op.
  - Only matches inside the 7-day window are read; teams load in one query.
  - Recipients are GOING + MEETING_POINT only, and users with no linked account are dropped.
  - The deep-link club prefers the recipient's membership.
  - An internal failure is swallowed.
- `event-notification-copy.spec.ts`: RDV sentence. `meeting-notification-copy.spec.ts`: fixed and
  changed copy. `common/event-copy.spec.ts`: Paris formatting.
- `ffbb-import.service.spec.ts`: a kick-off change clears the override and is announced.
