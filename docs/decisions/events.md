# Events

Rules live in `CLAUDE.md` (« Events module », « Notifications module »). This is the reasoning.

## Types and recurrence

- **An opponent is a label, never a `Team`/`Club`.** Kluvo manages its clubs' own graph; the team
  across the court is outside it by construction. `opponentName` and `venue` are required for a
  MATCH and forced to null for a TRAINING, validated in the service even though the DTO also says so
  (cross-field rules are re-checked server side).
- A recurring create materialises one independent row per week (cap 104) sharing a `recurrenceId`.
  Rows created before series existed keep `recurrenceId: null`: inventing a shared id for them
  would be fiction, so `scope !== 'THIS'` on them is a 400.
- **Scopes are anchored on the row the user is looking at** (`THIS`, `THIS_AND_FUTURE`, `ALL`).
  A « from today » scope keyed on wall-clock time was rejected: the same click would mean different
  things depending on when the request is processed.
- **Bulk date shifting is cut** (holidays, manually moved occurrences). The one cheap corner,
  moving the time of day while each row keeps its date, is its own route.
- **Series live in Europe/Paris wall-clock time.** There is no per-club timezone, so weeks are
  stepped and the bulk time of day is resolved in Paris time per row (`server/src/common/paris-time.ts`).
  Stepping 7 × 24 h in UTC, or applying one UTC hour to every row, put every occurrence after a
  DST change an hour off (fixed in #329, with a data migration realigning stored series).
- `createEvent` and `updateEvent` always return arrays, so a scoped update has one shape.
- The delete-scope choice sits inside a confirm dialog: a scope picked inline next to « Supprimer »
  could be applied by a stray click on an irreversible action.

## RSVP and convocations

- Both are keyed on `TeamPlayer` (the roster slot), not `Player`: the same person on two teams
  answers per team. No row means « no answer » / « not called up »; no fourth enum value.
- **RSVP is self-service only**, resolved from the caller, never from a body id. A manager setting
  someone's attendance is a different feature (attendance taking) and is not built.
- **No per-event counts on list payloads.** The agenda loads up to 100 rows; a `groupBy` per list
  fetch costs more than it is worth. Rosters are fetched lazily when a breakdown opens; counts are
  derived client side. (`rsvpSummary` on `TeamEvent` was later added for the agenda, computed in one
  bounded query per batch.)
- **Convocation and RSVP are independent.** Convoking never gates, hides or fills an answer; both
  types (training and match) can carry a call-up; each occurrence has its own list.
- The convocation write is a **full replace** (a coach fills the whole sheet), which is why its
  notifications diff the previous list (see `notifications.md`).

## Match day: logistics and the MVP vote

- Jerseys and balls are two nullable columns on `Event` (`SetNull` on the roster slot), not a
  table: at most one assignee per item. They apply to trainings too; the jersey line reads
  « Chasubles » on a training.
- Any rostered member assigns or clears **themself**; touching someone else's slot needs manager
  rights (`isTeamManager`, the same check `TeamManagerGuard` uses, extracted so guard and service
  share it).
- **Vote rules, all enforced by the server:**
  - only a player both convoked and `GOING` may vote, never for themself;
  - the window is kick-off + 1 h to kick-off + 5 days (`server/src/common/vote-window.ts`); the
    client's `app/src/clubs/voteWindow.ts` mirrors those exact values so a badge never promises a
    vote the server refuses (keep the two in step, or move them to `@basketeasy/types`);
  - voting is anonymous: `voterTeamPlayerId` is never selected into any response;
  - results are hidden until the reader casts their own BEST vote, and public to everyone once the
    window closes; the vote section itself is hidden from readers who can't vote until then;
  - the second category is labelled « Joueur en difficulté », never « Pire joueur », and appears
    only in the match page's vote section (never a home, list, summary or notification). Whether
    minors' teams should see it at all is an open product question.
- A scoresheet can be uploaded by any rostered member (whoever is still at the gym), as one plain
  file input: desktop browsers have no camera capture and mobile ones are unreliable, so there is
  no device branch.

## Agenda

- The agenda shows « À venir » from today 00:00 ascending and « Passés » before it, newest first.
  An event later today is upcoming. The Liste view is the paginated escape hatch for deep history.
- No month grid: a player asks « what's next and am I in it », a grid answers a planner's question
  (see `../personas.md`).

## Manual venue

- `Event.location` stays the address (geocoded, hashed into the route key, linked by
  « Itinéraire »); `locationName` is the optional gym label. Every display goes through
  `eventVenueLabel`.
- **Last write wins against the FFBB import, deliberately.** No « manual » flag: the pain was a
  missing venue, not a wrong one. A manually filled match is also read later by the import's venue
  budget, which softens the downside. Revisit with a flag if wrong FFBB venues turn out common.
- `EventEditModal` re-sends `location` on every save, so the placeholder « Lieu non communiqué »
  is refused only when a manager **changes to** it. A new address without a name clears the old
  name (it described the old address).
- « Changement de salle » fires only when a known address of an upcoming MATCH moves to another
  (`isSameEventLocation`), to convoked and `GOING` players, one message per reader for a series.
  Filling in the placeholder, a name-only edit, a training and the import stay silent. The dialog
  counts recipients from the roster with the same rule, hidden while loading, never a guessed 0.
- The address is required in both forms; the gym name is required only in the venue dialog,
  because hand-made trainings have free-text locations that a stricter shared schema would break.

## Open

- An RSVP deadline (« réponse attendue avant vendredi 20h ») has no column yet.
- Scheduled RSVP reminders to non-responders (« Relancer les sans-réponse ») are not built.
