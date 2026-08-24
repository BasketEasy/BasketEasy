# Event Convocations Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Implement task by
> task, in order — later tasks depend on earlier ones (schema → types → DTOs → service →
> controller → frontend → docs).

**Goal:** Let a team manager set the full list of roster members called up ("convoked") for one
event, and let anyone who can see the event view the full roster's call-up breakdown.

**Spec:** [`docs/superpowers/specs/2026-08-24-event-convocations-design.md`](../specs/2026-08-24-event-convocations-design.md)
— read it first for full rationale (why a full-replace set rather than add/remove, why
convocation doesn't change RSVP's behavior, why status is keyed on `TeamPlayer` not `Player`).
This plan only repeats what's needed to implement each task.

**Architecture:** Extends the existing `server/src/events` module in place — no new module, no
new guard (reuses `TeamManagerGuard` for the write and `ClubRolesGuard`/`ClubRoles('ADMIN',
'MEMBER')` for the read, exactly as `EventRsvp` did). Frontend follows `app/src/clubs`'s
one-file-per-concern convention, mirroring the `EventRsvp*` files.

**Tech stack:** no new dependencies (`@basketeasy/ui/checkbox` already exists).

**Sandbox note:** no live Postgres is reachable in this environment. The migration SQL is
hand-written to match Prisma's generated style instead of `prisma migrate dev`; `prisma generate`
(schema-only, no DB connection) regenerates the client after the schema edit.

## Global Constraints

- TypeScript strict mode, Prettier, ESLint per package — per root `CLAUDE.md`.
- Jest for `server` (`*.spec.ts`), Vitest + RTL for `app` (`*.test.ts(x)`).
- Shared shapes go in `packages/@basketeasy/types` first, mirrored by backend DTOs.
- Convocation is a full-replace write (`setEventConvocations` takes the complete target list,
  never an incremental add/remove) — don't add per-player add/remove endpoints.
- Convocation never reads or writes `EventRsvp` state, and vice versa — the two are independent;
  don't couple them in this slice. See spec's Scope.
- `myConvocation` must be resolved via `resolveMyConvocationStatuses` (≤2 queries per call), run
  alongside `resolveMyRsvpStatuses`, never one query per event.

---

## File Structure

```
server/
  prisma/schema.prisma                                                      # modify
  prisma/migrations/20260824010000_add_event_convocation/migration.sql      # new, hand-written
  src/
    events/
      events.service.ts                                                     # modify
      events.service.spec.ts                                                # modify
      events.controller.ts                                                  # modify
      events.controller.spec.ts                                             # modify
      dto/
        set-event-convocations.dto.ts                                       # new

packages/@basketeasy/types/
  events.ts                                                                 # modify

app/
  src/
    clubs/
      queryKeys.ts                                                          # modify
      useEventConvocations.ts                                               # new
      useEventConvocations.test.ts                                          # new
      useEventConvocationsSet.ts                                            # new
      useEventConvocationsSet.test.ts                                       # new
      EventConvocationBreakdown.tsx                                         # new
      EventConvocationBreakdown.test.tsx                                    # new
      EventConvocationModal.tsx                                             # new
      EventConvocationModal.test.tsx                                       # new
      EventRow.tsx                                                          # modify
      EventRow.test.tsx                                                     # modify
      TeamEventsAgenda.tsx                                                  # modify
      TeamEventsAgenda.test.tsx                                             # modify
      useEventCreate.test.ts                                                # modify (fixture payload)
      useEventUpdate.test.ts                                                # modify (fixture payload)
      useEventDelete.test.ts                                                # modify (fixture payload, if it embeds a TeamEvent)
      useEventTimeUpdate.test.ts                                            # modify (fixture payload)
      useEventRsvpSet.test.ts                                               # modify (fixture payload)
      useEventRsvpClear.test.ts                                             # modify (fixture payload)

CLAUDE.md                                                                    # modify — Events module section
```

---

## Task 1: Prisma schema — `EventConvocation`

**Files:**

- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260824010000_add_event_convocation/migration.sql`

- [ ] **Step 1: Edit `schema.prisma`** — add the model (after `EventRsvp`) and the two
      back-relations:

```prisma
model EventConvocation {
  id           String     @id @default(uuid())
  eventId      String
  teamPlayerId String
  convokedAt   DateTime   @default(now())
  event        Event      @relation(fields: [eventId], references: [id], onDelete: Cascade)
  teamPlayer   TeamPlayer @relation(fields: [teamPlayerId], references: [id], onDelete: Cascade)

  @@unique([eventId, teamPlayerId])
  @@index([eventId])
}
```

Add `convocations EventConvocation[]` to `model Event` and to `model TeamPlayer`.

- [ ] **Step 2: Hand-write the migration SQL:**

```sql
-- CreateTable
CREATE TABLE "EventConvocation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamPlayerId" TEXT NOT NULL,
    "convokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventConvocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventConvocation_eventId_teamPlayerId_key" ON "EventConvocation"("eventId", "teamPlayerId");

-- CreateIndex
CREATE INDEX "EventConvocation_eventId_idx" ON "EventConvocation"("eventId");

-- AddForeignKey
ALTER TABLE "EventConvocation" ADD CONSTRAINT "EventConvocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConvocation" ADD CONSTRAINT "EventConvocation_teamPlayerId_fkey" FOREIGN KEY ("teamPlayerId") REFERENCES "TeamPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Regenerate the Prisma client (schema-only, no DB needed):**

```bash
pnpm --filter @basketeasy/server exec prisma generate
```

- [ ] **Step 4: Commit:**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(server): add EventConvocation model to schema"
```

---

## Task 2: Shared types

**Files:** Modify `packages/@basketeasy/types/events.ts`

- [ ] Add `SetEventConvocationsRequest`, `EventConvocationRosterEntry` (reusing the already
      imported `TeamMemberRole`); add `myConvocation: boolean` to `TeamEvent`, exactly as laid
      out in the spec's "Shared types" section.
- [ ] Verify + commit:

```bash
pnpm --filter @basketeasy/types build
git add packages/@basketeasy/types/events.ts
git commit -m "feat(types): add SetEventConvocationsRequest, EventConvocationRosterEntry"
```

---

## Task 3: Backend DTO

**Files:** Create `server/src/events/dto/set-event-convocations.dto.ts`

- [ ] `SetEventConvocationsDto`: `teamPlayerIds` (`@IsArray()`, `@ArrayUnique()`,
      `@IsString({ each: true })`, required — an empty array is valid and clears the list).
- [ ] Verify + commit:

```bash
pnpm --filter @basketeasy/server exec tsc --noEmit -p tsconfig.json
git add server/src/events/dto/set-event-convocations.dto.ts
git commit -m "feat(server): DTO for setting an event's convocation list"
```

---

## Task 4: `EventsService`

**Files:** Modify `events.service.ts`, `events.service.spec.ts`

- [ ] **Step 1: Update existing tests' fixtures** — every `listEvents`/`createEvent`/
      `updateEvent`/`updateEventTimeOfDay` test needs to account for the new `myConvocation`
      field on returned events (mock `prisma.eventConvocation.findMany` as needed; assert
      `myConvocation: false` for the common not-convoked/not-rostered caller case, and `true` for
      a convoked-caller case).
- [ ] **Step 2: Add failing tests** for:
  - `setEventConvocations` with a list of ids convokes exactly those `TeamPlayer`s and returns
    the roster breakdown reflecting it.
  - Calling `setEventConvocations` again with a different (overlapping) list adds newly-included
    ids, removes newly-excluded ids, and leaves still-included ids' `convokedAt` alone (assert
    via the mocked `deleteMany`/`upsert` calls — `deleteMany` with `notIn: teamPlayerIds`, one
    `upsert` per id in the list).
  - `setEventConvocations([])` clears every convocation for the event (deleteMany with
    `notIn: []`, i.e. all rows for that `eventId`).
  - `setEventConvocations` throws `BadRequestException` when a `teamPlayerId` isn't on the
    team's roster (roster `count` mismatch).
  - `listEventConvocations` returns one entry per roster member (not just convoked ones),
    `convoked: false`/`convokedAt: null` for anyone not called up, and `isMe: true` only for the
    entry matching the caller's own `userId`.
  - `resolveMyConvocationStatuses` (exercised indirectly via `listEvents`) issues at most two
    Prisma calls regardless of how many events are in the result page.
- [ ] **Step 3: Run tests, confirm they fail** (`pnpm --filter @basketeasy/server test -- events.service.spec.ts`).
- [ ] **Step 4: Implement**, per the spec's "Service logic" section:
  - `resolveMyConvocationStatuses(teamId, userId, eventIds)` private helper (two queries,
    returns a `Set<eventId>`).
  - `toTeamEvent(event, myRsvpStatus, myConvocation)` — add the `myConvocation` param, threaded
    from each call site's own `resolveMyConvocationStatuses` lookup, resolved via `Promise.all`
    alongside the existing `resolveMyRsvpStatuses` call at each site (`listEvents`, `createEvent`,
    `updateEvent`, `updateEventTimeOfDay`, `getEventForUser`).
  - `setEventConvocations`/`listEventConvocations` exactly as in the spec.
- [ ] **Step 5: Run tests, confirm pass, then commit:**

```bash
pnpm --filter @basketeasy/server test -- events.service.spec.ts
git add server/src/events/events.service.ts server/src/events/events.service.spec.ts
git commit -m "feat(server): EventsService convocation set/list and myConvocation"
```

---

## Task 5: `EventsController`

**Files:** Modify `events.controller.ts`, `events.controller.spec.ts`

- [ ] New routes:
  - `PATCH :eventId/convocations` (`@UseGuards(TeamManagerGuard)`, matching `createEvent`/
    `updateEvent`) → `SetEventConvocationsDto` body →
    `eventsService.setEventConvocations(clubId, teamId, eventId, dto.teamPlayerIds, user.id)`.
  - `GET :eventId/convocations` (`@UseGuards(ClubRolesGuard) @ClubRoles('ADMIN', 'MEMBER')`,
    matching `listEventRsvps`) → `eventsService.listEventConvocations(clubId, teamId, eventId, user.id)`.
- [ ] Add delegation tests for both new routes (guard applied, args forwarded correctly).
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/server test -- events.controller.spec.ts
git add server/src/events/events.controller.ts server/src/events/events.controller.spec.ts
git commit -m "feat(server): wire convocation routes through EventsController"
```

---

## Task 6: Frontend — query key, hooks

**Files:** Modify `queryKeys.ts`, create `useEventConvocations.ts`, `useEventConvocationsSet.ts`
(+ tests)

- [ ] `queryKeys.ts`: add
      `eventConvocationsQueryKey = (clubId, teamId, eventId) => ['clubs', clubId, 'teams', teamId, 'events', eventId, 'convocations'] as const`.
- [ ] `useEventConvocations.ts` — `useQuery({ queryKey: eventConvocationsQueryKey(...), queryFn: () => apiClient.get<EventConvocationRosterEntry[]>(...), enabled })`,
      mirroring `useEventRsvps.ts` exactly (`enabled` passed in by the caller).
- [ ] `useEventConvocationsSet.ts` — mutation
      `(teamPlayerIds: string[]) => apiClient.patch<EventConvocationRosterEntry[]>(.../events/${eventId}/convocations, { teamPlayerIds })`;
      `onSuccess` invalidates `teamEventsQueryKey(clubId, teamId)` and
      `eventConvocationsQueryKey(clubId, teamId, eventId)`.
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/app test -- useEventConvocations
git add app/src/clubs/queryKeys.ts app/src/clubs/useEventConvocations.ts app/src/clubs/useEventConvocations.test.ts app/src/clubs/useEventConvocationsSet.ts app/src/clubs/useEventConvocationsSet.test.ts
git commit -m "feat(app): convocation query key and hooks"
```

---

## Task 7: Frontend — `EventConvocationBreakdown`, `EventConvocationModal`

**Files:** Create `EventConvocationBreakdown.tsx`, `EventConvocationModal.tsx` (+ tests)

- [ ] `EventConvocationBreakdown.tsx` — mirrors `EventRsvpBreakdown.tsx`: takes `clubId`,
      `teamId`, `eventId`; local `isOpen` state gating a "Voir la convocation" / "Masquer la
      convocation" toggle button showing a "N convoqué(s)" count derived from the fetched roster;
      while open, calls `useEventConvocations(clubId, teamId, eventId, isOpen)` and renders each
      entry (name, role badge, convoked/not indicator), bolding the `isMe` row.
- [ ] `EventConvocationModal.tsx` — takes `clubId`, `teamId`, `eventId`, `roster:
      EventConvocationRosterEntry[]` (or fetches its own via `useEventConvocations` gated on the
      dialog's own `open` state, matching `EventEditModal`'s controlled-dialog pattern): a
      `Dialog` listing every roster row as a `Checkbox` (`@basketeasy/ui/checkbox`) + name + role
      badge, local state seeded from each row's `convoked` flag on open (re-synced via the same
      `useEffect`-on-`open` pattern `EventEditModal` uses), and a "Enregistrer" submit button
      calling `useEventConvocationsSet` with the checked `teamPlayerId`s. No `Dialog`-in-`Dialog`
      nesting — this is a standalone trigger next to `EventEditModal`/`EventDeleteModal`, not
      nested inside either.
- [ ] Tests: `EventConvocationBreakdown` covers the closed-by-default state, that opening
      triggers the fetch (not before), and the convoked count; `EventConvocationModal` covers
      seeding checkbox state from `convoked`, toggling, and that submit sends exactly the checked
      ids (including the empty-list case).
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/app test -- EventConvocationBreakdown EventConvocationModal
git add app/src/clubs/EventConvocationBreakdown.tsx app/src/clubs/EventConvocationBreakdown.test.tsx app/src/clubs/EventConvocationModal.tsx app/src/clubs/EventConvocationModal.test.tsx
git commit -m "feat(app): EventConvocationBreakdown and EventConvocationModal components"
```

---

## Task 8: Frontend — wire into `EventRow`, `TeamEventsAgenda`

**Files:** Modify `EventRow.tsx`, `TeamEventsAgenda.tsx` (+ their tests)

- [ ] `EventRow.tsx` / `TeamEventsAgenda.tsx`'s `AgendaEventCard`: render `EventConvocationModal`
      next to `EventEditModal`/`EventDeleteModal` (`canManage`-gated, same as those two); render a
      small "Convoqué" badge when `isRostered && event.myConvocation` next to the existing
      `EventRsvpControl`; render `EventConvocationBreakdown` unconditionally, next to the existing
      `EventRsvpBreakdown`. No new props on either component — `clubId`, `teamId`, `event`,
      `canManage`, `isRostered` are already threaded through from `TeamDetailPage.tsx`, which
      needs no changes.
- [ ] Update `EventRow.test.tsx`, `TeamEventsAgenda.test.tsx` for the new elements (modal shown
      only when `canManage`; badge shown only when rostered and convoked; breakdown always
      present).
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/app test -- EventRow TeamEventsAgenda
git add app/src/clubs/EventRow.tsx app/src/clubs/EventRow.test.tsx app/src/clubs/TeamEventsAgenda.tsx app/src/clubs/TeamEventsAgenda.test.tsx
git commit -m "feat(app): wire convocation modal, badge, and breakdown into event views"
```

---

## Task 9: Fixture updates for existing event-related tests

**Files:** `useEventCreate.test.ts`, `useEventUpdate.test.ts`, `useEventDelete.test.ts`,
`useEventTimeUpdate.test.ts`, `useEventRsvpSet.test.ts`, `useEventRsvpClear.test.ts` — modify only
where they embed a full `TeamEvent` fixture

- [ ] Add `myConvocation: false` (or a specific value where the test cares) to every mocked
      `TeamEvent` fixture so these tests keep type-checking and passing against the extended
      shared type. No behavioral change to these hooks themselves.
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/app test
git add app/src/clubs/useEventCreate.test.ts app/src/clubs/useEventUpdate.test.ts app/src/clubs/useEventDelete.test.ts app/src/clubs/useEventTimeUpdate.test.ts app/src/clubs/useEventRsvpSet.test.ts app/src/clubs/useEventRsvpClear.test.ts
git commit -m "test(app): add myConvocation to existing event fixtures"
```

---

## Task 10: Docs — `CLAUDE.md`

**Files:** Modify `CLAUDE.md`'s Events module section

- [ ] Document `EventConvocation`, the manager-only `PATCH .../events/:eventId/convocations`
      route, `GET .../events/:eventId/convocations`, and `TeamEvent.myConvocation`.
- [ ] Remove next-steps item (1) "convocations..." from the "Next steps, in order" list (now
      built); renumber the remaining one (créneaux/gym-slot conflict detection becomes (1)).
- [ ] Commit:

```bash
git add CLAUDE.md
git commit -m "docs: document Event Convocations in the Events module section"
```

---

## Task 11: Full verification + push + PR

- [ ] `pnpm format`, `pnpm --filter @basketeasy/server lint`, `pnpm --filter @basketeasy/app lint`
- [ ] `pnpm --filter @basketeasy/server test`, `pnpm --filter @basketeasy/app test`
- [ ] `pnpm --filter @basketeasy/server exec tsc --noEmit`, `pnpm --filter @basketeasy/app exec tsc --noEmit`
- [ ] `pnpm --filter @basketeasy/server build`, `pnpm --filter @basketeasy/app build`
- [ ] Push `claude/convocations-targeted-callups-pgu6mk`, open the PR.
