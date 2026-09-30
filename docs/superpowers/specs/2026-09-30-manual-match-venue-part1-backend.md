# Manual match venue: Part 1, `locationName` and the edit rules

Status: spec (implements Part 1 of [`2026-09-30-manual-match-venue-design.md`](./2026-09-30-manual-match-venue-design.md))
Date: 2026-09-30

The column, the shared types and the `PATCH .../events/:eventId` rules, plus the FFBB import clearing a
stale name. No notification (Part 2), no import summary (Part 3), no UI (Part 4). Half of the match page
revamp plan's « Part 4: venue backend ». `pr-scope.yml` flags this PR (`server/prisma`); the description
lists the behaviour changes below.

## 1. Corrections to the design doc that shape this part

- **`EventEditModal` re-sends `location` on every save** (`EventEditModal.tsx`, `values.location`), so
  an imported match still on « Lieu non communiqué » sends the placeholder back when a manager only edits
  the notes. « `location` must not be set to `UNKNOWN_EVENT_LOCATION` by hand » therefore means
  **changed to** it: the placeholder is refused only when the stored location is something else. An
  unchanged placeholder passes.
- **A new address without a name clears the old name.** The design doc applies this to the import only,
  but the API has the same problem: `locationName` described the previous address. So when `location`
  changes and `locationName` is absent from the body, the service writes `locationName: null`. Sending
  both (what every form in Part 4 does) sets both.
- **Travel time must be re-queued on the write, not on the next read.** `updateEvent` does nothing with a
  new `location` today; the stale `travelRouteKey` is only noticed when someone reads the match, and the
  RDV announcement waits for that reader. When `location` changes on a MATCH, call
  `meetingPoints.enqueueRecompute(ids)` (the same call a TRAINING → MATCH switch already makes). The
  recompute job announces `EVENT_MEETING_CHANGED` / `_FIXED` as today.
- **Scope needs no new rule.** Imported matches have `recurrenceId: null`, so `scope !== 'THIS'` already
  400s. A hand-created recurring series may carry `locationName` under any scope, like `location`.
- **Length is `location`'s, not the meeting point's.** `meetingPointFields` caps name at 80 and address
  at 200; `Event.location` is capped at 120 (DTOs and the import's `clampLocation`). The venue pair
  reuses the pair _rule_, not those fields: see Part 4.
- **The manual venue lowers FFBB's re-read priority.** `resolveVenues` sorts matches with a known venue
  last (`knownVenueMatchIds`), and a manually filled match now counts as known. So under the detail-page
  budget FFBB is asked about it later, and a wrong FFBB venue overwrites the manual one less often than
  decision 3 suggests. That softens decision 3's downside; nothing to change.

## 2. Schema

Migration `20260930060000_event_location_name`, hand-written in Prisma's style:

```sql
ALTER TABLE "Event" ADD COLUMN "locationName" TEXT;
```

`model Event { locationName String? }`, commented as the gym label paired with `location` (the address).
No backfill.

## 3. Shared types (`@basketeasy/types/events`, first)

- `EVENT_LOCATION_MAX_LENGTH = 120`, used by both DTOs, `UpdateEventDto.locationName` and the import's
  `MAX_LOCATION_LENGTH` (which becomes an import of it).
- `TeamEvent.locationName: string | null`; `UpdateEventRequest.locationName?: string | null`.
  `CreateEventRequest` gains it too (same field, same rules) so `EventCreateForm` can reuse the Part 4
  schema; hand-created events otherwise behave as today.
- `eventVenueLabel({ location, locationName }): string` → `locationName ?? location`. The one place the
  display rule lives, used by server copy and every frontend surface.
- `isSameEventLocation(a, b): boolean`: trim, collapse whitespace, compare case-insensitively. Used by
  Part 2's « did the venue change » and Part 4's « Enregistrer et prévenir », so the two agree.
- `GuestEvent.locationName` (`guest-links.ts`) and `MyAgendaEvent.locationName` (`my-dashboard.ts`):
  both render a venue.

## 4. API

`UpdateEventDto` and `CreateEventDto`: `locationName?: string | null`, trimmed, `@MaxLength(120)`, empty
string transformed to `null`. `EventsService.updateEvent`:

1. `resultingLocation = data.location ?? event.location`.
2. `data.location` is the placeholder and `event.location` is not → `400` « Le lieu doit être une
   adresse ». (`isUnknownEventLocation`, so a padded placeholder is caught too.)
3. `resultingLocationName` = `data.locationName` if sent; else `null` if `location` changed; else the
   stored one.
4. `resultingLocationName` non-null while `resultingLocation` is the placeholder → `400` « Renseignez
   l'adresse de la salle ».
5. Write `locationName` alongside `location` in the existing `updateData`.
6. After the transaction: if `location` changed and the resulting type is MATCH, `enqueueRecompute(ids)`
   (skipped when `becomesMatch` already queued them). `onEventsChanged(ids)` is already called.

`createEvent`: rule 4 only (a manager can't type the placeholder on create either: rule 2 with
`event.location` taken as empty).

## 5. Everything that renders a venue server-side

`eventVenueLabel` replaces `event.location` in: `convocationNotification`'s body
(`event-notification-copy.ts`), the WhatsApp `{location}` variable (`whatsapp-template-vars.ts`), and the
guest/dashboard payloads' selects (they pass `locationName` through; the client labels). The WhatsApp
change means a name-only edit alters `contentKey`, so an already-shared reminder raises an UPDATE
prompt: correct under the WhatsApp Part 3 rule (« the message would read differently »).

Geocoding, `travelRouteKey` and « Itinéraire » keep reading `location` only.

## 6. FFBB import

In `upsertMatch`'s update branch: `locationName: location !== existing.location ? null : undefined`.
`isUnchanged` still compares `location` only. On create, `locationName` is left null.

## 7. Tests

- `events.service.spec.ts`: name persisted with an address; name cleared when only `location` changes;
  placeholder re-sent unchanged passes; changed to placeholder 400s; name with placeholder 400s;
  `enqueueRecompute` called on a MATCH location change, not on a name-only change, not on a TRAINING.
- `ffbb-import.service.spec.ts`: an FFBB venue different from the manual one overwrites it and nulls
  `locationName`; FFBB null keeps both; the same address keeps the name.
- `event-notification-copy.spec.ts`: convocation body names `locationName` when set.
- `whatsapp-template-vars` spec: `{location}` is the label.
- `packages/@basketeasy/types`: `isSameEventLocation` and `eventVenueLabel` unit cases.
