# Manual match venue: Part 4, editing the venue on the match

Status: spec (implements entry points (a) and (b) and the display rules of [`2026-09-30-manual-match-venue-design.md`](./2026-09-30-manual-match-venue-design.md), on top of [Part 1](./2026-09-30-manual-match-venue-part1-backend.md) and [Part 2](./2026-09-30-manual-match-venue-part2-notification.md))
Date: 2026-09-30
Design: [Claude Design canvas](https://claude.ai/artifact/VHmwSUJyvYhmHQmTuPi7yo), artboards « lieu inconnu », « lieu connu », « Modifier le lieu ».

Is the match page revamp plan's « Part 3: venue editing UI » minus the import card (this series' Part 3).
Depends on the revamp's Part 1 (sheet dialogs) and Part 2 (`EventHeroLocation`).

## 1. Corrections to the design doc that shape this part

- **`EventVenueRow` no longer exists** once the revamp's Part 2 lands: the venue moves into the hero for
  both types. The display rule applies to `EventHeroLocation`, `EventRow`'s Lieu column,
  `MyAgendaEventCard`, `GuestEventCard` and `MatchTimelineSteps`' arrival step, all through
  `eventVenueLabel`.
- **Two forms, one rule, different strictness.** The design doc wants « the same zod rules » in the
  dialog and `EventEditModal`. But `EventEditModal` also edits every hand-created training, whose
  `location` is a free-text « Gymnase X » today; forcing a name there breaks existing edits. So the
  shared schema requires the address everywhere and the **name only in the dialog**, the same
  `required` switch `refineMeetingPointPair` already has. Name without address is an error in both.
- **Lengths are `EVENT_LOCATION_MAX_LENGTH` (120) for both fields**, not `meetingPointFields`' 80/200.
- **The placeholder is not a value the form shows.** When `location` is the placeholder, both forms seed
  the address field empty. `EventEditModal` then sends the placeholder back unchanged if the manager
  leaves it empty (Part 1 accepts that), rather than failing « Lieu requis » on an unrelated edit.

## 2. Shared schema (`app/src/clubs/eventVenueSchema.ts`)

`eventVenueFields = { locationName: z.string().max(120), location: z.string().max(120) }`,
`refineEventVenue(value, ctx, { nameRequired })`: empty address → « Adresse requise »; name without
address → same message on `location`; `nameRequired` and empty name → « Nom de la salle requis ».
`toEventVenue(value, previousLocation)` returns the trimmed `{ location, locationName }` body (empty
name → `null`; empty address with a placeholder previous → the placeholder). Used by
`EventVenueDialog`, `EventEditModal` and `EventCreateForm`.

## 3. `EventVenueDialog` (`app/src/clubs/EventVenueDialog.tsx`)

- `Dialog` (sheet on mobile from the revamp's Part 1), react-hook-form + `zodResolver`, fields « Nom de
  la salle » and « Adresse », `reset(...)` on open from the event.
- Imported match: one `Text variant="meta"` line « Si la FFBB publie un lieu, le prochain import le
  remplacera. »
- Known previous venue and the typed address not `isSameEventLocation` to it: `Card variant="inset"
tone="structure"` note « Les {n} joueurs convoqués ou présents seront prévenus du changement de salle.
  », confirm reads « Enregistrer et prévenir ». `n` = roster entries convoked or `GOING`, from
  `useEventRoster` (the same union Part 2 notifies; hidden while it loads, never a guessed 0). Otherwise
  « Enregistrer ».
- Submit: `useEventUpdate` with `{ location, locationName, scope: 'THIS' }`. Refusal → `setError('root')`
  - `Alert`; success → close + `toast()` « Lieu enregistré » (« … joueurs prévenus » when notifying).

## 4. Entry points

- **Hero (`EventHeroLocation`), `canManage` only**, per the canvas: unknown → gold-tint block
  (`IconBadge tone="accent"` alert, « Lieu non communiqué », meta « Les joueurs ne savent pas encore où
  aller. », full-width `Button` « Ajouter le lieu »); known → the `surface-2` row with an icon-only
  `Button variant="outline" size="sm"` pencil, `aria-label="Modifier le lieu"` on mobile, labelled
  « Modifier le lieu » from `sm` up, « Itinéraire » under it. Players see the row without the button.
  Shown for every MATCH, imported or not; a TRAINING keeps editing through `EventEditModal`.
- **`EventEditModal`**: « Nom de la salle » above « Lieu » (relabelled « Adresse »), `nameRequired:
false`. `EventCreateForm` gets the same pair.
- **Timeline**: arrival step shows the label, « Salle à confirmer » when unknown, no button.

## 5. Tests and screenshots

- `EventVenueDialog.test.tsx`: both fields required; imported note shown only for imported; notify note
  and button label only when a known venue changes (not placeholder → address, not case-only); server
  400 lands in the `Alert`; success toasts and closes.
- `EventHeroLocation` test: button per state, hidden for players, label = `locationName ?? location`.
- `EventEditModal.test.tsx`: name optional; name without address refused; placeholder seeded empty and
  sent back unchanged on a notes-only edit.
- `MatchTimelineSteps.test.tsx`: arrival label and « Salle à confirmer », no manager button.
- `EventRow`, `MyAgendaEventCard`, `GuestEventCard`: label shown when `locationName` is set.
- Screenshots (mobile + desktop): hero unknown and known as manager, known as player, dialog in both
  states (with and without the notify note). `scripts/fixtures/` gets a match fixture with and without
  `locationName`.
