# Manual match venue: Part 3, « N matchs sans lieu » after an import

Status: spec (implements entry point (c) of [`2026-09-30-manual-match-venue-design.md`](./2026-09-30-manual-match-venue-design.md), on top of [Part 1](./2026-09-30-manual-match-venue-part1-backend.md))
Date: 2026-09-30

After an FFBB import, list the upcoming matches still on « Lieu non communiqué » so the manager can fill
them in. One vertical slice: the result field and the card that renders it.

## 1. Corrections to the design doc that shape this part

- **The list is read after the upserts, not collected during them.** `upsertMatch` returns early for a
  played match and never sees a match whose FFBB link was removed, so collecting inside the loop would
  miss rows. One `event.findMany` at the end: `teamId`, `externalId not null`, `location =
UNKNOWN_EVENT_LOCATION`, `startsAt > now`, `type = MATCH`, ordered by `startsAt`, `take: 20`, plus a
  `count` for the total (the card says « et N autres » past 20).
- **The link targets the match page, not a section.** The design doc anchors on « the logistics
  section », but after the revamp plan's Part 2 the venue lives in the page header, which is where the
  page opens. Plain event route, no anchor.
- **Not a dismissible alert.** « Dismissed by the next import or a navigation » is exactly the lifetime of
  the mutation's `data` in `useFfbbImport`: the card renders from `mutation.data` and needs no dismiss
  state.

## 2. Types and API

`FfbbImportResult` gains `missingVenue: { eventId: string; opponentName: string | null; startsAt:
string }[]` and `missingVenueTotal: number`. `FfbbImportService.importSchedule` fills both after the
WhatsApp sync. No route change.

## 3. Frontend (`TeamFfbbLinkList`)

- The success toast stays as is.
- Below the link list, when `missingVenue` is non-empty: `Alert` (gold/warning tone, alert icon) titled
  « {n} match(s) sans lieu », one line « Les joueurs ne savent pas encore où aller. », then a list of
  `TextLink`s « vs {opponent} · {formatEventDate} » to
  `/clubs/:clubId/teams/:teamId/events/:eventId`, then « et {total − 20} autres » when truncated.
- `canManage` is already implied (the import button is manager-only).

## 4. Tests and screenshot

- `ffbb-import.service.spec.ts`: lists only upcoming placeholder matches of this team, ordered, capped at
  20 with the right total; a match with a manual venue is absent.
- `TeamFfbbLinkList.test.tsx`: alert rendered from `missingVenue`, absent when empty, links point at each
  event, overflow line past 20.
- Screenshot of the card with three matches, via `pnpm mock-api` and a fixture for the import response.
