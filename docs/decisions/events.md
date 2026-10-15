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

## Jersey wash rotation

After a match someone takes the team's jersey set home, washes it and brings it back to the
**next** match. The rotation replaces the plain « qui apporte » slot on a MATCH. Chasubles
(TRAINING) and balls keep today's behaviour. One `EventJerseyDuty` row per MATCH, 1-1 like
`EventMeeting`; `EventJerseyDecline` remembers who said « je ne peux pas » for one match.

| #   | Decision                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The duty is the wash **after** the match. « Maillots apportés par X » on match N is derived: X holds the previous MATCH's non-voided duty. Nothing about « apporte » is stored for a MATCH any more.                                                                                                                                            |
| 2   | Order (the suggestion): fewest turns this season, then longest since the last turn (never washed first), then last name, first name, then `TeamPlayer.id` so the order is total. No jersey number is stored.                                                                                                                                    |
| 3   | Pool: convoked **and** `GOING`, not exempted (`TeamPlayer.jerseyDutyExempt`), no decline for this match. An empty pool gives « Aucune suggestion », never a fallback on the roster.                                                                                                                                                             |
| 4   | A counted turn: whoever holds the duty at kickoff, accepted or not, on a started MATCH of the team, inside the 1 September → 31 August season, not voided. Declines before kickoff never count.                                                                                                                                                 |
| 5   | Only the team's **next** MATCH gets a suggestion; a later match without a holder reads « Suggestion après le match du … », otherwise two upcoming matches would propose the same person.                                                                                                                                                        |
| 6   | Suggestions are **computed on read, never stored**. Only an acceptance, a manager write, a swap or the kickoff freeze writes a row; a `GET` writes nothing.                                                                                                                                                                                     |
| 7   | **No holder before kickoff means no row.** A decline, or a manager clearing before kickoff, deletes the row (the pending swap goes with it). After kickoff a clear keeps the row with `teamPlayerId: null`.                                                                                                                                     |
| 8   | The freeze job (`jersey-duty-freeze`, every 10 min) selects « no row », so a match a manager cleared after kickoff is never re-assigned. A match with an empty pool gets a holder-less `SUGGESTION` row, so it is not re-evaluated every run and cannot starve the batch. `createMany({ skipDuplicates })` lets a concurrent manager write win. |
| 9   | Between kickoff and the next freeze tick the just-played match has no row, so the next suggestion is computed without that turn. Accepted: a second code path is not worth ten minutes.                                                                                                                                                         |
| 10  | A swap is proposed to a **player**; proposing implies taking the duty (the proposer stays responsible until the target accepts). One pending swap at a time; the first answer wins (conditional `updateMany`).                                                                                                                                  |
| 11  | A team manager can assign any roster member at any time (pool and exemption not required), clear, mark « Fait », void a turn. Every player-side write is `409 JERSEY_DUTY_LOCKED` once the match has started.                                                                                                                                   |
| 12  | `Team.jerseyRotationEnabled` (default on). Off: a MATCH keeps `Event.jerseysTeamPlayerId` exactly as before, `jerseyDuty` is null, every duty route answers `409 JERSEY_ROTATION_DISABLED`, the freeze skips it.                                                                                                                                |
| 13  | Fairness is per player, per team, per season: no sibling merge, no cross-team rule. A playing parent is a separate unit with their own count.                                                                                                                                                                                                   |
| 14  | A guardian acts for the child (`?forPlayerId=`, `resolveActingTeamPlayer`). `acceptedByUserId` is the caller, never the persona, and shows as first name + last initial (« Accepté par Sophie M. »).                                                                                                                                            |

Corrections to the design, found in the code:

- The exemption rides the existing roster route, `PATCH .../players/:playerId`, keyed by
  `Player.id`, not a `TeamPlayer.id`. `role` and `jerseyDutyExempt` are both optional there, at
  least one required (400).
- `jerseyRotationEnabled` rides `PATCH .../teams/:teamId` (`UpdateTeamRequest`).
- `seasonYearFor`/`seasonWindow` moved to `server/src/common/season.ts`: Events must not import a
  sibling module's service file.
- `MyAgendaEvent` does **not** gain `jerseyDuty`: it has no reader on the dashboard. `TeamEvent`
  does, and forces `logistics.jerseys` to null on a MATCH of a rotation-on team so a value set
  while the rotation was off never shows beside the duty. `PATCH .../logistics` with `JERSEYS` on
  such a match answers `400 USE_JERSEY_DUTY`.
- The RGPD export reads the person's duty rows (`JERSEY_WASH`, with status and who accepted, never
  by name). `doneBy`/`voidedBy` are a manager's acts on someone else's turn and are left out
  (art. 15(4)), named in the bundle's `notice`.
- A removed roster entry takes its turns on matches not yet started with it, so the next
  suggestion moves on; played ones are left to `SetNull` (« Aucun », the turn stops counting).
- **The team page shows it as its own « Maillots » tab, not a section of the page.** `TeamDetailPage`
  is a hero over `?tab=` tabs and has no tab-free area. The tab is the manager's always (the
  rotation switch lives there) and the team's only while `Team.jerseyRotationEnabled`. The overview
  names peers « Prénom N. » and shows that someone is « Exemptée » but never why; the exemption is
  a manager-set flag on the roster entry, not something a player or guardian can change.

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
