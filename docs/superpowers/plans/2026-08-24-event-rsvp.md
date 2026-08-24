# Event RSVP Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Implement task by
> task, in order — later tasks depend on earlier ones (schema → types → DTOs → service →
> controller → frontend → docs).

**Goal:** Let a rostered team member set their own attendance status (`GOING` / `NOT_GOING` /
`MAYBE`) on a team event and clear it, and let anyone who can see the event view the full
roster's response breakdown.

**Spec:** [`docs/superpowers/specs/2026-08-24-event-rsvp-design.md`](../specs/2026-08-24-event-rsvp-design.md)
— read it first for full rationale (why self-service only, why no per-event aggregate on
`TeamEvent`, why status is keyed on `TeamPlayer` not `Player`). This plan only repeats what's
needed to implement each task.

**Architecture:** Extends the existing `server/src/events` module in place — no new module, no
new guard. Frontend follows `app/src/clubs`'s one-file-per-concern convention (`eventLabels.ts`
→ new `eventRsvpLabels.ts`).

**Tech stack:** no new dependencies.

**Sandbox note:** no live Postgres is reachable in this environment (`docker compose up` fails
— no docker daemon). The migration SQL is hand-written to match Prisma's generated style
instead of `prisma migrate dev`; `prisma generate` (schema-only, no DB connection) is used to
regenerate the client after every schema edit so the rest of the build type-checks.

## Global Constraints

- TypeScript strict mode, Prettier, ESLint per package — per root `CLAUDE.md`.
- Jest for `server` (`*.spec.ts`), Vitest + RTL for `app` (`*.test.ts(x)`).
- Shared shapes go in `packages/@basketeasy/types` first, mirrored by backend DTOs.
- RSVP is self-service only — a caller can only ever mutate their own `TeamPlayer` row's
  status, resolved server-side from `player.userId`, never from a `teamPlayerId` in the
  request body. Don't add a manager-sets-on-behalf-of-a-player path — see spec's Scope.
- Don't add `rsvpCounts` (or any per-event aggregate) to `TeamEvent` — counts are derived
  client-side from the roster-breakdown response. See spec's Scope for why.
- `myRsvpStatus` must be resolved via `resolveMyRsvpStatuses` (≤2 queries per call), never one
  query per event.

---

## File Structure

```
server/
  prisma/schema.prisma                                              # modify
  prisma/migrations/20260824000000_add_event_rsvp/migration.sql     # new, hand-written
  src/
    events/
      events.service.ts                                             # modify
      events.service.spec.ts                                        # modify
      events.controller.ts                                          # modify
      events.controller.spec.ts                                     # modify
      dto/
        set-event-rsvp.dto.ts                                       # new

packages/@basketeasy/types/
  events.ts                                                         # modify

app/
  src/
    clubs/
      queryKeys.ts                                                  # modify
      eventRsvpLabels.ts                                            # new
      eventRsvpLabels.test.ts                                       # new
      useEventRsvpSet.ts                                            # new
      useEventRsvpSet.test.ts                                       # new
      useEventRsvpClear.ts                                          # new
      useEventRsvpClear.test.ts                                     # new
      useEventRsvps.ts                                              # new
      useEventRsvps.test.ts                                         # new
      EventRsvpControl.tsx                                          # new
      EventRsvpControl.test.tsx                                     # new
      EventRsvpBreakdown.tsx                                        # new
      EventRsvpBreakdown.test.tsx                                   # new
      EventRow.tsx                                                  # modify
      EventRow.test.tsx                                             # modify
      TeamEventsAgenda.tsx                                          # modify
      TeamEventsAgenda.test.tsx                                     # modify
      useEventCreate.test.ts                                        # modify (fixture payload)
      useEventUpdate.test.ts                                        # modify (fixture payload)
      useEventDelete.test.ts                                        # modify (fixture payload)
      useEventTimeUpdate.test.ts                                    # modify (fixture payload)
      useEventList.test.ts                                          # modify (fixture payload, if present)
    pages/
      TeamDetailPage.tsx                                            # modify
      TeamDetailPage.test.tsx                                       # modify

CLAUDE.md                                                            # modify — Events module section
```

---

## Task 1: Prisma schema — `EventRsvpStatus`, `EventRsvp`

**Files:**

- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260824000000_add_event_rsvp/migration.sql`

- [ ] **Step 1: Edit `schema.prisma`** — add the enum + model, and the two back-relations:

```prisma
enum EventRsvpStatus {
  GOING
  NOT_GOING
  MAYBE
}

model EventRsvp {
  id           String          @id @default(uuid())
  eventId      String
  teamPlayerId String
  status       EventRsvpStatus
  respondedAt  DateTime        @default(now())
  event        Event           @relation(fields: [eventId], references: [id], onDelete: Cascade)
  teamPlayer   TeamPlayer      @relation(fields: [teamPlayerId], references: [id], onDelete: Cascade)

  @@unique([eventId, teamPlayerId])
  @@index([eventId])
}
```

Add `rsvps EventRsvp[]` to `model Event` and to `model TeamPlayer`.

- [ ] **Step 2: Hand-write the migration SQL:**

```sql
-- CreateEnum
CREATE TYPE "EventRsvpStatus" AS ENUM ('GOING', 'NOT_GOING', 'MAYBE');

-- CreateTable
CREATE TABLE "EventRsvp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamPlayerId" TEXT NOT NULL,
    "status" "EventRsvpStatus" NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventRsvp_eventId_teamPlayerId_key" ON "EventRsvp"("eventId", "teamPlayerId");

-- CreateIndex
CREATE INDEX "EventRsvp_eventId_idx" ON "EventRsvp"("eventId");

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_teamPlayerId_fkey" FOREIGN KEY ("teamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Regenerate the Prisma client (schema-only, no DB needed):**

```bash
pnpm --filter @basketeasy/server exec prisma generate
```

- [ ] **Step 4: Commit:**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(server): add EventRsvp model to schema"
```

---

## Task 2: Shared types

**Files:** Modify `packages/@basketeasy/types/events.ts`

- [ ] Add `EventRsvpStatus`, `SetEventRsvpRequest`, `EventRsvpRosterEntry` (importing
      `TeamMemberRole` from `./teams`); add `myRsvpStatus: EventRsvpStatus | null` to
      `TeamEvent`, exactly as laid out in the spec's "Shared types" section.
- [ ] Verify + commit:

```bash
pnpm --filter @basketeasy/types build
git add packages/@basketeasy/types/events.ts
git commit -m "feat(types): add EventRsvpStatus, SetEventRsvpRequest, EventRsvpRosterEntry"
```

---

## Task 3: Backend DTO

**Files:** Create `server/src/events/dto/set-event-rsvp.dto.ts`

- [ ] `SetEventRsvpDto`: `status` (`@IsEnum(EventRsvpStatus)`, required).
- [ ] Verify + commit:

```bash
pnpm --filter @basketeasy/server exec tsc --noEmit -p tsconfig.json
git add server/src/events/dto/set-event-rsvp.dto.ts
git commit -m "feat(server): DTO for setting an event RSVP status"
```

---

## Task 4: `EventsService`

**Files:** Modify `events.service.ts`, `events.service.spec.ts`

- [ ] **Step 1: Update existing tests' fixtures** — every `listEvents`/`createEvent`/
      `updateEvent`/`updateEventTimeOfDay` test needs to account for the new `userId` param
      and the resulting `myRsvpStatus` field on returned events (mock `teamPlayer.findFirst`
      and `eventRsvp.findMany` as needed; assert `myRsvpStatus: null` for the common
      not-rostered-caller case, and a populated value for a rostered-caller case).
- [ ] **Step 2: Add failing tests** for:
  - `setMyRsvp` upserts an `EventRsvp` row for the caller's own `TeamPlayer` and returns the
    event with `myRsvpStatus` reflecting it.
  - `setMyRsvp` throws `ForbiddenException` when the caller has no `TeamPlayer` row on the
    team.
  - `setMyRsvp` called twice with different statuses updates (not duplicates) the row, per the
    `@@unique([eventId, teamPlayerId])` upsert.
  - `clearMyRsvp` deletes the caller's row and returns the event with `myRsvpStatus: null`.
  - `clearMyRsvp` throws `ForbiddenException` when the caller has no `TeamPlayer` row (same
    guard as `setMyRsvp`).
  - `listEventRsvps` returns one entry per roster member (not just responders), `status: null`
    for anyone who hasn't answered, and `isMe: true` only for the entry matching the caller's
    own `userId`.
  - `resolveMyRsvpStatuses` (exercised indirectly via `listEvents`) issues at most two Prisma
    calls regardless of how many events are in the result page — assert via the mocked
    `prisma.teamPlayer.findFirst`/`prisma.eventRsvp.findMany` call counts, not per-event.
- [ ] **Step 3: Run tests, confirm they fail** (`pnpm --filter @basketeasy/server test -- events.service.spec.ts`).
- [ ] **Step 4: Implement**, per the spec's "Service logic" section:
  - `findMyTeamPlayer(teamId, userId)` private helper.
  - `resolveMyRsvpStatuses(teamId, userId, eventIds)` private helper (two queries, returns a
    `Map<eventId, EventRsvpStatus>`).
  - `toTeamEvent(event, myStatus)` — add the `myRsvpStatus` param, threaded from each call
    site's own `resolveMyRsvpStatuses` lookup.
  - `listEvents(clubId, teamId, query, userId)` — after fetching `events`, call
    `resolveMyRsvpStatuses(teamId, userId, events.map(e => e.id))` once, then map each row
    through `toTeamEvent(e, statuses.get(e.id) ?? null)`.
  - `createEvent(..., userId)` / `updateEvent(..., userId)` / `updateEventTimeOfDay(..., userId)`
    — same pattern: resolve once for the batch of ids just created/updated, then map.
  - `getEventForUser(clubId, teamId, eventId, userId)` — fetches the single event row (via
    `assertEventInTeam`) and returns it through `toTeamEvent` with a one-event
    `resolveMyRsvpStatuses` lookup; used by `setMyRsvp`/`clearMyRsvp` to return the refreshed
    `TeamEvent`.
  - `setMyRsvp`/`clearMyRsvp`/`listEventRsvps` exactly as in the spec.
- [ ] **Step 5: Run tests, confirm pass, then commit:**

```bash
pnpm --filter @basketeasy/server test -- events.service.spec.ts
git add server/src/events/events.service.ts server/src/events/events.service.spec.ts
git commit -m "feat(server): EventsService RSVP set/clear/list and myRsvpStatus"
```

---

## Task 5: `EventsController`

**Files:** Modify `events.controller.ts`, `events.controller.spec.ts`

- [ ] Add `@CurrentUser() user: RequestUser` to `listEvents`, `createEvent`, `updateEvent`,
      `updateEventTime`, and thread `user.id` through to each service call.
- [ ] New routes, all guarded with `@UseGuards(ClubRolesGuard) @ClubRoles('ADMIN', 'MEMBER')`
      (matching `listEvents`'s existing guard):
  - `PATCH :eventId/rsvp` → `SetEventRsvpDto` body → `eventsService.setMyRsvp(clubId, teamId, eventId, user.id, dto.status)`.
  - `DELETE :eventId/rsvp` (`@HttpCode(HttpStatus.OK)` since it returns the refreshed
    `TeamEvent`, not 204 — unlike the plain event delete, the caller needs the updated
    `myRsvpStatus` back) → `eventsService.clearMyRsvp(clubId, teamId, eventId, user.id)`.
  - `GET :eventId/rsvps` → `eventsService.listEventRsvps(clubId, teamId, eventId, user.id)`.
- [ ] Update the controller spec's mocks/assertions for the new `userId` args on the four
      existing delegations, and add delegation tests for the three new routes.
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/server test -- events.controller.spec.ts
git add server/src/events/events.controller.ts server/src/events/events.controller.spec.ts
git commit -m "feat(server): wire RSVP routes and myRsvpStatus through EventsController"
```

---

## Task 6: Frontend — labels, query key, hooks

**Files:** Create `eventRsvpLabels.ts` (+ test), modify `queryKeys.ts`, create
`useEventRsvpSet.ts`, `useEventRsvpClear.ts`, `useEventRsvps.ts` (+ tests)

- [ ] `eventRsvpLabels.ts`: `EVENT_RSVP_STATUS_OPTIONS`, `eventRsvpStatusLabel()`, mirroring
      `eventLabels.ts`'s shape.
- [ ] `queryKeys.ts`: add
      `eventRsvpsQueryKey = (clubId, teamId, eventId) => ['clubs', clubId, 'teams', teamId, 'events', eventId, 'rsvps'] as const`.
- [ ] `useEventRsvpSet.ts` — mutation `({ eventId, status }) => apiClient.patch<TeamEvent>(.../events/${eventId}/rsvp, { status })`;
      `onSuccess` invalidates `teamEventsQueryKey(clubId, teamId)` and
      `eventRsvpsQueryKey(clubId, teamId, eventId)`.
- [ ] `useEventRsvpClear.ts` — mutation `({ eventId }) => apiClient.delete<TeamEvent>(.../events/${eventId}/rsvp)`;
      same invalidation as above.
- [ ] `useEventRsvps.ts` — `useQuery({ queryKey: eventRsvpsQueryKey(...), queryFn: () => apiClient.get<EventRsvpRosterEntry[]>(...), enabled })`,
      `enabled` passed in by the caller (the breakdown panel only enables it once opened).
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/app test -- eventRsvp useEventRsvp
git add app/src/clubs/eventRsvpLabels.ts app/src/clubs/eventRsvpLabels.test.ts app/src/clubs/queryKeys.ts app/src/clubs/useEventRsvpSet.ts app/src/clubs/useEventRsvpSet.test.ts app/src/clubs/useEventRsvpClear.ts app/src/clubs/useEventRsvpClear.test.ts app/src/clubs/useEventRsvps.ts app/src/clubs/useEventRsvps.test.ts
git commit -m "feat(app): RSVP labels, query key, and hooks"
```

---

## Task 7: Frontend — `EventRsvpControl`, `EventRsvpBreakdown`

**Files:** Create `EventRsvpControl.tsx`, `EventRsvpBreakdown.tsx` (+ tests)

- [ ] `EventRsvpControl.tsx` — takes `clubId`, `teamId`, `event: TeamEvent`; renders three
      toggle buttons from `EVENT_RSVP_STATUS_OPTIONS`, highlighting the one matching
      `event.myRsvpStatus`; clicking the active one calls `useEventRsvpClear`, clicking another
      calls `useEventRsvpSet`. No `Dialog` — inline control per `CLAUDE.md`'s guidance (single
      field, low-risk, non-destructive, high-frequency).
- [ ] `EventRsvpBreakdown.tsx` — takes `clubId`, `teamId`, `eventId`; local `isOpen` state
      gating a "Voir les réponses" / "Masquer les réponses" toggle button; while open, calls
      `useEventRsvps(clubId, teamId, eventId, { enabled: isOpen })` and renders each entry
      (name, role badge, status or "En attente"), bolding the `isMe` row, plus a small counts
      line derived by reducing the fetched array client-side (`going`/`notGoing`/`maybe`/
      `pending` — `pending` is entries with `status: null`).
- [ ] Tests: `EventRsvpControl` covers set/clear/highlight-current-status; `EventRsvpBreakdown`
      covers the closed-by-default state, that opening triggers the fetch (not before), and
      the derived counts.
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/app test -- EventRsvpControl EventRsvpBreakdown
git add app/src/clubs/EventRsvpControl.tsx app/src/clubs/EventRsvpControl.test.tsx app/src/clubs/EventRsvpBreakdown.tsx app/src/clubs/EventRsvpBreakdown.test.tsx
git commit -m "feat(app): EventRsvpControl and EventRsvpBreakdown components"
```

---

## Task 8: Frontend — wire into `EventRow`, `TeamEventsAgenda`, `TeamDetailPage`

**Files:** Modify `EventRow.tsx`, `TeamEventsAgenda.tsx`, `TeamDetailPage.tsx` (+ their tests)

- [ ] `EventRow.tsx` / `TeamEventsAgenda.tsx`'s `AgendaEventCard`: accept a new `isRostered`
      prop; render `EventRsvpControl` when `isRostered` is true, and `EventRsvpBreakdown`
      unconditionally (visible to anyone who can see the row), alongside the existing
      `canManage`-gated edit/delete controls.
- [ ] `TeamDetailPage.tsx`: derive `isRostered` from the team-list entry already available via
      `useMyTeamList()` (`entry.rosterRole !== null` for the current `teamId`) — no new
      request — and pass it down to both the table and agenda renderings of the Événements
      tab.
- [ ] Update `EventRow.test.tsx`, `TeamEventsAgenda.test.tsx`, `TeamDetailPage.test.tsx` for the
      new prop/behavior (RSVP control shown only when rostered; breakdown always present).
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/app test -- EventRow TeamEventsAgenda TeamDetailPage
git add app/src/clubs/EventRow.tsx app/src/clubs/EventRow.test.tsx app/src/clubs/TeamEventsAgenda.tsx app/src/clubs/TeamEventsAgenda.test.tsx app/src/pages/TeamDetailPage.tsx app/src/pages/TeamDetailPage.test.tsx
git commit -m "feat(app): wire RSVP control and breakdown into event views"
```

---

## Task 9: Fixture updates for existing event hook tests

**Files:** `useEventCreate.test.ts`, `useEventUpdate.test.ts`, `useEventDelete.test.ts`,
`useEventTimeUpdate.test.ts`, `useEventList.test.ts` (if present) — modify only

- [ ] Add `myRsvpStatus: null` (or a specific value where the test cares) to every mocked
      `TeamEvent` fixture so these tests keep type-checking and passing against the extended
      shared type. No behavioral change to these hooks themselves.
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/app test -- useEvent
git add app/src/clubs/useEventCreate.test.ts app/src/clubs/useEventUpdate.test.ts app/src/clubs/useEventDelete.test.ts app/src/clubs/useEventTimeUpdate.test.ts
git commit -m "test(app): add myRsvpStatus to existing event fixtures"
```

---

## Task 10: Docs — `CLAUDE.md`

**Files:** Modify `CLAUDE.md`'s Events module section

- [ ] Document `EventRsvp`, the self-service `PATCH`/`DELETE .../events/:eventId/rsvp` routes,
      `GET .../events/:eventId/rsvps`, and `TeamEvent.myRsvpStatus`.
- [ ] Remove next-steps item (1) "RSVP..." from the "Next steps, in order" list (now built);
      renumber the remaining ones (convocations becomes (1), créneaux conflict detection
      becomes (2)).
- [ ] Commit:

```bash
git add CLAUDE.md
git commit -m "docs: document Event RSVP in the Events module section"
```

---

## Task 11: Full verification + push + PR

- [ ] `pnpm format`, `pnpm --filter @basketeasy/server lint`, `pnpm --filter @basketeasy/app lint`
- [ ] `pnpm --filter @basketeasy/server test`, `pnpm --filter @basketeasy/app test`
- [ ] `pnpm --filter @basketeasy/server exec tsc --noEmit`, `pnpm --filter @basketeasy/app exec tsc --noEmit`
- [ ] `pnpm --filter @basketeasy/server build`, `pnpm --filter @basketeasy/app build`
- [ ] Push `claude/next-logical-step-qlp8gs`, open the PR.
