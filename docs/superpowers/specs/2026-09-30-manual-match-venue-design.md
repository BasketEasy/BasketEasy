# Manual match venue: design

**Status:** spec, not built. **Date:** 2026-09-30.

## Problem

An FFBB-imported match whose venue FFBB hasn't published (or that FFBB refused to serve, see #282 / #283) shows « Lieu non communiqué ». A manager who knows the gym has no obvious way to set it.

Technically `EventEditModal` already accepts a new `location` for an imported match, and the import never overwrites a known location with a null. But the edit button sits at the foot of the match page, and the place where the manager actually sees « Lieu non communiqué » (the arrival step of `MatchTimelineSteps`, the Lieu column of `EventRow`) offers nothing. So in practice: no way.

## Decisions

| #   | Question               | Decision                                                                                                                                                                                                                                                                           |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which matches          | Any FFBB-imported match, unknown venue or wrong venue alike. Hand-created events are unchanged (they already edit freely).                                                                                                                                                         |
| 2   | Who                    | Team managers: `TeamManagerGuard` (club `ADMIN` of a linked club, or `TeamAdmin`). Same as any event edit today.                                                                                                                                                                   |
| 3   | Manual vs. re-import   | **Last write wins, every import is a write.** When FFBB returns a venue, the import overwrites the manual one. When FFBB returns null, the existing location is kept (current behaviour). No `locationIsManual` flag, no stored copy of FFBB's venue, no « Revenir au lieu FFBB ». |
| 4   | What the manager types | Gym name + address, two fields, same pair rule as `meetingPointSchema.ts`.                                                                                                                                                                                                         |
| 5   | Storage                | New nullable `Event.locationName`. `Event.location` stays the address: it is what is geocoded, what `travelRouteKey` hashes and what « Itinéraire » links to.                                                                                                                      |
| 6   | Entry points           | (a) inline « Ajouter le lieu » / « Modifier le lieu » on the match, (b) `EventEditModal`, (c) the FFBB import summary.                                                                                                                                                             |
| 7   | Notifications          | Only when a **known** venue changes to another. Filling in « Lieu non communiqué » is silent.                                                                                                                                                                                      |

## Consequence of decision 3 (read before building)

A manual fix survives only while FFBB has no venue for that match. If FFBB publishes the wrong gym, the manager's correction is undone on the next import. That is accepted for v1: the pain today is the missing venue, not a wrong one. If wrong FFBB venues turn out to be common, revisit with a manual flag.

## Data model

```prisma
model Event {
  // ...
  location     String   // address, or UNKNOWN_EVENT_LOCATION
  locationName String?  // gym label, e.g. « Gymnase de la Trocardière »
}
```

Hand-written migration under `server/prisma/migrations/` adding the nullable column. No backfill.

- `TeamEvent` (in `@basketeasy/types/events`) gains `locationName: string | null`. Also on the guest RSVP payload, since the guest page renders the same timeline.
- **FFBB import:** FFBB's scraped string already mixes gym name and address. When the import writes a new `location`, it sets `locationName: null` (the name the manager typed described the old address). When it keeps the existing location, it leaves `locationName` alone. Splitting FFBB's string into name + address is out of scope.
- `isUnchanged` in `FfbbImportService.upsertMatch` is unaffected (it compares `location` only; a manager's name on an unchanged address is not an FFBB change).

## API

No new route. `PATCH .../events/:eventId` (`UpdateEventDto`) accepts `locationName?: string | null` (trimmed, max length same as `location`, empty string → null). Rules:

- `location` must not be set to `UNKNOWN_EVENT_LOCATION` by hand (400). The placeholder is the import's word, not a manager's.
- Setting `locationName` with `location` still the placeholder is a 400 (a name without an address can't be geocoded, and the timeline would lie).
- Scope: `THIS` only for imported matches (they have no `recurrenceId` anyway).

Side effects, all existing machinery:

- **Travel time:** changing `location` changes the route key, so `EventMeeting.travelMinutes` reads « à confirmer » and re-queues on the `meeting-travel` queue. Nothing new to write.
- **RDV announce:** if the recomputed RDV time changes, `EVENT_MEETING_CHANGED` / `EVENT_MEETING_FIXED` already fire through `announceMeetingChanges`.
- **WhatsApp reminders:** call `onEventsChanged([eventId])` as `updateEvent` already does.

## Notification (decision 7)

New `NotificationType.EVENT_VENUE_CHANGED`.

- Fires from `EventsService.updateEvent` when the old `location` was **not** `isUnknownEventLocation` and the new one differs (normalised trim/case compare). Placeholder → address is silent. A name-only change is silent.
- Recipients: convoked players + players answering `GOING`, via `resolvePlayerAudience` + `groupByRecipient` (guardians included, one message per reader).
- Only for matches that haven't started.
- Copy in `server/src/events/event-notification-copy.ts`, e.g. title « Changement de salle », body « Le match contre {opponent} du {date} se jouera à {locationName ?? location}. »
- One notification per edit. If the RDV also moved, the reader gets both this and `EVENT_MEETING_CHANGED`; acceptable for v1, note as a possible merge later.
- The FFBB import overwriting a location does **not** emit this (the import has never notified venue changes; out of scope).

## Frontend

### (a) Inline on the match

- `MatchTimelineSteps` arrival step, `canManage` only:
  - venue unknown → a `Button variant="outline" size="sm"` « Ajouter le lieu » in place of the itinerary link;
  - venue known → a quiet « Modifier le lieu » `TextLink`-style button.
- Both open a new `EventVenueDialog` (`@basketeasy/ui/dialog`, react-hook-form + zod, name + address fields, shared pair rule). It is a focused two-field edit of one record, per CLAUDE.md's modal rule. Server refusal → `setError('root')` + `Alert`; success → `toast()`.
- Display: when `locationName` is set, the arrival step reads « {locationName} » on the label line and the address on the meta line. Same in `EventVenueRow` (training card) and the `EventRow` Lieu column.
- If the match is imported, the dialog shows one `Text variant="meta"` line: « Un prochain import FFBB remplacera ce lieu si la FFBB en publie un. » (decision 3 made visible).
- When the old venue was known, the confirm button reads « Enregistrer et prévenir les joueurs ». Otherwise « Enregistrer ».

### (b) `EventEditModal`

Add the `locationName` field above `location`. Same zod rules as the dialog (extract a shared schema so the two can't drift).

### (c) FFBB import summary

- `FfbbImportResult` gains `missingVenue: { eventId: string; opponentName: string | null; startsAt: string }[]`: upcoming imported matches of the team whose location is still the placeholder after the import.
- `TeamFfbbLinkList`'s import success toast stays; below the link list, when `missingVenue` is non-empty, render an `Alert` « {n} match(s) sans lieu » listing each as a `TextLink` to the match page (anchor on the logistics section). Dismissed by the next import or a navigation.

## Tests

- `events.service.spec.ts`: `locationName` persisted/cleared; placeholder refused as a manual location; name without address refused; `EVENT_VENUE_CHANGED` emitted for known → known, not for placeholder → known, not for name-only, not for past matches.
- `ffbb-import.service.spec.ts`: FFBB venue overwrites manual location and clears `locationName`; FFBB null keeps both; `missingVenue` lists only upcoming placeholder matches.
- `EventVenueDialog.test.tsx`, `MatchTimelineSteps.test.tsx` (button shown to managers only, label per state), `TeamFfbbLinkList.test.tsx` (alert rendered from `missingVenue`).
- Screenshot of the timeline in both states and the dialog, per CLAUDE.md.

## Out of scope

- Keeping a manual venue across imports (decision 3).
- Splitting FFBB's venue string into name + address.
- Notifying on import-driven venue changes.
- A club-level gym directory to pick from.
