# Event types (training/match), opponent teams, and recurring-series scope

Status: draft (loop 0)
Date: 2026-08-11

## Why

The Events module (`server/src/events`, see `CLAUDE.md`'s Events module section) ships plain
CRUD only: every `Event` reads as a generic team-day event, and a recurring series is
materialized as independent rows with no link back to each other — "editing/deleting one
occurrence never touches the others" was called out as a deliberate, temporary cut. Two of
the section's explicitly-planned "next steps" are now the work:

1. A `type` field to distinguish training from match events (next-step #3 in `CLAUDE.md`).
2. Series-level edit/delete for recurring events (next-step #4).

Alongside (1), a match needs an opponent: the team on the other side of the scoresheet, who
is by definition **not** a club this app manages (see `docs/brand.md` — BasketEasy manages
Loire-Atlantique clubs' own rosters/teams, not the wider league). So this is a free-text
label, not a `Team`/`Club` relation.

## Scope

**In scope:**

- `Event.type: TRAINING | MATCH`, required on create, editable after.
- `Event.opponentName: String?` — required when `type` is (or becomes) `MATCH`, forced to
  `null` when `type` is `TRAINING`. Plain text (e.g. "US Saint-Nazaire") — no entity, no
  club/team link, since the opponent is explicitly outside the club graph.
- `Event.recurrenceId: String?` — a fresh UUID shared by every occurrence created in one
  `POST .../events` call that included a `recurrence` block. A single (non-recurring) event
  keeps `recurrenceId: null`, same as today's "no series link" behavior — this is additive,
  not a retrofit onto existing single events.
- Series-scoped update/delete: `PATCH`/`DELETE .../events/:eventId` gain an `EventUpdateScope`
  (`THIS` | `THIS_AND_FUTURE` | `ALL`), defaulting to `THIS` (today's per-occurrence
  behavior, unchanged for anyone not opting in). `THIS_AND_FUTURE`/`ALL` resolve against the
  target event's `recurrenceId` and, for `THIS_AND_FUTURE`, its `startsAt`.

**Out of scope (explicitly deferred, don't build speculatively):**

- Bulk date/time shifting. `startsAt` can only be changed with `scope: 'THIS'` — shifting
  every occurrence's date at once means recomputing a whole series (what if occurrences
  fall on a holiday? what happens to a manually-moved occurrence mid-series?) and is a
  separate feature, not a corollary of this one. `PATCH` with `scope !== 'THIS'` and
  `startsAt` set is rejected with `400`.
- A fourth "all events from today" scope keyed off wall-clock time. The task prompt that
  seeded this spec mentions it as an example; it's dropped in favor of `THIS_AND_FUTURE`,
  which already gives that exact result when the user acts on the next upcoming occurrence
  (the common case) and additionally works from _any_ occurrence in the series, not just
  "today". A `now()`-anchored scope would behave differently depending purely on when the
  request happens to be processed rather than which row the user is looking at — a strictly
  worse, less predictable version of the same feature.
- RSVP/convocations, a `type`-driven permissions split ("only coaches see match events"),
  fair-playing-time tracking off `type: MATCH` — all still deferred per `CLAUDE.md`'s
  existing "next steps" list; this spec only turns items (3) and (4) from planned into built.
- Opponent-team-as-entity (a lightweight cross-club directory, opponent match history,
  etc.) — the P1 CTC multi-club model in the Teams module is for clubs BasketEasy manages;
  an opponent is outside that by construction, so it stays a label.

## Data model (Prisma)

```prisma
enum EventType {
  TRAINING
  MATCH
}

model Event {
  id           String    @id @default(uuid())
  teamId       String
  type         EventType @default(TRAINING)
  startsAt     DateTime
  location     String
  notes        String?
  opponentName String?
  recurrenceId String?
  createdAt    DateTime  @default(now())
  team         Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@index([teamId])
  @@index([recurrenceId])
}
```

`type` defaults to `TRAINING` so the migration backfills every existing row without a data
pass. `recurrenceId` stays `null` for existing rows — they were all created one occurrence
at a time under the current code, so there is no real series to reconstruct; backdating a
shared id for them would be fiction, and `scope !== 'THIS'` on a `recurrenceId: null` event
correctly 400s (see below) rather than silently doing nothing.

## Service logic (`EventsService`)

`createEvent`:

- Requires `type`. If `type === 'MATCH'`, requires `opponentName` (`BadRequestException` if
  missing/blank) — same "validate the actual constraint in the service, not just the DTO"
  pattern already used for `TeamsService.addTeamPlayer`'s club-link check, since the
  MATCH-needs-opponent rule is a cross-field constraint the DTO alone can express but the
  service must still enforce defensively.
- When `data.recurrence` is present, generates one `recurrenceId = randomUUID()` and stamps
  every occurrence in the batch with it (mirrors `buildOccurrences`, which already runs once
  per call and produces every row in one `$transaction`). Without `recurrence`, every created
  row keeps `recurrenceId: null`.

`updateEvent(clubId, teamId, eventId, data)`, `data` now also carries `type?`,
`opponentName?`, `scope?: EventUpdateScope`:

- Fetches the target event first (`assertEventInTeam` now returns the row instead of just
  verifying it exists, since scope resolution needs `recurrenceId`/`startsAt`/current `type`).
- `scope` defaults to `'THIS'`.
- `scope !== 'THIS'` and the event's `recurrenceId` is `null` → `400`: "Cet événement ne fait
  pas partie d'une série récurrente."
- `scope !== 'THIS'` and `data.startsAt !== undefined` → `400` (see Scope cuts above).
- Resulting `type` is `data.type ?? event.type`. If that's `'MATCH'`, the resulting
  `opponentName` (`data.opponentName` if provided, else the event's current value) must be
  non-empty, else `400`. If the resulting `type` is `'TRAINING'`, `opponentName` is forced to
  `null` regardless of what was passed (switching a match back to a training clears the
  opponent — there's nothing sensible to keep it for).
- Resolves the target row id set: `[eventId]` for `THIS`; for `THIS_AND_FUTURE`/`ALL`, queries
  `Event` by `teamId` + `recurrenceId` (+ `startsAt >= event.startsAt` for
  `THIS_AND_FUTURE` only), then applies the same field diff to every row in one
  `$transaction` (mirrors `createEvent`'s existing transactional-batch pattern).
- **Return type changes to `TeamEvent[]`** (was `TeamEvent`) — for consistency with
  `createEvent`, which already "returns `TeamEvent[]`, always an array, even for a single
  non-recurring event" per `CLAUDE.md`. A scoped update is the same shape of operation
  (an array of affected rows, arity 1 in the common case), so the API is more predictable if
  update follows the same rule rather than returning a bare object for `THIS` and an array
  everywhere else.

`deleteEvent(clubId, teamId, eventId, scope?)`:

- Same scope resolution and the same `recurrenceId: null` + `scope !== 'THIS'` → `400` guard
  as `updateEvent`.
- Deletes the resolved id set with one `deleteMany({ where: { id: { in: ids } } })` rather than
  `MAX_RECURRING_OCCURRENCES` individual deletes.
- Return type unchanged (`void`/204) — a delete has no "affected rows" payload to shape either
  way, so there's no equivalent inconsistency to fix.

## API surface

| Method | Path                  | Guard                         | Notes                                                                              |
| ------ | --------------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| POST   | `.../events`          | `TeamManagerGuard`            | body gains required `type`, optional `opponentName` (required if MATCH)            |
| PATCH  | `.../events/:eventId` | `TeamManagerGuard`            | body gains optional `type`, `opponentName`, `scope`; **now returns `TeamEvent[]`** |
| DELETE | `.../events/:eventId` | `TeamManagerGuard`            | gains optional `?scope=` query param                                               |
| GET    | `.../events`          | `ClubRoles('ADMIN','MEMBER')` | response items gain `type`, `opponentName`, `recurrenceId` — unchanged otherwise   |

## Shared types (`packages/@basketeasy/types/events.ts`)

```typescript
export type EventType = 'TRAINING' | 'MATCH';
export type EventUpdateScope = 'THIS' | 'THIS_AND_FUTURE' | 'ALL';

export interface TeamEvent {
  id: string;
  teamId: string;
  type: EventType;
  startsAt: string;
  location: string;
  notes: string | null;
  opponentName: string | null;
  recurrenceId: string | null;
  createdAt: string;
}

export interface CreateEventRequest {
  type: EventType;
  startsAt: string;
  location: string;
  notes?: string;
  opponentName?: string;
  recurrence?: EventRecurrenceRequest;
}

export interface UpdateEventRequest {
  type?: EventType;
  startsAt?: string;
  location?: string;
  notes?: string;
  opponentName?: string;
  scope?: EventUpdateScope;
}
```

`EventRecurrenceRequest`/`EventRecurrenceFrequency`/`ListEventsParams` are unchanged.

## Frontend

`app/src/clubs/` gets the same one-file-per-concern treatment as the rest of the module:

- New `eventLabels.ts`: `EVENT_TYPE_OPTIONS` (`TRAINING` → "Entraînement", `MATCH` → "Match")
  and `EVENT_UPDATE_SCOPE_OPTIONS` (`THIS` → "Cet événement uniquement", `THIS_AND_FUTURE` →
  "Cet événement et les suivants", `ALL` → "Tous les événements de la série") with their
  `xLabel()` lookup helpers, mirroring `teamLabels.ts`.
- `EventCreateForm.tsx`: a type select (defaults `TRAINING`) and, only when `type === 'MATCH'`,
  an "Adversaire" text field — same conditional-field pattern the form already uses for
  `isRecurring` → `recurrenceUntil`. Zod schema's `.refine()` gains the opponent-required-for-
  match rule alongside the existing recurrence-until rule.
- `EventRow.tsx`:
  - Read view gains a type badge and, for `MATCH`, "vs {opponentName}".
  - Edit view gains the same type-select/opponent-field pair as the create form.
  - When `event.recurrenceId` is set, both the edit-save and the delete action get an
    `EVENT_UPDATE_SCOPE_OPTIONS` select (defaulting to `THIS`) rendered next to the button —
    no confirmation modal, matching the row-level action pattern already used elsewhere in
    this module (e.g. `TeamAdminRow`'s "Retirer" has none either). When scope is not `THIS`,
    the `startsAt` input is disabled with a short inline note, mirroring the 400 the backend
    would otherwise return.
  - When `event.recurrenceId` is `null` (a plain single event), no scope select renders —
    same single-occurrence UX as today.
- `useEventUpdate.ts`: return type follows the service change (`TeamEvent[]`); mutation input
  gains `scope` passed straight through in the body.
- `useEventDelete.ts`: mutation input becomes `{ eventId, scope? }`; scope is appended as a
  `?scope=` query string (the `apiClient.delete` helper takes no params argument, so this is
  built inline the same way `EventRow` already builds its own URLs elsewhere in the module).

## Addendum (loop 1): bulk hour-of-day update

The "bulk date/time shifting" cut above is unchanged for full date+time replacement — that's
still a separate, un-built feature for the reasons given (holiday-shifted occurrences,
manually-moved mid-series occurrences, etc.). What's now built is a narrower operation a user
asked for directly: bulk-changing just the **time-of-day** across a series while every
occurrence keeps its own date. That's a strictly smaller problem than full date shifting —
there's no "what if it lands on a holiday" question when the date never moves — so it doesn't
reopen the original cut, it fills in the one corner of it that was cheap and unambiguous.

- New endpoint `PATCH .../events/:eventId/time` (`EventsController.updateEventTime` →
  `EventsService.updateEventTimeOfDay`), guarded the same as the sibling `PATCH`
  (`TeamManagerGuard`). Body: `UpdateEventTimeOfDayRequest` — `scope: 'THIS_AND_FUTURE' | 'ALL'`
  (no `'THIS'`; a single event doesn't need a bulk endpoint), `hour: number` (0-23),
  `minute: number` (0-59), both UTC.
- `updateEventTimeOfDay` reuses `assertEventInTeam` and the existing private `resolveScopeIds`
  verbatim — same 400 for a non-recurring anchor event as `updateEvent`/`deleteEvent` already
  throw. It does **not** touch `updateEvent`'s existing `scope !== 'THIS' && startsAt !== undefined`
  guard; that guard still protects the full-replace path and this is a deliberately separate
  method/route, not a relaxation of it.
- No timezone table was added. `startsAt` is still a naive UTC-instant `TIMESTAMP(3)` with no
  per-club/team zone anywhere in the schema, matching every other date in this app. The
  frontend resolves the user's chosen local wall-clock time against the _anchor_ event's own
  calendar date (correct DST for that one reference point) and sends a single resulting UTC
  `hour`/`minute`; the server applies that same pair to every row in scope via `setUTCHours`,
  preserving each row's own date. Occurrences that fall on the other side of a DST transition
  from the anchor can end up an hour off from the intended local wall-clock time — an accepted,
  documented limitation rather than new timezone infrastructure, consistent with how the rest
  of the app already treats time.
- Frontend: `EventRow`'s edit action moved from an inline table-row edit into a `Dialog`-based
  `EventEditModal` (RHF + zod, mirroring `EventCreateForm`'s existing convention — see
  CLAUDE.md's new "Modals vs. inline editing" guidance for why this one crossed the inline→modal
  threshold while the delete-scope selector didn't). Selecting a non-`THIS` scope in that modal
  swaps the datetime-local field for a time-only field and, on submit, calls the new `/time`
  endpoint in addition to the regular field update (type/location/notes/opponent still broadcast
  across scope via the existing `PATCH .../events/:eventId`, unchanged).

## Testing

Same split as the rest of the codebase: Jest `*.spec.ts` for `EventsService`/
`EventsController` (new cases: type/opponent validation, recurrenceId stamping, each scope
value on update and delete, the two 400 guards); Vitest/RTL `*.test.ts(x)` for
`EventCreateForm`, `EventRow`, `useEventUpdate`, `useEventDelete`. No new E2E harness.
