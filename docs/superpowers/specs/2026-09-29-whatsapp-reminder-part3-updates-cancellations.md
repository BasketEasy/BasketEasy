# WhatsApp event reminder: Part 3, updates and cancellations

Status: spec (implements Part 3 of [`2026-09-29-whatsapp-reminder-design.md`](./2026-09-29-whatsapp-reminder-design.md), on top of [Part 2](./2026-09-29-whatsapp-reminder-part2-scheduled-reminders.md))
Date: 2026-09-29
Design: [Claude Design canvas](https://claude.ai/artifact/NAv8Bx7keKLph7XUBEsXHK), row « Partie 3 ».

Once the group has been told about an event, a change to it or its cancellation must reach the group
too. This part asks managers to share an update or a cancellation, with its own template, whenever the
group was already sent something. `pr-scope.yml` flags this PR (`server/prisma`).

## 1. Corrections to the design doc that shape this part

- **Cancelling an event deletes it.** There is no cancelled state on `Event`: `deleteEvent` removes the
  row and `EVENT_CANCELLED` points at the team page because the event page would 404. A CANCELLATION
  share that cascades with its `Event` would vanish in the same transaction that should create it. So
  `EventShare.eventId` becomes **nullable with `onDelete: SetNull`**, the row gains `teamId` (cascade with
  `Team`) and an `eventSnapshot` of the template variables taken before the delete. This is the
  `Notification` rule (denormalised so it reads after the source is gone) applied to shares.
- **A prompt is only raised when something was sent.** An UPDATE or CANCELLATION prompt exists only if a
  REMINDER or UPDATE for that event is `SENT`. If the reminder is still `SCHEDULED` or `PENDING`, it will
  render the new details when shared (Part 2 already reschedules it); telling the group about a change
  to something they never heard of is noise.
- **« Changed » means the message would read differently**, not a list of fields (the design doc's
  rule 2 listed `startsAt`, `location`, `type`/`opponentName`). Since the message now carries the RDV,
  a moved meeting time or place matters to the group as much as a moved tip-off, and those change
  outside `EventsService` (a recomputed drive time, a club or team default moved). Comparing
  `contentKey(currentVars)` with the `sentContentKey` recorded at confirm (Part 1) covers every source at
  once and ignores what the message doesn't show (notes, venue, logistics) for free.
- **Series cost less than the design doc feared.** Reminders fire at most 14 days ahead, so a series-scope
  edit or delete typically touches one or two occurrences that were actually shared. One share row per
  such occurrence (they are separate messages about separate dates), **one notification per manager**
  for the whole call, the `deleteEvent` series rule.

## 2. Schema

Migration `20260930030000_whatsapp_update_cancellation`:

```prisma
enum EventShareType { REMINDER UPDATE CANCELLATION }

model EventShare {
  eventId       String?                 // was required; SetNull on Event delete
  teamId        String                  // backfilled from Event.teamId, then NOT NULL
  eventSnapshot Json?                   // WhatsAppTemplateVars minus link, CANCELLATION only
  sentVars      Json?                   // the variables of the message confirmed, for the « what moved » line
  expiresAt     DateTime?               // CANCELLATION: the deleted event's startsAt
  event Event? @relation(fields: [eventId], references: [id], onDelete: SetNull)
  team  Team   @relation(fields: [teamId], references: [id], onDelete: Cascade)
  @@unique([eventId, type])             // unchanged; Postgres treats NULLs as distinct
  @@index([teamId, state])
}

model Team { waUpdateTemplate String?  waCancellationTemplate String? }
```

The migration adds `teamId` nullable, backfills it with an `UPDATE … FROM "Event"`, then sets `NOT NULL`,
and swaps the FK's `ON DELETE`. Written by hand in Prisma's generated style.

## 3. Shared types

Two more defaults, same casual tone and line-drop rule as the reminder:

```text
DEFAULT_UPDATE_TEMPLATE
⚠️ Changement : {event_name}, {event_date} !
Nouveau RDV {meeting_time} – {meeting_place}.
On commence à {event_time} ({location}).
Redis-nous si tu viens 👉 {link}

DEFAULT_CANCELLATION_TEMPLATE
❌ {event_name} du {event_date} : c'est annulé. On te tient au courant !
```

Cancellation is the one template where `{link}` is **optional** (there is nothing left to answer), so
`MISSING_LINK` and `LINK_ON_DROPPABLE_LINE` don't apply to it; `validateTemplate(template, type)` takes
the type for that rule. `TeamWhatsAppSettings` gains
both templates. `EventWhatsAppShare.shares` can now carry three entries. New
`TeamPendingCancellation { shareId; eventName; eventDate; message; status: EventShareStatus }` and
`GET` of the team's pending cancellations.

## 4. Backend

### Which changes count (rule 2)

The reference is the newest `SENT` row among the event's REMINDER and UPDATE: its `sentContentKey` is
what the group last read. The event « has changed » when `contentKey(buildTemplateVars(…))` differs. A
null `sentContentKey` (a row written by hand, say) never prompts.

### Where changes come from

- `EventsService.updateEvent` and `updateEventTimeOfDay` pass the ids they wrote, `FfbbImportService` its
  `updated` ids, to `WhatsAppReminderService.onEventsChanged` after the commit (after the Part 2
  `syncEvents`, in that order: sync, then prompts).
- **The RDV changes inside `meeting-points/`**, which must not import this module (Events and
  WhatsApp depend on it, never the reverse). So `MeetingPointsModule` gains a tiny `MeetingChangeFeed`
  provider (`subscribe(listener)`, `publish(eventIds)`), in-process and synchronous-fire-and-forget.
  `MeetingPointsService` publishes the ids at the two entry points that already exist for announcing
  RDV changes, `announceMeetingChanges(eventIds)` and the `announce` job, **before** their 7-day
  notification filter (the WhatsApp window is 14 days). `WhatsAppReminderService.onModuleInit`
  subscribes and calls `onEventsChanged(ids, null)`. A per-instance feed is enough: the job that
  publishes runs on the instance that changed the RDV.

`onEventsChanged(eventIds, actorUserId | null)`, one batched read of events, plans, templates and shares:

1. Keep events whose newest `SENT` REMINDER/UPDATE has a `sentContentKey` that no longer matches.
2. An event whose content matches again (an edit reverted) and has a `PENDING` UPDATE: `VOID` it and
   withdraw its notifications, so the bell doesn't ask to announce a change that no longer exists.
3. Upsert the kept events' UPDATE row to `PENDING` (clearing `sentAt`/`sentBy`/`nudgedAt`: a second edit after a
   shared update is a new message to send), `firstNotifiedAt = now`, queue `nudge` and `expire` as in Part 2.
   An UPDATE already `PENDING` stays as it is and notifies nobody again: its message renders fresh.
4. One `WHATSAPP_SHARE_REQUESTED` notification per manager: « Changement à partager : Match contre X » or,
   for several, « 3 changements à partager » deep-linking to the earliest. The acting manager is
   **included**: they made the edit, but the bell is also the to-do list. A feed-driven change (no
   actor) notifies the same managers.

`deleteEvent`, inside its existing serializable transaction and before `deleteMany`:

1. Read REMINDER/UPDATE rows for the ids in scope with state `SENT`; for each such event build the
   snapshot (`buildTemplateVars` without the link, RDV included, so the cancellation template can
   still say « Pas de RDV à 14:30 » if a team writes it that way).
2. Create a CANCELLATION row per such event (`state: PENDING`, `teamId`, `eventSnapshot`,
   `expiresAt = startsAt`, `eventId` still set; `SetNull` clears it when `deleteMany` runs).
3. Delete the other share rows of those events (a stale `SCHEDULED` reminder must not survive as an
   orphan).
4. After the commit: queue `nudge` and `expire` (at `expiresAt`), one notification per manager
   (« Annulation à partager : … », deep link `/clubs/<clubId>/teams/<teamId>?partage=<shareId>` since the
   event page is gone), and remove the deleted events' reminder jobs.

Team deletion needs nothing: shares cascade with `Team`.

### Routes

- `GET/PATCH …/whatsapp-settings` accept the two templates.
- `GET …/events/:eventId/whatsapp-share` returns REMINDER and UPDATE (UPDATE only when a row exists).
- `POST …/events/:eventId/whatsapp-share/:type/confirm` accepts `UPDATE`.
- `GET clubs/:clubId/teams/:teamId/whatsapp-shares/pending-cancellations`: `PENDING`/`SENT` CANCELLATION rows
  whose `expiresAt` is in the future, rendered from the snapshot.
- `POST clubs/:clubId/teams/:teamId/whatsapp-shares/:shareId/confirm`: confirms by share id, for the
  row that has no event any more. Re-verifies `share.teamId`.
- Confirming an UPDATE records its own `sentContentKey` and leaves the REMINDER `SENT` with its original
  sender: both messages were sent, and the next comparison runs against the UPDATE.

### Processor

`expire` for a CANCELLATION reads `expiresAt` instead of the event. `send` never runs for UPDATE or
CANCELLATION: they start `PENDING`.

## 5. Frontend

- **`WhatsAppSettingsCard`** gets three tabs or stacked sections (« Rappel », « Changement »,
  « Annulation », the segmented control on the canvas), each the Part 1 `TemplateEditor` (Tiptap) with its own
  preview and reset; the cancellation editor doesn't require the link.
- **`WhatsAppShareCard`** shows the UPDATE share above the reminder when it exists (« Changement à
  partager », same share + confirm flow, same message disclosure) and says what moved, old value struck
  through (« match ~~15:30~~ → 16:00, RDV ~~14:30~~ → 15:00 »), from a `changes` list the `GET` computes
  between the sent snapshot and the current variables. That needs the sent variables, not just their
  hash, so the confirm also stores `sentVars Json?` next to `sentContentKey` (added by this part's
  migration; a share confirmed before it shows no diff, only the new message). The reminder's line
  stays as history.
- **Delete confirmation** (`EventDeleteModal`): when `event.whatsAppShare?.state === 'SENT'` it adds one
  line, « Le groupe WhatsApp a été prévenu de cet événement : vous pourrez partager l'annulation juste
  après. » No extra step.
- **`TeamPendingCancellations`** on `TeamDetailPage` above the tabs, managers only, rendered only when the
  query has rows (its `error` branch is a compact `QueryError`, its `loading` renders nothing to avoid a
  jump; an empty result is the normal case and renders nothing, which is not an error falling through).
  One inset card per cancellation with the same share + confirm flow. `?partage=<shareId>` on the team
  page scrolls to it and focuses its button.
- The share + confirm flow is extracted from `WhatsAppShareCard` into `WhatsAppShareAction` so the event
  card and the team-page card run the same code.

## 6. Tests

- Jest: change detection (start time, place, opponent, type, RDV time, RDV place each prompt; notes,
  venue, logistics don't); a reverted edit voids a pending UPDATE; `MeetingChangeFeed` publishes before
  the 7-day filter and a recomputed drive time raises an UPDATE; update prompt only after a `SENT` share; a second edit resets a
  shared UPDATE to `PENDING`; series update and series delete send one notification per manager; FFBB
  update path; delete creates CANCELLATION with snapshot, drops other rows, removes jobs; confirm by share
  id refuses another team's share; `validateTemplate` cancellation without `{link}`; copy fixtures.
- `test/db/whatsapp-share.db-spec.ts` adds: CANCELLATION row survives `Event` delete with `eventId`
  null; two CANCELLATION rows with null `eventId` don't collide on the unique; cascade with `Team`;
  the `teamId` backfill.
- Vitest: settings sections and the cancellation rule, card with UPDATE, delete modal line,
  pending-cancellations card and `?partage=` on the team page.
- Screenshots: settings with three templates, event card with a pending update, delete modal line,
  team-page cancellation card.

## 7. Done when

After a share, any change that alters the message (start time, place, type, opponent, RDV time or
place, whatever changed it) asks managers to share an update, deleting the
event asks them to share a cancellation that stays shareable from the team page until the original
kickoff, and events never shared raise nothing.

## 8. After Part 3

Beta with a handful of teams with many non-app members. The funnel reads from `EventShare`
(notified, nudged, sent, platform) and `EventRsvpChange.via`. The design doc's three open points
(members seeing « Envoyé le … », one share per series, language) are decided on beta data, not
before.
