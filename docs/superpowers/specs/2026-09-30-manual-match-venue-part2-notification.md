# Manual match venue: Part 2, « Changement de salle »

Status: spec (implements the Notification section of [`2026-09-30-manual-match-venue-design.md`](./2026-09-30-manual-match-venue-design.md), on top of [Part 1](./2026-09-30-manual-match-venue-part1-backend.md))
Date: 2026-09-30

`EVENT_VENUE_CHANGED`, emitted by `EventsService.updateEvent`. Second half of the revamp plan's « Part
4: venue backend ». `pr-scope.yml` flags this PR (`server/prisma`, enum value).

## 1. Corrections to the design doc that shape this part

- **Series.** The design doc assumes one match per edit. A hand-created recurring MATCH series can change
  `location` under `THIS_AND_FUTURE`/`ALL`. Same rule as `deleteEvent`: **one notification per
  recipient** for the call, a summary body when more than one match is in scope, never one per
  occurrence.
- **Matches only.** « Only for matches » in the design doc is read literally: a TRAINING venue change stays
  silent in v1 (trainings are weekly and their gym is known to the team; a convocation doesn't exist for
  them either). Revisit if clubs ask.
- **« Changed » is Part 1's `isSameEventLocation`**, so the dialog's « Enregistrer et prévenir » (Part 4)
  and the server can't disagree. The dialog counts recipients client-side from the roster (§4) with the
  exact server rule.

## 2. Schema

Migration `20260930070000_event_venue_changed_notification`:
`ALTER TYPE "NotificationType" ADD VALUE 'EVENT_VENUE_CHANGED';`. Frontend icon map gains the entry
(pin icon, same as the venue row).

## 3. Emission

In `updateEvent`, after the transaction and before the WhatsApp sync, only when `data.location` was sent:

- In scope: events of `ids` with `type === MATCH` (resulting), `startsAt > now`, whose **previous**
  location was not `isUnknownEventLocation` and `!isSameEventLocation(previous, data.location)`.
  Previous locations are the rows read before the write (`assertEventInTeam` for `THIS`; one
  `findMany` of `ids` selecting `id, location, startsAt, type, opponentName` for a series, done before
  the transaction).
- Audience: roster members with an `EventConvocation` **or** an `EventRsvp` `GOING` on any in-scope event
  (two `findMany`s over `eventId in`, union of `teamPlayerId`), then
  `resolvePlayerAudience` + `groupByRecipient`. Players without an account drop out as elsewhere.
- Deep link: `recipientDeepLink` to the event (one match) or to the team page (series), like
  cancellation.
- Delivery: `NotificationsService.notify`, best-effort, never fails the edit.

Not emitted: placeholder → address, name-only change, a past match, the FFBB import (§ design doc).

## 4. Copy (`event-notification-copy.ts`)

`venueChangedNotification(teamName, event, newLabel, count, subject)`:

- one match: title « Changement de salle — {teamName} », body « {prefix}Le match contre {opponent} du
  {formatEventMoment} se jouera à {newLabel}. »
- series: title « Changement de salle — {teamName} », body « {prefix}Les {count} prochains matchs de
  cette série se joueront à {newLabel}. »

`newLabel` is `eventVenueLabel` of the written row. `{prefix}` is `forWhomPrefix(subject)`, so a parent's
copy names the child.

If the RDV also moved, the reader also gets `EVENT_MEETING_CHANGED` from the recompute job (Part 1). Two
notifications, accepted for v1.

## 5. Tests

`events.service.spec.ts`: known → known notifies convoked + GOING (not MAYBE, not unanswered); placeholder
→ known silent; name-only silent; whitespace/case-only change silent; past match silent; TRAINING silent;
a series sends one notification per recipient with the count; a notify failure doesn't fail the update.
`event-notification-copy.spec.ts`: both bodies, self and guardian subjects.
