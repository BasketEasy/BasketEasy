# Event types, opponent teams, recurring-series scope Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Implement task by
> task, in order — later tasks depend on earlier ones (schema → types → DTOs → service →
> controller → frontend → docs).

**Goal:** Let an `Event` be `TRAINING` or `MATCH` (with a free-text opponent name for
matches), and let a recurring series' occurrences share a `recurrenceId` so `PATCH`/`DELETE`
can target just one occurrence, an occurrence and its later siblings, or the whole series.

**Spec:** [`docs/superpowers/specs/2026-08-11-event-types-recurring-scope-design.md`](../specs/2026-08-11-event-types-recurring-scope-design.md)
— read it first for the full rationale (why opponent stays a label not an entity, why there's
no `now()`-anchored fourth scope, why bulk date shifting is cut). This plan only repeats what's
needed to implement each task.

**Architecture:** Extends the existing `server/src/events` module in place — no new module,
no new guard (`TeamManagerGuard` already gates every mutating route). Frontend follows
`app/src/clubs`'s one-file-per-concern convention (`teamLabels.ts` → new `eventLabels.ts`).

**Tech stack:** no new dependencies. `randomUUID` from Node's built-in `crypto`.

**Sandbox note:** no live Postgres is reachable in this environment (`docker compose up`
fails — no docker daemon). The migration SQL is hand-written to match Prisma's generated
style instead of `prisma migrate dev`; `prisma generate` (schema-only, no DB connection) is
used to regenerate the client after every schema edit so the rest of the build type-checks.

## Global Constraints

- TypeScript strict mode, Prettier, ESLint per package — per root `CLAUDE.md`.
- Jest for `server` (`*.spec.ts`), Vitest + RTL for `app` (`*.test.ts(x)`).
- Shared shapes go in `packages/@basketeasy/types` first, mirrored by backend DTOs.
- `TeamManagerGuard` already covers all of `EventsController`'s mutating routes — don't touch
  guard wiring, only DTOs/bodies/return types.
- `createEvent`'s existing "always returns `TeamEvent[]`" contract stays; `updateEvent`'s
  return type changes from `TeamEvent` to `TeamEvent[]` to match it (see spec).
- Don't add bulk `startsAt` shifting or a fourth "from today" scope — see spec's Scope
  section for why both are cut.

---

## File Structure

```
server/
  prisma/schema.prisma                                              # modify
  prisma/migrations/20260811000000_add_event_type_opponent_recurrence/migration.sql  # new, hand-written
  src/
    events/
      events.service.ts                                             # modify
      events.service.spec.ts                                        # modify
      events.controller.ts                                          # modify
      events.controller.spec.ts                                     # modify
      dto/
        create-event.dto.ts                                         # modify
        update-event.dto.ts                                         # modify
        delete-event-query.dto.ts                                   # new

packages/@basketeasy/types/
  events.ts                                                         # modify

app/
  src/
    clubs/
      eventLabels.ts                                                # new
      queryKeys.ts                                                  # unchanged (no new key needed)
      EventCreateForm.tsx                                           # modify
      EventCreateForm.test.tsx                                      # modify
      EventRow.tsx                                                  # modify
      EventRow.test.tsx                                             # new
      useEventUpdate.ts                                             # modify
      useEventUpdate.test.ts                                        # new
      useEventDelete.ts                                             # modify
      useEventDelete.test.ts                                        # new
      useEventCreate.test.ts                                        # modify (fixture payload)

docs/CLAUDE.md                                                       # modify — Events module section
```

---

## Task 1: Prisma schema — `EventType`, `opponentName`, `recurrenceId`

**Files:**

- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260811000000_add_event_type_opponent_recurrence/migration.sql`

- [ ] **Step 1: Edit `schema.prisma`** — add the enum near `TeamMemberRole`, extend `Event`:

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

- [ ] **Step 2: Hand-write the migration SQL** (no live DB in this environment to run
      `prisma migrate dev` against — see plan header):

```sql
-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('TRAINING', 'MATCH');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "type" "EventType" NOT NULL DEFAULT 'TRAINING';
ALTER TABLE "Event" ADD COLUMN "opponentName" TEXT;
ALTER TABLE "Event" ADD COLUMN "recurrenceId" TEXT;

-- CreateIndex
CREATE INDEX "Event_recurrenceId_idx" ON "Event"("recurrenceId");
```

- [ ] **Step 3: Regenerate the Prisma client (schema-only, no DB needed)**

```bash
pnpm --filter @basketeasy/server exec prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(server): add Event.type, opponentName, recurrenceId to schema"
```

---

## Task 2: Shared types

**Files:** Modify `packages/@basketeasy/types/events.ts`

- [ ] Add `EventType`, `EventUpdateScope`; extend `TeamEvent`, `CreateEventRequest`,
      `UpdateEventRequest` exactly as laid out in the spec's "Shared types" section.
- [ ] Verify + commit:

```bash
pnpm --filter @basketeasy/types build
git add packages/@basketeasy/types/events.ts
git commit -m "feat(types): add EventType, EventUpdateScope, opponentName/recurrenceId"
```

---

## Task 3: Backend DTOs

**Files:**

- Modify: `server/src/events/dto/create-event.dto.ts`
- Modify: `server/src/events/dto/update-event.dto.ts`
- Create: `server/src/events/dto/delete-event-query.dto.ts`

- [ ] **`create-event.dto.ts`** — add `type` (required, `@IsEnum(EventType)`) and
      `opponentName` (optional string, `@ValidateIf((o) => o.type === 'MATCH')` +
      `@IsString() @MinLength(1) @MaxLength(120)` so it's required-when-MATCH at the DTO
      layer; the service still re-checks defensively per the spec).
- [ ] **`update-event.dto.ts`** — add `type?`, `opponentName?` (plain optional validators, no
      `@ValidateIf` here since partial updates can't know the resulting type without the
      existing row — the service does that check), and `scope?: EventUpdateScope`
      (`@IsOptional() @IsIn(['THIS','THIS_AND_FUTURE','ALL'])`).
- [ ] **`delete-event-query.dto.ts`** (new) — same `scope?` field, for `@Query()` on the
      `DELETE` route.
- [ ] Verify + commit:

```bash
pnpm --filter @basketeasy/server exec tsc --noEmit -p tsconfig.json
git add server/src/events/dto
git commit -m "feat(server): DTOs for event type/opponent/recurrence scope"
```

---

## Task 4: `EventsService`

**Files:** Modify `events.service.ts`, `events.service.spec.ts`

- [ ] **Step 1: Update existing tests' fixtures** — every mocked `Event` row in
      `events.service.spec.ts` needs `type`, `opponentName`, `recurrenceId` fields (existing
      `createEvent`/`updateEvent`/`deleteEvent` tests' `prisma.event.create/update` call
      assertions need the new fields in their `data:` payload too).
- [ ] **Step 2: Add failing tests** for:
  - `createEvent` throws `BadRequestException` when `type: 'MATCH'` and no `opponentName`.
  - `createEvent` stamps every occurrence in a recurring batch with the same generated
    `recurrenceId`; a single (non-recurring) create leaves `recurrenceId: null`.
  - `updateEvent` throws `BadRequestException` when `scope !== 'THIS'` and the event's
    `recurrenceId` is `null`.
  - `updateEvent` throws `BadRequestException` when `scope !== 'THIS'` and `startsAt` is set.
  - `updateEvent` throws `BadRequestException` switching to (or staying) `MATCH` with an
    empty resulting `opponentName`.
  - `updateEvent` clears `opponentName` when switching `type` to `TRAINING`.
  - `updateEvent` with `scope: 'THIS_AND_FUTURE'` updates only rows with the same
    `recurrenceId` and `startsAt >= event.startsAt`.
  - `updateEvent` with `scope: 'ALL'` updates every row with the same `recurrenceId`
    regardless of `startsAt`.
  - `deleteEvent` mirrors the same `THIS`/`THIS_AND_FUTURE`/`ALL` + `recurrenceId: null` guard
    cases, asserting `prisma.event.deleteMany` is called with the resolved id set.
- [ ] **Step 3: Run tests, confirm they fail** (`pnpm --filter @basketeasy/server test -- events.service.spec.ts`).
- [ ] **Step 4: Implement.**

  `assertEventInTeam` now returns the fetched row (was `Promise<void>`):

  ```typescript
  private async assertEventInTeam(clubId: string, teamId: string, eventId: string) {
    await this.assertTeamInClub(clubId, teamId);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.teamId !== teamId) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }
  ```

  `createEvent` — validate opponent, generate `recurrenceId` once per call:

  ```typescript
  async createEvent(
    clubId: string,
    teamId: string,
    data: {
      type: EventType;
      startsAt: string;
      location: string;
      notes?: string;
      opponentName?: string;
      recurrence?: EventRecurrenceRequest;
    },
  ): Promise<TeamEvent[]> {
    await this.assertTeamInClub(clubId, teamId);
    if (data.type === 'MATCH' && !data.opponentName) {
      throw new BadRequestException("Le nom de l'adversaire est requis pour un match");
    }

    const occurrences = this.buildOccurrences(data.startsAt, data.recurrence);
    const recurrenceId = data.recurrence ? randomUUID() : null;
    const opponentName = data.type === 'MATCH' ? data.opponentName! : null;

    const events = await this.prisma.$transaction(
      occurrences.map((startsAt) =>
        this.prisma.event.create({
          data: {
            teamId,
            type: data.type,
            startsAt,
            location: data.location,
            notes: data.notes ?? null,
            opponentName,
            recurrenceId,
          },
        }),
      ),
    );
    return events.map((e) => this.toTeamEvent(e));
  }
  ```

  `updateEvent` — scope resolution + field diff:

  ```typescript
  async updateEvent(
    clubId: string,
    teamId: string,
    eventId: string,
    data: {
      type?: EventType;
      startsAt?: string;
      location?: string;
      notes?: string;
      opponentName?: string;
      scope?: EventUpdateScope;
    },
  ): Promise<TeamEvent[]> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const scope = data.scope ?? 'THIS';

    if (scope !== 'THIS' && !event.recurrenceId) {
      throw new BadRequestException("Cet événement ne fait pas partie d'une série récurrente");
    }
    if (scope !== 'THIS' && data.startsAt !== undefined) {
      throw new BadRequestException('La date ne peut être modifiée que pour cet événement seul');
    }

    const resultingType = data.type ?? event.type;
    const resultingOpponent =
      data.opponentName !== undefined ? data.opponentName : event.opponentName;
    if (resultingType === 'MATCH' && !resultingOpponent) {
      throw new BadRequestException("Le nom de l'adversaire est requis pour un match");
    }

    const ids =
      scope === 'THIS' ? [eventId] : await this.resolveScopeIds(teamId, event, scope);

    const updateData: Prisma.EventUpdateInput = {
      ...(data.startsAt !== undefined ? { startsAt: new Date(data.startsAt) } : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(resultingType === 'TRAINING'
        ? { opponentName: null }
        : data.opponentName !== undefined
          ? { opponentName: data.opponentName }
          : {}),
    };

    const updated = await this.prisma.$transaction(
      ids.map((id) => this.prisma.event.update({ where: { id }, data: updateData })),
    );
    return updated.map((e) => this.toTeamEvent(e));
  }

  private async resolveScopeIds(
    teamId: string,
    event: { recurrenceId: string | null; startsAt: Date },
    scope: EventUpdateScope,
  ): Promise<string[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        teamId,
        recurrenceId: event.recurrenceId,
        ...(scope === 'THIS_AND_FUTURE' ? { startsAt: { gte: event.startsAt } } : {}),
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  ```

  `deleteEvent`:

  ```typescript
  async deleteEvent(
    clubId: string,
    teamId: string,
    eventId: string,
    scope: EventUpdateScope = 'THIS',
  ): Promise<void> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);

    if (scope !== 'THIS' && !event.recurrenceId) {
      throw new BadRequestException("Cet événement ne fait pas partie d'une série récurrente");
    }

    const ids = scope === 'THIS' ? [eventId] : await this.resolveScopeIds(teamId, event, scope);
    await this.prisma.event.deleteMany({ where: { id: { in: ids } } });
  }
  ```

  `toTeamEvent` gains `type`, `opponentName`, `recurrenceId` passthrough.

- [ ] **Step 5: Run tests, confirm pass, then commit:**

```bash
pnpm --filter @basketeasy/server test -- events.service.spec.ts
git add server/src/events/events.service.ts server/src/events/events.service.spec.ts
git commit -m "feat(server): EventsService type/opponent validation and recurrence scope"
```

---

## Task 5: `EventsController`

**Files:** Modify `events.controller.ts`, `events.controller.spec.ts`

- [ ] Update the controller spec's `service` mock and delegation tests for the new
      `updateEvent` return shape (`TeamEvent[]`) and `deleteEvent`'s extra `scope` arg.
- [ ] Wire `DeleteEventQueryDto` into the `DELETE` route via `@Query()`; pass `query.scope`
      through to `eventsService.deleteEvent`. `updateEvent`'s return type becomes
      `Promise<TeamEvent[]>` (body already forwards the full `dto`, no change needed there
      beyond the type annotation).
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/server test -- events.controller.spec.ts
git add server/src/events/events.controller.ts server/src/events/events.controller.spec.ts
git commit -m "feat(server): wire event type/opponent/scope through EventsController"
```

---

## Task 6: Frontend — `eventLabels.ts`, `EventCreateForm`

**Files:** Create `eventLabels.ts`; modify `EventCreateForm.tsx`, `EventCreateForm.test.tsx`

- [ ] `eventLabels.ts` mirrors `teamLabels.ts`: `EVENT_TYPE_OPTIONS`, `eventTypeLabel()`,
      `EVENT_UPDATE_SCOPE_OPTIONS`, `eventUpdateScopeLabel()`.
- [ ] `EventCreateForm.tsx`: add `type` (`SelectField`, default `'TRAINING'`) and, only when
      `type === 'MATCH'`, an "Adversaire" `FormField`. Zod schema gains
      `type: z.enum(['TRAINING', 'MATCH'])` and `opponentName: z.string().optional()`, with a
      second `.refine()` requiring `opponentName` when `type === 'MATCH'`. Submit payload
      includes `type` and `opponentName` (only when MATCH).
- [ ] Update `EventCreateForm.test.tsx`'s existing fixtures/payload assertions for the new
      required `type` field (default TRAINING, no opponent needed); add a case covering the
      MATCH + opponent path.
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/app test -- EventCreateForm
git add app/src/clubs/eventLabels.ts app/src/clubs/EventCreateForm.tsx app/src/clubs/EventCreateForm.test.tsx
git commit -m "feat(app): event type + opponent fields on EventCreateForm"
```

---

## Task 7: Frontend — hooks (`useEventUpdate`, `useEventDelete`)

**Files:** Modify `useEventUpdate.ts`; modify `useEventDelete.ts`; create both `.test.ts`

- [ ] `useEventUpdate.ts`: return type follows `TeamEvent[]` (matches `useEventCreate.ts`'s
      existing shape) — no functional change needed to the mutation itself beyond the type,
      since `UpdateEventRequest` already carries `scope` and the body is forwarded as-is.
- [ ] `useEventDelete.ts`: mutation input becomes `{ eventId: string; scope?: EventUpdateScope }`;
      build the URL as `` `/clubs/${clubId}/teams/${teamId}/events/${eventId}${scope && scope !== 'THIS' ? `?scope=${scope}` : ''}` ``
      (`apiClient.delete` takes no params argument).
- [ ] Add `useEventUpdate.test.ts`/`useEventDelete.test.ts` mirroring `useEventCreate.test.ts`'s
      shape (mutate → assert request body/URL → assert cache invalidation).
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/app test -- useEvent
git add app/src/clubs/useEventUpdate.ts app/src/clubs/useEventDelete.ts app/src/clubs/useEventUpdate.test.ts app/src/clubs/useEventDelete.test.ts
git commit -m "feat(app): scope-aware useEventUpdate/useEventDelete"
```

---

## Task 8: Frontend — `EventRow`

**Files:** Modify `EventRow.tsx`; create `EventRow.test.tsx`

- [ ] Read view: type badge + (`MATCH` only) "vs {opponentName}".
- [ ] Edit view: type select + conditional opponent field (same pair as `EventCreateForm`).
      When `event.recurrenceId` is set, render an `EVENT_UPDATE_SCOPE_OPTIONS` select
      (default `'THIS'`) next to "Enregistrer"; when its value isn't `'THIS'`, disable the
      `startsAt` input and show a short note instead of sending a doomed request.
- [ ] Delete action: when `event.recurrenceId` is set, render the same scope select next to
      "Supprimer" (default `'THIS'`, independent state from the edit-view one); pass the
      selected scope to `deleteEvent`.
- [ ] `EventRow.test.tsx`: cover the read view for both types, the edit-scope guard
      (disabling `startsAt`), and that `THIS_AND_FUTURE`/`ALL` reach `useEventDelete` with the
      selected scope while a plain (non-recurring) row never shows the scope select.
- [ ] Run tests, commit:

```bash
pnpm --filter @basketeasy/app test -- EventRow
git add app/src/clubs/EventRow.tsx app/src/clubs/EventRow.test.tsx
git commit -m "feat(app): event type badge, opponent, and recurrence-scope controls on EventRow"
```

---

## Task 9: Docs — `CLAUDE.md`

**Files:** Modify `CLAUDE.md`'s Events module section

- [ ] Document `type`/`opponentName`/`recurrenceId`, the `EventUpdateScope` values and their
      400 guards, and the `updateEvent` return-type change to `TeamEvent[]`.
- [ ] Remove next-steps items (3) "a `type` field..." and (4) "series-level edit/delete..."
      from the "Next steps, in order" list (now built); renumber the remaining ones.
- [ ] Commit:

```bash
git add CLAUDE.md
git commit -m "docs: update Events module section for type/opponent/recurrence scope"
```

---

## Task 10: Full verification + push + PR

- [ ] `pnpm format`, `pnpm --filter @basketeasy/server lint`, `pnpm --filter @basketeasy/app lint`
- [ ] `pnpm --filter @basketeasy/server test`, `pnpm --filter @basketeasy/app test`
- [ ] `pnpm --filter @basketeasy/server exec tsc --noEmit`, `pnpm --filter @basketeasy/app exec tsc --noEmit`
- [ ] `pnpm --filter @basketeasy/server build`, `pnpm --filter @basketeasy/app build`
- [ ] Push `claude/event-types-recurring-n027df`, open the PR.
