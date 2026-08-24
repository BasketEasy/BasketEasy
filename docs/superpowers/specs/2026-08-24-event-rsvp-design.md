# Event RSVP

Status: draft (loop 0)
Date: 2026-08-24

## Why

The Events module (`server/src/events`, see `CLAUDE.md`'s Events module section) ships plain
CRUD with no attendance signal at all — a coach has no way to know who's actually coming to a
training or match without asking outside the app. `CLAUDE.md`'s "Next steps, in order" for
Events lists this first: **"(1) RSVP — a status per roster player on an event, the first cut
deliberately dropped to keep this shippable."** All six items of the UX-audit scoping plan
(`docs/ux-audit/scoping-plan.md`) have since shipped (empty states, tabbed `TeamDetailPage`,
club switcher, dashboard, day-grouped agenda, mobile card layouts), so RSVP is the next
concrete slice of the Events roadmap rather than a UX polish item.

## Scope

**In scope:**

- A rostered team member (`TeamPlayer`, either `PLAYER` or `COACH` role — RSVP is per roster
  slot, not per basketball position) can set their own attendance status
  (`GOING` / `NOT_GOING` / `MAYBE`) on any event of a team they're rostered on, and clear it
  back to "no response."
- Anyone who can already see the event (same visibility `listEvents` grants today — an ADMIN
  or MEMBER of a linked club) can see the full roster's response breakdown for that event.
- `TeamEvent` (returned by `GET .../events`, `POST .../events`, `PATCH .../events/:eventId`,
  `PATCH .../events/:eventId/time`) gains `myRsvpStatus: EventRsvpStatus | null` — the acting
  user's own current status for that event, `null` if they haven't responded (or aren't
  rostered on the team at all — the frontend already knows whether the viewer is rostered via
  `useMyTeamList()`'s existing `rosterRole`, so it decides whether to show the RSVP control at
  all rather than inferring it from this field).

**Out of scope (explicitly deferred, don't build speculatively):**

- **Convocations** (targeted call-ups to specific players rather than open RSVP to the whole
  roster) — `CLAUDE.md`'s next-step #2, a distinct feature that narrows who's even asked;
  RSVP here stays "every rostered member can respond to every event."
- **A manager setting/overriding a player's status** (attendance-taking after the fact,
  distinct from self-reported RSVP) — this is closer to the eventual convocations/attendance
  feature than to RSVP; v1 is self-service only, enforced by resolving the acting user's own
  `TeamPlayer` row server-side, not an arbitrary `teamPlayerId` from the request body.
- **Reminders** ("you haven't responded yet," scheduled via BullMQ) — no async/queue
  infrastructure exists yet per `CLAUDE.md`'s "What's deliberately not here yet"; this spec
  adds no new async work.
- **Fair playing-time tracking** derived from RSVP/attendance — listed later in `CLAUDE.md`'s
  roadmap as its own initiative once real attendance data exists; not a corollary of this spec.
- **An RSVP deadline/cutoff** (e.g., rejecting a response after the event has started) — no
  time-based validation in v1; a late response is still a useful signal, so it's simply
  allowed.
- **Per-event aggregate counts embedded in every `TeamEvent`** (e.g. `rsvpCounts: { going,
notGoing, maybe, pending }`). `listEvents` can return up to 100 unpaginated rows for the
  agenda view (`LINKING_PAGE_SIZE`); computing a `groupBy` across that many events on every
  list fetch is real, avoidable cost for a number that's only useful once someone actually
  opens an event's breakdown. Counts are derived client-side, on demand, from the roster
  breakdown response (see Frontend) — mirroring the dashboard's existing pattern of deriving
  some stat tiles client-side from data already fetched rather than adding backend aggregation
  for everything.

## Data model (Prisma)

```prisma
enum EventRsvpStatus {
  GOING
  NOT_GOING
  MAYBE
}

// A roster member's self-reported attendance status for one event. Keyed on
// TeamPlayer (the roster slot), not Player directly, so a status is scoped
// to the team the event belongs to — the same roster member on a different
// team (rare, but roles/players aren't unique to one team) gets an
// independent response per team. No row means "no response yet"; that's
// left implicit rather than modeled as a fourth enum value, matching how
// recurrenceId: null already means "not part of a series" elsewhere in this
// schema rather than needing its own sentinel.
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

`Event` gains `rsvps EventRsvp[]` and `TeamPlayer` gains `rsvps EventRsvp[]` back-relations.
Both cascade deletes (event deleted → its RSVPs go; a roster entry removed → their RSVPs for
that team go) need no manual cleanup transaction, matching `CLAUDE.md`'s existing
`TeamPlayer`/`ClubTeam` cascade convention. `respondedAt` is overwritten (not just defaulted)
on every upsert, since "when did they last answer" is the useful signal, not "when was this
row first created."

## Service logic (`EventsService`)

Three new methods, all keyed off the acting user's own roster slot rather than an arbitrary
player id in the request:

```typescript
private async findMyTeamPlayer(teamId: string, userId: string) {
  return this.prisma.teamPlayer.findFirst({ where: { teamId, player: { userId } } });
}

async setMyRsvp(
  clubId: string,
  teamId: string,
  eventId: string,
  userId: string,
  status: EventRsvpStatus,
): Promise<TeamEvent> {
  await this.assertEventInTeam(clubId, teamId, eventId);
  const teamPlayer = await this.findMyTeamPlayer(teamId, userId);
  if (!teamPlayer) {
    throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
  }
  await this.prisma.eventRsvp.upsert({
    where: { eventId_teamPlayerId: { eventId, teamPlayerId: teamPlayer.id } },
    create: { eventId, teamPlayerId: teamPlayer.id, status, respondedAt: new Date() },
    update: { status, respondedAt: new Date() },
  });
  return this.getEventForUser(clubId, teamId, eventId, userId);
}

async clearMyRsvp(clubId: string, teamId: string, eventId: string, userId: string): Promise<TeamEvent> {
  await this.assertEventInTeam(clubId, teamId, eventId);
  const teamPlayer = await this.findMyTeamPlayer(teamId, userId);
  if (!teamPlayer) {
    throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
  }
  await this.prisma.eventRsvp.deleteMany({ where: { eventId, teamPlayerId: teamPlayer.id } });
  return this.getEventForUser(clubId, teamId, eventId, userId);
}

async listEventRsvps(clubId: string, teamId: string, eventId: string, userId: string): Promise<EventRsvpRosterEntry[]> {
  await this.assertEventInTeam(clubId, teamId, eventId);
  const roster = await this.prisma.teamPlayer.findMany({
    where: { teamId },
    include: { player: true, rsvps: { where: { eventId } } },
    orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
  });
  return roster.map((tp) => ({
    teamPlayerId: tp.id,
    playerId: tp.playerId,
    firstName: tp.player.firstName,
    lastName: tp.player.lastName,
    role: tp.role,
    status: tp.rsvps[0]?.status ?? null,
    respondedAt: tp.rsvps[0]?.respondedAt.toISOString() ?? null,
    isMe: tp.player.userId === userId,
  }));
}
```

`listEvents`/`createEvent`/`updateEvent`/`updateEventTimeOfDay` each gain a `userId` parameter
(the controller already has it via `@CurrentUser()` on every route — all four sit behind
`JwtAuthGuard` today) and populate `myRsvpStatus` through one shared helper so the query cost
stays at "a couple of bounded lookups per call," not "one query per event":

```typescript
// Resolves the acting user's own RSVP status for a bounded set of events on
// one team, in two queries regardless of how many event ids are passed —
// not the per-event aggregate this deliberately avoids (see spec's Scope).
private async resolveMyRsvpStatuses(
  teamId: string,
  userId: string,
  eventIds: string[],
): Promise<Map<string, EventRsvpStatus>> {
  const teamPlayer = await this.findMyTeamPlayer(teamId, userId);
  if (!teamPlayer) {
    return new Map();
  }
  const rsvps = await this.prisma.eventRsvp.findMany({
    where: { teamPlayerId: teamPlayer.id, eventId: { in: eventIds } },
  });
  return new Map(rsvps.map((r) => [r.eventId, r.status]));
}
```

`toTeamEvent` becomes `toTeamEvent(event, myStatus: EventRsvpStatus | null)`; every call site
(`listEvents`, `createEvent`, `updateEvent`, `updateEventTimeOfDay`, and the new
`getEventForUser` helper used by `setMyRsvp`/`clearMyRsvp`) calls `resolveMyRsvpStatuses` once
per batch of event ids it already has in hand and looks the per-row status up from the
returned map — no new query per event.

## API surface

| Method | Path                        | Guard                                                | Notes                                                                    |
| ------ | --------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `.../events`                | `ClubRoles('ADMIN','MEMBER')` (unchanged)            | items gain `myRsvpStatus`                                                |
| POST   | `.../events`                | `TeamManagerGuard` (unchanged)                       | response items gain `myRsvpStatus`                                       |
| PATCH  | `.../events/:eventId`       | `TeamManagerGuard` (unchanged)                       | response items gain `myRsvpStatus`                                       |
| PATCH  | `.../events/:eventId/time`  | `TeamManagerGuard` (unchanged)                       | response items gain `myRsvpStatus`                                       |
| PATCH  | `.../events/:eventId/rsvp`  | `ClubRoles('ADMIN','MEMBER')` + service roster check | body `{ status: EventRsvpStatus }`; sets/updates the caller's own status |
| DELETE | `.../events/:eventId/rsvp`  | `ClubRoles('ADMIN','MEMBER')` + service roster check | clears the caller's own status                                           |
| GET    | `.../events/:eventId/rsvps` | `ClubRoles('ADMIN','MEMBER')`                        | full roster breakdown for that event                                     |

The two `.../rsvp` routes reuse the same club-membership guard as `GET .../events` (an outsider
to every linked club is rejected there) and then the service narrows further to "must actually
hold a `TeamPlayer` row on this specific team" — the same defense-in-depth split
`TeamManagerGuard` + `assertTeamInClub` already uses elsewhere in this module.

## Shared types (`packages/@basketeasy/types/events.ts`)

```typescript
export type EventRsvpStatus = 'GOING' | 'NOT_GOING' | 'MAYBE';

export interface TeamEvent {
  // ...existing fields unchanged...
  /** The caller's own RSVP status for this event; null if unset or not rostered on the team. */
  myRsvpStatus: EventRsvpStatus | null;
}

export interface SetEventRsvpRequest {
  status: EventRsvpStatus;
}

export interface EventRsvpRosterEntry {
  teamPlayerId: string;
  playerId: string;
  firstName: string;
  lastName: string;
  role: TeamMemberRole; // re-exported from ./teams, same as elsewhere
  status: EventRsvpStatus | null;
  respondedAt: string | null;
  /** True when this roster row belongs to the requesting user. */
  isMe: boolean;
}
```

## Frontend

`app/src/clubs/` gets the same one-file-per-concern treatment as the rest of the module:

- New `eventRsvpLabels.ts`: `EVENT_RSVP_STATUS_OPTIONS` (`GOING` → "Présent", `NOT_GOING` →
  "Absent", `MAYBE` → "Incertain") + `eventRsvpStatusLabel()`, mirroring `eventLabels.ts`.
- New `queryKeys.ts` entry: `eventRsvpsQueryKey(clubId, teamId, eventId)`.
- New `useEventRsvpSet.ts` / `useEventRsvpClear.ts`: mutations against the two new routes,
  `onSuccess` invalidating both `teamEventsQueryKey(clubId, teamId)` (so `myRsvpStatus`
  refreshes on the list/agenda) and `eventRsvpsQueryKey(clubId, teamId, eventId)` (so an open
  breakdown panel refreshes too).
- New `useEventRsvps.ts`: `useQuery` against `GET .../events/:eventId/rsvps`, `enabled` only
  while the breakdown panel described below is actually open — this is the lazy-fetch that
  keeps the roster-breakdown query from firing once per visible event.
- New `EventRsvpControl.tsx`: three small toggle buttons ("Présent" / "Absent" / "Incertain"),
  highlighting `event.myRsvpStatus`; clicking the already-active one clears it
  (`useEventRsvpClear`), clicking another sets it (`useEventRsvpSet`). Rendered only when the
  viewer is rostered on the team — `TeamDetailPage` already fetches `useMyTeamList()` (used
  today for the "← Mes équipes" back-link) and can derive `isRostered = rosterRole !== null`
  for the current `teamId` without a new request, then thread it down alongside the existing
  `canManage` prop. Inline, not a `Dialog` — this is exactly the single-field,
  low-risk, non-destructive, high-frequency case `CLAUDE.md`'s "Modals vs. inline editing"
  guidance calls out for inline controls (same reasoning as `TeamPlayerRow`'s roster-role
  `SelectField`).
- New `EventRsvpBreakdown.tsx`: a "Voir les réponses" disclosure toggle, visible to anyone who
  can see the event (not just managers/rostered members — same visibility as the event itself).
  Opening it triggers `useEventRsvps`; while open it renders each roster row's name, role
  badge, and status (or "En attente" for `null`), bolding the `isMe` row, and derives the
  going/not-going/maybe/pending counts by reducing the fetched list client-side (see Scope —
  no backend aggregate).
- `EventRow.tsx` and `TeamEventsAgenda.tsx`'s `AgendaEventCard` both gain the two new pieces
  next to their existing manage controls: `EventRsvpControl` (conditional on `isRostered`) and
  `EventRsvpBreakdown` (always rendered, collapsed by default).
- `TeamDetailPage.tsx`: compute `isRostered` once (as above) and pass it to both the table
  (`EventRow`) and agenda (`TeamEventsAgenda`) renderings of the Événements tab.

## Testing

Same split as the rest of the codebase: Jest `*.spec.ts` for `EventsService`/`EventsController`
(new cases: `setMyRsvp`/`clearMyRsvp` upsert/delete behavior, the "not rostered" 403,
`listEventRsvps`'s roster-with-null-status shape and `isMe` flag, `myRsvpStatus` showing up
correctly on `listEvents`/`createEvent`/`updateEvent`/`updateEventTimeOfDay` for a rostered vs.
non-rostered caller); Vitest/RTL `*.test.ts(x)` for the three new hooks, `EventRsvpControl`,
`EventRsvpBreakdown`, and the updated `EventRow`/`TeamEventsAgenda`. No new E2E harness.
