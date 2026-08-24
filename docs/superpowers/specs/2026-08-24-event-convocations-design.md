# Event Convocations

Status: draft (loop 0)
Date: 2026-08-24

## Why

RSVP (`docs/superpowers/specs/2026-08-24-event-rsvp-design.md`, shipped) opened every event to the
whole roster: any `TeamPlayer` can self-report `GOING`/`NOT_GOING`/`MAYBE`. That's the right
default for trainings, but for a match a coach typically doesn't need — or want — a response from
every rostered player: a CTC/entente team's roster can span multiple clubs and be larger than a
single match-day squad, and some clubs use RSVP just to gauge interest before the coach picks who's
actually needed. `CLAUDE.md`'s "Next steps, in order" for the Events module lists this next:
**"(1) convocations — targeted call-ups to specific players rather than open RSVP to the whole
roster."**

Convocation is additive, not a replacement for RSVP: a manager marks a subset of the roster as
"called up" for one event; everyone can still see (and self-report on) the event exactly as before.
This is the smallest useful slice — a call-up list a coach can publish and players can check —
without touching RSVP's existing behavior at all.

## Scope

**In scope:**

- A team manager (`TeamManagerGuard` — a club `ADMIN` of a linked club, or a `TeamAdmin` for the
  team) can set the full list of `TeamPlayer`s called up for one event in a single action (a
  coach filling out a call-up sheet, not one-by-one toggles), and clear it back to nobody by
  passing an empty list.
- Anyone who can already see the event (an `ADMIN` or `MEMBER` of a linked club — same visibility
  `listEvents`/`listEventRsvps` grant today) can see the full roster's call-up breakdown for that
  event: who's convoked and who isn't.
- `TeamEvent` gains `myConvocation: boolean` — whether the acting user is called up for this
  event (`false` if not rostered or not called up), resolved the same bounded way
  `myRsvpStatus` already is.

**Out of scope (explicitly deferred, don't build speculatively):**

- **Any change to RSVP's behavior.** RSVP stays "every rostered member can respond to every
  event," regardless of whether that event has convocations set. A convoked player still RSVPs
  the same way as before; convocation doesn't gate, hide, or auto-fill their RSVP status. Linking
  the two (e.g., auto-inviting only convoked players to RSVP, or requiring a response before
  convocation) is a future call, not this slice.
- **Per-player call-up status beyond a boolean** (e.g., "starter" vs. "reserve/bench," or a
  reason/note per call-up). A call-up is binary — convoked or not — matching how `EventRsvp`
  itself started narrow (`respondedAt` is the only extra field kept here, mirroring that
  precedent) rather than modeling positions or squad depth that nothing downstream needs yet.
- **Notifications** ("you've been called up") — no async/queue infrastructure exists yet per
  `CLAUDE.md`'s "What's deliberately not here yet"; this spec adds no new async work, same as the
  RSVP spec's equivalent cut.
- **Restricting which event types can carry a convocation.** Both `TRAINING` and `MATCH` events
  can have one — a large CTC roster may need targeted call-ups for training sessions too, not
  just match day. No type-based validation is added.
- **A convocation deadline/cutoff or history of past convocation changes.** Setting the list is a
  full replace (last write wins); no audit trail beyond `convokedAt` per current row.
- **Bulk-applying one convocation list across a whole recurring series.** Each `Event` occurrence
  gets its own independent call-up list, same as RSVP is per-occurrence — consistent with how
  `recurrenceId` already only groups scheduling (time/date/location) edits, never
  roster-attendance state.

## Data model (Prisma)

```prisma
// A team manager's call-up of a specific roster member for one event —
// "convoked" is true iff a row exists, same "no row = no signal" convention
// EventRsvp already established (no row = "no response yet"). Keyed on
// TeamPlayer (the roster slot), not Player, for the same reason RSVP is:
// scoped to the team the event belongs to. convokedAt is kept (mirroring
// EventRsvp.respondedAt) even though nothing surfaces it prominently yet —
// it's already available at zero extra query cost since the row is fetched
// either way, and gives "convoked since" a home if the UI wants it later
// without a schema change.
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

`Event` gains `convocations EventConvocation[]` and `TeamPlayer` gains `convocations
EventConvocation[]` back-relations. Both cascade-delete (event deleted → its convocations go; a
roster entry removed → their convocations for that team go), matching `EventRsvp`'s existing
cascade convention — no manual cleanup transaction needed.

## Service logic (`EventsService`)

```typescript
// Full replace: every id in teamPlayerIds ends up convoked, every other
// roster member on this event ends up not convoked — a coach fills out
// the whole call-up list in one submit rather than toggling players one at
// a time. An empty array clears the list back to nobody.
async setEventConvocations(
  clubId: string,
  teamId: string,
  eventId: string,
  teamPlayerIds: string[],
  userId: string,
): Promise<EventConvocationRosterEntry[]> {
  await this.assertEventInTeam(clubId, teamId, eventId);

  if (teamPlayerIds.length > 0) {
    const rosterCount = await this.prisma.teamPlayer.count({
      where: { id: { in: teamPlayerIds }, teamId },
    });
    if (rosterCount !== teamPlayerIds.length) {
      throw new BadRequestException(
        "Un ou plusieurs joueurs ne font pas partie de l'effectif de cette équipe",
      );
    }
  }

  await this.prisma.$transaction([
    this.prisma.eventConvocation.deleteMany({
      where: { eventId, teamPlayerId: { notIn: teamPlayerIds } },
    }),
    ...teamPlayerIds.map((teamPlayerId) =>
      this.prisma.eventConvocation.upsert({
        where: { eventId_teamPlayerId: { eventId, teamPlayerId } },
        create: { eventId, teamPlayerId },
        update: {},
      }),
    ),
  ]);

  return this.listEventConvocations(clubId, teamId, eventId, userId);
}

// Full roster (not just convoked players) so a manager sees who they
// haven't picked yet — same shape as listEventRsvps.
async listEventConvocations(
  clubId: string,
  teamId: string,
  eventId: string,
  userId: string,
): Promise<EventConvocationRosterEntry[]> {
  await this.assertEventInTeam(clubId, teamId, eventId);
  const roster = await this.prisma.teamPlayer.findMany({
    where: { teamId },
    include: { player: true, convocations: { where: { eventId } } },
    orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
  });
  return roster.map((tp) => ({
    teamPlayerId: tp.id,
    playerId: tp.playerId,
    firstName: tp.player.firstName,
    lastName: tp.player.lastName,
    role: tp.role,
    convoked: tp.convocations.length > 0,
    convokedAt: tp.convocations[0]?.convokedAt.toISOString() ?? null,
    isMe: tp.player.userId === userId,
  }));
}
```

`listEvents`/`createEvent`/`updateEvent`/`updateEventTimeOfDay`/`getEventForUser` each gain a
second bounded lookup alongside `resolveMyRsvpStatuses`, run in parallel with it:

```typescript
// Same shape as resolveMyRsvpStatuses: two queries regardless of how many
// event ids are passed, never one query per event.
private async resolveMyConvocationStatuses(
  teamId: string,
  userId: string,
  eventIds: string[],
): Promise<Set<string>> {
  if (eventIds.length === 0) {
    return new Set();
  }
  const teamPlayer = await this.findMyTeamPlayer(teamId, userId);
  if (!teamPlayer) {
    return new Set();
  }
  const convocations = await this.prisma.eventConvocation.findMany({
    where: { teamPlayerId: teamPlayer.id, eventId: { in: eventIds } },
  });
  return new Set(convocations.map((c) => c.eventId));
}
```

`toTeamEvent` gains a third parameter, `myConvocation: boolean`. Every existing call site that
already resolves `myRsvpStatus` resolves `myConvocation` alongside it (`Promise.all` of the two
lookups on the same `eventIds` batch) and threads both through — no new query-count class beyond
what RSVP already introduced, just one more bounded lookup per call.

## API surface

| Method | Path                             | Guard                                     | Notes                                                                     |
| ------ | --------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| PATCH  | `.../events/:eventId/convocations` | `TeamManagerGuard`                        | body `{ teamPlayerIds: string[] }`; full replace; returns roster breakdown |
| GET    | `.../events/:eventId/convocations` | `ClubRoles('ADMIN','MEMBER')`             | full roster breakdown for that event                                      |

`GET .../events`, `POST .../events`, `PATCH .../events/:eventId`, `PATCH .../events/:eventId/time`
response items all gain `myConvocation` — no guard changes on those four routes.

## Shared types (`packages/@basketeasy/types/events.ts`)

```typescript
export interface TeamEvent {
  // ...existing fields unchanged...
  /** Whether the caller is called up for this event; false if unset or not rostered. */
  myConvocation: boolean;
}

export interface SetEventConvocationsRequest {
  /** Full replacement list of convoked TeamPlayer ids; empty array clears the call-up list. */
  teamPlayerIds: string[];
}

/** One roster member's call-up status for a single event, via GET/PATCH .../events/:eventId/convocations. */
export interface EventConvocationRosterEntry {
  teamPlayerId: string;
  playerId: string;
  firstName: string;
  lastName: string;
  role: TeamMemberRole;
  convoked: boolean;
  /** Null when not convoked. */
  convokedAt: string | null;
  /** True when this roster row belongs to the requesting user. */
  isMe: boolean;
}
```

## Frontend

`app/src/clubs/` gets the same one-file-per-concern treatment RSVP used:

- New `queryKeys.ts` entry: `eventConvocationsQueryKey(clubId, teamId, eventId)`.
- New `useEventConvocations.ts`: `useQuery` against `GET .../events/:eventId/convocations`,
  `enabled` passed by the caller — same lazy-fetch-on-open pattern as `useEventRsvps`.
- New `useEventConvocationsSet.ts`: mutation against `PATCH .../events/:eventId/convocations`,
  `onSuccess` invalidating both `teamEventsQueryKey(clubId, teamId)` (so `myConvocation` refreshes
  on the list/agenda) and `eventConvocationsQueryKey(clubId, teamId, eventId)`.
- New `EventConvocationBreakdown.tsx`: mirrors `EventRsvpBreakdown.tsx` — a "Voir la convocation" /
  "Masquer la convocation" disclosure toggle showing a "N convoqué(s)" count, visible to anyone
  who can see the event (always rendered, not manager-only). Opening it triggers
  `useEventConvocations`; while open it renders each roster row's name, role badge, and a
  convoked/not indicator, bolding the `isMe` row.
- New `EventConvocationModal.tsx`: a `Dialog` (manager-only, rendered next to `EventEditModal`/
  `EventDeleteModal`), listing the full roster as `Checkbox` rows (`@basketeasy/ui/checkbox`)
  seeded from the current `convoked` flags, and a "Enregistrer" button calling
  `useEventConvocationsSet` with the checked `teamPlayerId`s. This is the multi-field,
  infrequent, focused-edit case `CLAUDE.md`'s "Modals vs. inline editing" calls out for a
  `Dialog` — picking a whole call-up list is exactly the "creating or editing an entity
  end-to-end" shape the guidance already uses `EventEditModal` as its example of, not the
  single-field/high-frequency shape that stays inline (RSVP's own toggle).
- `EventRow.tsx` and `TeamEventsAgenda.tsx`'s `AgendaEventCard`: render `EventConvocationModal`
  next to the existing manager controls (`canManage`-gated), a small "Convoqué" badge when
  `isRostered && event.myConvocation` (next to the existing RSVP control), and
  `EventConvocationBreakdown` unconditionally, alongside the existing `EventRsvpBreakdown`. No new
  props needed on either component — both already receive `clubId`, `teamId`, `event`, `canManage`,
  `isRostered` from `TeamDetailPage.tsx`, which needs no changes itself.

## Testing

Same split as the rest of the codebase: Jest `*.spec.ts` for `EventsService`/`EventsController`
(new cases: `setEventConvocations` full-replace behavior — added, kept, and removed rows in one
call; the "unknown teamPlayerId" 400; empty-array clears the list; `listEventConvocations`'s
roster-with-non-convoked shape and `isMe` flag; `myConvocation` showing up correctly on
`listEvents`/`createEvent`/`updateEvent`/`updateEventTimeOfDay` for a convoked vs. non-convoked
vs. non-rostered caller); Vitest/RTL `*.test.ts(x)` for the two new hooks, `EventConvocationModal`
(seeded checkbox state, submit sends exactly the checked ids), `EventConvocationBreakdown`, and the
updated `EventRow`/`TeamEventsAgenda`. No new E2E harness.
