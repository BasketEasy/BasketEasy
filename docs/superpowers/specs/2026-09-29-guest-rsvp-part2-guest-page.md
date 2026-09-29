# Guest RSVP link: Part 2, the guest page

Status: spec (implements Part 2 of [`2026-09-29-guest-rsvp-link-design.md`](./2026-09-29-guest-rsvp-link-design.md))
Date: 2026-09-29

The public page at `/r/:token` over the Part 1 endpoints. No manager UI (Part 3). No schema or
auth change, so `pr-scope.yml` does not flag it.

One small backend addition Part 1 missed: `GuestEvent.timeConfirmed` (a `TimeBlock` must not print
an FFBB import's 00:00 placeholder as a kick-off), so the page is not strictly frontend-only.

## 1. Route and shell

- `/r/:token` is a top-level `React.lazy` route beside `/invite/:token`: outside `PublicOnlyRoute`
  and `ProtectedRoute`, so a logged-in visitor sees the guest page and nobody is redirected.
- One column, `PageContainer size="md"`, no `AppHeader`, no bottom nav. The « Kluvo » wordmark
  (same `Text` recipe as `AppHeader`), then team and club name.
- On mount the page adds `<meta name="robots" content="noindex">` and
  `<meta name="referrer" content="no-referrer">`, removed on unmount. The server already sends the
  matching headers; the meta tags cover the SPA shell itself, which nginx serves.

## 2. Data: `app/src/guest-rsvp/`

- `useGuestPage(token)`: `GET /public/guest/:token`, `retry: false` (a 404 is a dead link, not a
  blip), refetched on window focus so an answer given by a teammate shows up.
- `useGuestRsvpSet(token)` / `useGuestRsvpClear(token)`: `PUT` / `DELETE .../events/:eventId/rsvp`.
  Each answers with the updated `GuestEvent`, which is written straight into the page cache
  (`setQueryData`) so the button state moves without a refetch. A `409 GUEST_RSVP_CLOSED` also
  invalidates the page so the event drops off.
- `useGuestInviteRequest(token)`: `POST .../invite-request`, 204.
- `useGuestIdentity(token)`: the chosen `teamPlayerId` in localStorage under
  `kluvo.guest.<token>`, every read and write in try/catch (a convenience, never state that must
  persist). A stored id that is no longer on the roster is treated as unset.

## 3. Screens

- **Step 1, « Qui êtes-vous ? »:** `RadioCardGroup` of roster names (« Léo M. »), players first,
  coaches after, in the order the server sent. Picking one saves it and moves to step 2.
- **Step 2, the agenda:** « Léo M. · Ce n'est pas moi ? » (clears the stored id), then one card per
  event: `TimeBlock`, type badge, opponent, place, date; RSVP buttons; on a match answered
  `GOING` with a meeting point, the travel choice; a « Convoqué·e » badge when the chosen player is
  called up; an expandable « Qui vient ? » (counts, then names grouped by answer, with
  « via lien » left to the coach in Part 3); on a match, the meeting timeline.
- **Ladder:** `error → loading → empty → data`. A 404 renders the dead-link state (« Ce lien n'est
  plus actif. Demandez le nouveau lien à votre coach. »), any other error `QueryError`. Empty is
  « Aucun événement dans les 14 prochains jours ».
- **Feedback:** the highlighted button is the success feedback. A failure gets a `toast()`; a
  `GUEST_RSVP_CLOSED` gets its own wording (« Les réponses sont closes pour cet événement. »).
- **Nudge:** a dismissible `Card` after the first answer of the session, copy from the design doc.
  « Demander mon invitation » calls `invite-request` and then always shows « Demande envoyée à
  votre coach », whatever the server did. « J'ai déjà un compte » links to `/login`. Never a modal.

## 4. Reuse, by extraction

The event page's pieces are wired to authenticated hooks and `TeamEvent`, so each is split into a
presentational part the guest page also uses. Behaviour and existing tests are unchanged.

- `EventRsvpControl` → `RsvpAnswerButtons` (the group, icons, tooltips, pending spinner).
- `EventMatchTimeline` → `MatchTimelineSteps` (the three steps and itinerary links).
- `EventTravelModeControl` → `TravelModeChoice` (the two radio cards).
- `countEventRoster` takes the three fields it reads (`convoked`, `rsvpStatus`, `travelMode`), not
  the whole `EventRosterRow`, so a guest attendance list feeds it directly.

## 5. Tests

Vitest + MSW: the picker persisting and « Ce n'est pas moi ? » clearing it (and a stale stored id
being ignored); answering, changing and clearing; travel choice shown only for `GOING` on a match
with a meeting point; the convoked badge; « Qui vient ? » counts; the dead-link state; the
`error → loading → empty → data` ladder; the closed-event toast and refetch; the nudge's constant
confirmation; the noindex meta tags. The extracted components keep their existing tests.

Screenshots: picker, agenda with a match and a training, dead link, nudge (mock API fixture
`scripts/fixtures/guest-rsvp.json`).
