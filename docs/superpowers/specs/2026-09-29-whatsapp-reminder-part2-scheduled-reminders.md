# WhatsApp event reminder: Part 2, scheduled reminders

Status: spec (implements Part 2 of [`2026-09-29-whatsapp-reminder-design.md`](./2026-09-29-whatsapp-reminder-design.md), on top of [Part 1](./2026-09-29-whatsapp-reminder-part1-manual-share.md))
Date: 2026-09-29
Design: [Claude Design canvas](https://claude.ai/artifact/NAv8Bx7keKLph7XUBEsXHK), row « Partie 2 ».

The app now tells the team's managers when it is time to share: X before each event (team default,
per-event override), once more an hour later if nobody has, and the share status becomes a real state
machine. `pr-scope.yml` flags this PR (`server/prisma`); the description lists the behaviour changes.

## 1. Corrections to the design doc that shape this part

- **Offset cap: 14 days** (`GUEST_WINDOW_DAYS`). The guest page lists only the next 14 days, so a reminder
  sent 20 days out would link to a page that doesn't show the event yet. `WA_OFFSET_MINUTES_MIN = 60`,
  `WA_OFFSET_MINUTES_MAX = GUEST_WINDOW_DAYS * 1440`, validated in both DTOs and both forms.
- **FFBB import is a second write path.** `FfbbImportService.upsertMatch` creates and updates `Event` rows
  without going through `EventsService`, so it calls `syncEvents` too (§4). Otherwise every imported
  match, the bulk of a season, would never be reminded.
- **Job ids use `-`, not `:`** (`wa-<shareId>-send`, `-nudge`, `-expire`): `:` is BullMQ's Redis key
  separator and recent versions reject it in a custom job id. Keyed on the share, not the event, so
  Part 3's UPDATE and CANCELLATION jobs never collide with the reminder's.
- **The notification deep link names the share, not its type**: `?partage=<shareId>`. The share id is what
  withdrawal matches on, and the type alone can't tell two shares apart once Part 3 lands.

## 2. Schema

Migration `20260930020000_whatsapp_reminder_schedule`:

```prisma
enum EventShareState  { SCHEDULED PENDING SENT EXPIRED VOID }   // adds all but SENT
enum NotificationType { … WHATSAPP_SHARE_REQUESTED }

model Team  { waReminderEnabled Boolean @default(false)
              waDefaultOffsetMinutes Int @default(4320) }
model Event { waReminderOverride Boolean?    // null inherits the team
              waOffsetMinutes    Int? }      // null inherits the team
model EventShare { firstNotifiedAt DateTime?  nudgedAt DateTime?  dueAt DateTime? }
```

`dueAt` is the send time the current `SCHEDULED` job was queued for; `syncEvent` compares it to decide
whether the job must move. No `AuditEventType` change.

## 3. Shared types

`whatsapp-reminder.ts` gains `DEFAULT_WA_OFFSET_MINUTES = 4320`, the min/max above, `EventShareStatus.dueAt`,
`TeamWhatsAppSettings.{ reminderEnabled, defaultOffsetMinutes, hasReachableManager }` and
`EventWhatsAppSettings { override: boolean | null; offsetMinutes: number | null; effective: { enabled; offsetMinutes } }`.
`events.ts`: `TeamEvent.whatsAppShare: EventShareStatus | null` (the REMINDER row, null for non-managers);
`CreateEventRequest` / `UpdateEventRequest` gain `waReminderOverride?: boolean | null`, `waOffsetMinutes?: number | null`.
`notifications.ts` gains the new type.

## 4. Backend

`QueueModule` registers `WHATSAPP_REMINDER_QUEUE = 'whatsapp-reminder'`. `EventsModule` and `FfbbModule`
import `WhatsAppRemindersModule` (the direction meeting-points already set).

### `syncEvent(eventId)` / `syncEvents(eventIds)`: the only reconcile entry point

Reads event, team settings and the REMINDER row, computes the desired state, and makes the row and the
queue match it. Idempotent: calling it twice changes nothing.

| Current row        | Effective reminder | `dueAt = startsAt − offset` | Result                                                                                 |
| ------------------ | ------------------ | --------------------------- | -------------------------------------------------------------------------------------- |
| none / `VOID`      | off                | any                         | nothing                                                                                |
| none / `VOID`      | on                 | future                      | `SCHEDULED`, queue `send` at `dueAt`, `expire` at `startsAt`                           |
| none / `VOID`      | on                 | past, event future          | `PENDING`, notify now (rule 9), `nudge` if `now + 1h < startsAt`, `expire`             |
| any                | on                 | event past                  | nothing (a past event is never scheduled)                                              |
| `SCHEDULED`        | on                 | changed                     | remove + re-add `send` (and `expire` if `startsAt` moved), update `dueAt`              |
| `SCHEDULED`        | off                | any                         | `VOID`, remove jobs                                                                    |
| `PENDING`          | off                | any                         | `VOID`, remove jobs, withdraw notifications                                            |
| `PENDING`          | on                 | moved to the future         | back to `SCHEDULED`, remove `nudge`, withdraw notifications, re-queue (rule 8 inverse) |
| `PENDING`          | on                 | still past                  | keep; move `expire` if `startsAt` moved                                                |
| `SENT` / `EXPIRED` | any                | any                         | nothing (a changed event after a share is Part 3)                                      |

Rule 8 (offset changed after the notification) is the `PENDING`/still-past row: no new push. The
row write and job moves are not one transaction (Redis is not Postgres); the processor's re-read makes
a job left behind by a crash harmless, so the order is: write the row, then move jobs.

Callers: `createEvent` (every occurrence of a series, one `syncEvents`), `updateEvent` (every id in
scope), `updateEventTimeOfDay`, `FfbbImportService` (created and updated ids), and the team settings
`PATCH` (all the team's future events, one `syncEvents`, which batches its reads). Each call runs
after the caller's own commit and is wrapped so a Redis failure is logged, never a 500 on the event
write: the reminder is best-effort like every other notification.

`deleteEvent` needs no call: the row cascades and a leftover job finds nothing.

### Settings

- `resolveSettings(event, team)`: `enabled = event.waReminderOverride ?? team.waReminderEnabled`,
  `offsetMinutes = event.waOffsetMinutes ?? team.waDefaultOffsetMinutes`.
- **Rule 7:** turning the team reminder on, or an event override to `true`, calls `GuestLinksService.enable`
  (idempotent, already audited) in the same request, before the sync.
- **Rule 6:** `hasReachableManager` on the settings `GET` is false when no manager has e-mail
  notifications enabled or a push subscription; the card warns. Nothing else changes.

### `WhatsAppReminderProcessor`

Thin, like `MeetingTravelProcessor`; the logic is in the service so tests don't need a queue.

- `send`: re-read. Proceed only if the row is `SCHEDULED`, the event exists and is in the future, and the
  effective reminder is still on; else drop. Then `PENDING`, `firstNotifiedAt = now`, notify, queue
  `nudge` at `+1h` only if that is before `startsAt`.
- `nudge`: only if still `PENDING` and `nudgedAt` is null: notify again, set `nudgedAt`.
- `expire`: `SCHEDULED`/`PENDING` → `EXPIRED`, withdraw notifications.
- Conditional `updateMany` on the expected state for every transition, so a racing `confirmShare` wins.

### Recipients and notification

- **Managers:** `TeamAdmin`s of the team plus `ClubMembership.role = ADMIN` of every club linked through
  `ClubTeam`, deduplicated by user; one query. Per recipient, the deep link's club is one they are an
  `ADMIN` of, else the one `TeamsService.toMyTeamSummary` would pick.
- Copy in `whatsapp-notification-copy.ts` (pure, Europe/Paris via `common/event-copy.ts`):
  title « Rappel à partager : Match contre X, sam. 4 oct. », body « Partagez le message dans le groupe
  WhatsApp de l'équipe. »; the nudge says « Toujours pas partagé ».
- Deep link `/clubs/<clubId>/teams/<teamId>/events/<eventId>?partage=<shareId>`.
- **Withdrawal** on `SENT`, `VOID`, `EXPIRED` and back-to-`SCHEDULED`: `notification.updateMany({ where:
{ type: 'WHATSAPP_SHARE_REQUESTED', readAt: null, deepLink: { endsWith: 'partage=' + shareId } }, data: { readAt: now } })`.
  `confirmShare` now calls it, so the other managers' bells clear once one of them shares.

### `TeamEvent.whatsAppShare`

Resolved in `buildTeamEvents` with one `eventShare.findMany({ eventId: { in }, type: REMINDER })` per
batch, only when the caller passes `TeamManagerGuard`'s rule for the team and is not acting for a
child; `null` otherwise. `GET` stays read-only.

## 5. Frontend

- **`WhatsAppSettingsCard`** gains, above the template: « Rappel automatique » `Checkbox`, and « Me
  rappeler » as a number + unit pair (`heures` / `jours`) stored as minutes, validated against the
  min/max; the `hasReachableManager` warning as an `Alert`. Saving an enable that turned the guest
  link on says so in the toast.
- **Event create and edit** (`EventCreateForm`, `EventEditModal`): a « Rappel WhatsApp » `SelectField`
  (`Comme l'équipe (activé, 3 jours avant)` / `Activé` / `Désactivé`) and, when not off, the same
  offset pair with « par défaut » placeholder. Both go through the existing `useForm` and zod schema;
  empty offset sends `null`. For a series edit they follow the chosen scope like every other field.
- **`WhatsAppShareCard`** reads `event.whatsAppShare` for its first paint and the `GET` for the message,
  and shows the four states: `SCHEDULED` « Rappel prévu le 01/10 à 18:00 », `PENDING` « À partager »
  (brand `Badge`), `SENT` as Part 1, `EXPIRED` « Non partagé ». `VOID`/none with the reminder off
  reads « Rappel désactivé pour cet événement ». The share button is available in every state.
- **Deep link:** `EventDetailPage` reads `?partage=`, scrolls the card into view through
  `useEventSectionAnchor` and focuses « Partager sur WhatsApp » (`navigator.share` needs a user gesture,
  so it never auto-fires), then drops the param with `replace`.
- `EventRow` in the agenda gains a small `PENDING` marker for managers so a pending share is visible
  without opening the event.

## 6. Tests

- Jest: every row of the §4 table (with `Queue` mocked, asserting row state and job adds/removes);
  `resolveSettings` matrix; processor guards (deleted event, toggle off, already sent, event past,
  nudge skipped when under 1h to kickoff, nudge sent once); recipients dedupe across CTC clubs and
  deep-link club choice; withdrawal on each exit state; `confirmShare` withdraws others' rows;
  offset bounds; enable auto-enabling the guest link; FFBB import calling `syncEvents`; a Redis failure
  not failing `createEvent`.
- `test/db/whatsapp-share.db-spec.ts` adds: `send` and `confirmShare` racing leaves `SENT`; the
  `endsWith` withdrawal matches only its own share.
- Vitest: settings toggle + offset validation, event form inheritance labels, card's four states, the
  `?partage=` focus, the agenda marker.
- Screenshots: settings card with reminder on, event form field, card in each state, the notification
  in the bell.

## 7. Done when

With the reminder on, a manager gets one notification X before each event (immediately for an event
created inside the window), one nudge an hour later if nobody shared, both bells clear when anyone
shares, and turning the reminder off or moving the event behaves as the table says.
