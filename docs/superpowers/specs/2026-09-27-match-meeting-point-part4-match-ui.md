# Match meeting point: Part 4, frontend (the match page)

Status: spec (implements Part 4 of [`2026-09-27-match-meeting-point-design.md`](./2026-09-27-match-meeting-point-design.md))
Date: 2026-09-27

Everything on the event page (`EventDetailPlayerView` / `EventDetailManagerView`) that reads
`TeamEvent.meetingPlan`, `TeamEvent.myTravelMode` and `EventRsvpRosterEntry.travelMode` from
Parts 1–2. TRAINING events are untouched: `meetingPlan` is null there, and every block below
renders nothing for a null plan.

## 1. Where and when: rows in `EventLogisticsCard`

The card already opens with the venue row (« S'y rendre » for a player, « Logistique » for a
manager). A MATCH gets up to two more rows right under it, same row anatomy (tinted icon disc,
bold label, meta line, action on the right):

- **Arrival row**, always, for a MATCH:
  - label « Arrivée à la salle · 19:45 »
  - meta « 45 min avant le coup d'envoi »
- **Meeting row**, only when `meetingPlan.meetingPoint` is set:
  - Label: « RDV 19:15 · Parking salle Coubertin », or « RDV à confirmer · Parking… » while
    `meetsAt` is null.
  - Meta, by source:

    | Source        | Meta line                                  |
    | ------------- | ------------------------------------------ |
    | Computed      | « Trajet estimé 23 min · 12 rue … »        |
    | Manual        | « Trajet saisi : 23 min · … »              |
    | Time override | « Horaire fixé par le coach · … »          |
    | Unknown       | « Temps de trajet en cours de calcul · … » |

  - An « Itinéraire » link to the meeting address, reusing `eventItineraryHref`.
  - Manager only: an « Ajuster » button that opens `EventMeetingDialog`.

The block is one new component, `EventMeetingRows` (`app/src/meeting-points/`), composed by
`EventLogisticsCard`, so the card keeps its single `Card variant="flush"`. Times use
`formatEventTime` (local wall clock), same as every other time on the page.

## 2. The manager's per-match adjustment: `EventMeetingDialog`

A `Dialog`: a multi-field, infrequent edit (CLAUDE.md "Modals vs. inline editing"). Three
independent sections, each sending its field only when changed:

- **Lieu**:
  - A checkbox « Utiliser le point de rendez-vous par défaut (<name>) ». It is checked unless
    `meetingPointSource === 'EVENT'`.
  - Unchecking reveals name and address (same validation as Part 3's dialog).
  - Re-checking sends `meetingPoint: null`.
- **Temps de trajet (minutes)**:
  - A number field, pre-filled only when the minutes are `MANUAL`. Empty means computed, which
    sends `travelMinutes: null` if it was manual.
  - Hint: « Calculé : 23 min » when a computed value exists.
  - A « Recalculer » button calls `POST …/meeting/refresh` and toasts the outcome. A 503 toasts
    the server's « Saisissez la durée à la main » message.
- **Heure du rendez-vous**:
  - `type="time"`, pre-filled only when the time source is `OVERRIDE`. Empty means computed.
  - The value is resolved against the match's own local date (the same approach as
    `useEventTimeUpdate`) and sent as ISO.
  - A time after kick-off is caught client-side with a `FieldError`, before the server's 400.

Submitting sends one `PATCH …/meeting` with only the changed keys. Success toasts « Rendez-vous
mis à jour » and closes. A server error shows an `Alert` in the open dialog.

## 3. The player's choice: `EventTravelModeControl`

Shown inside `EventDecisionBand`, under the RSVP control, when `event.myTravelMode !== null`
(i.e. MATCH + GOING) **and** a meeting point exists. With no meeting point there is nothing to
choose between. `CoachOwnRsvpCard` shows it under the coach's own RSVP too.

- `RadioCardGroup` (the blessed radio-card primitive, CLAUDE.md "Radio cards"), `tone="structure"`,
  `aria-label="Comment venez-vous ?"`. Two cards:
  - **Au rendez-vous**: « 19:15 · Parking salle Coubertin » (or « horaire à confirmer »).
  - **Direct à la salle**: « Arrivée 19:45 ».
- Selecting a card fires `PATCH …/travel-mode` immediately. It is inline, not a dialog: a
  single-field, low-risk, high-frequency choice, like the RSVP control. On failure the card snaps
  back and a `toast` reports it. There is no success toast; the selected card is the feedback.
- Since not choosing counts as RDV, « Au rendez-vous » is selected from the moment a player
  answers « Présent ».
- `useEventTravelModeSet` invalidates the same keys as `useEventRsvpSet` (the event, the list, the
  RSVP roster and the dashboard prefix).

## 4. Who comes how: roster breakdowns

`EventRosterRow` (`useEventRoster`) gains `travelMode` from the RSVP roster entry.

- **`EventAttendanceSection`** (player « Qui vient ? ») and **`EventRosterList`** (manager
  roster): when the event has a meeting point, a GOING member's row gets a second
  `Badge variant="outline" tone="neutral"`, « RDV » or « Direct ».
- `EventAttendanceSection`'s summary line gains « · 8 au RDV · 3 en direct » under the same
  condition.
- Both components take a new `showTravelMode: boolean` prop from the view, computed as
  `event.meetingPlan?.meetingPoint != null`. Without a meeting point, travel mode is noise.

## Tests

- `EventMeetingRows.test.tsx`:
  - The arrival row is always there for a match.
  - The RDV row shows the computed / manual / override / à confirmer copy.
  - No RDV row without a meeting point.
  - « Ajuster » only for a manager.
- `EventMeetingDialog.test.tsx`:
  - Only changed keys are sent.
  - Re-checking the default sends `meetingPoint: null`.
  - The time is converted to ISO on the match date.
  - A time after kick-off is refused.
  - « Recalculer » toasts success, and toasts the 503 copy.
- `EventTravelModeControl.test.tsx`:
  - Renders both cards with times.
  - A selection PATCHes.
  - Hidden when not GOING.
- `EventAttendanceSection.test.tsx`: the RDV/Direct badges and summary counts are present only
  with `showTravelMode` (which also covers `useEventRoster` carrying `travelMode` through).

## Screenshots

`scripts/fixtures/match-meeting-point.json`, extended with:

- An away match whose computed plan gives RDV 19:15.
- A roster with GOING players on both modes.
- The caller rostered and GOING.

Captured:

- The player's page on a phone (decision band with the choice, « S'y rendre » rows, « Qui
  vient ? » badges).
- The manager's page on desktop.
- The manager's « Ajuster » dialog.
