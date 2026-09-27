# Match meeting point: Part 1, backend (places, travel time, plan on `TeamEvent`)

Status: spec (implements Part 1 of [`2026-09-27-match-meeting-point-design.md`](./2026-09-27-match-meeting-point-design.md))
Date: 2026-09-27

What ships: the schema, the OpenRouteService seam and geocoding cache, club and team settings
endpoints, the per-match override and refresh endpoints, the async travel recompute, and the
resolved `meetingPlan` on every `TeamEvent`. There is no player choice and no notification yet
(Part 2), and no UI (Parts 3 and 4).

## Schema

```prisma
enum EventTravelMode { MEETING_POINT DIRECT }   // used by Part 2, added now: one migration

model Club {
  …
  meetingPointName     String?
  meetingPointAddress  String?
  arrivalBufferMinutes Int     @default(45)
}

model Team {
  …
  meetingPointName     String?
  meetingPointAddress  String?
  arrivalBufferMinutes Int?     // null = inherit the owner club's
}

model Event {
  …
  meetingPointName     String?    // null = inherit team, then owner club
  meetingPointAddress  String?
  travelMinutes        Int?
  travelMinutesManual  Boolean   @default(false)
  travelRouteKey       String?   // route the minutes belong to, see design doc "Staleness"
  meetsAtOverride      DateTime?
  meetingAnnouncedKey  String?   // written by Part 2
}

model EventRsvp {
  …
  travelMode EventTravelMode @default(MEETING_POINT)  // Part 2
}

model GeocodedAddress {
  id         String   @id @default(uuid())
  query      String   @unique   // normaliseAddress(text)
  latitude   Float?
  longitude  Float?             // both null = "not found"
  resolvedAt DateTime @default(now())
}
```

The place's name and address are always written together, both set or both null. The service
enforces this, because the DTO makes it impossible to send one without the other.

Migration `20260927000000_add_match_meeting_point`, hand-written (no live Postgres in the
sandbox), all additive. Every new column is nullable or has a default, so no backfill is needed.

## Shared types: `@basketeasy/types/meeting-points` (new subpath)

```ts
export interface MeetingPoint {
  name: string;
  address: string;
}
export type MeetingPointSource = 'EVENT' | 'TEAM' | 'CLUB';
export type TravelMinutesSource = 'COMPUTED' | 'MANUAL';
export type MeetsAtSource = 'COMPUTED' | 'OVERRIDE';
export type EventTravelMode = 'MEETING_POINT' | 'DIRECT';

export const DEFAULT_ARRIVAL_BUFFER_MINUTES = 45;
export const MAX_ARRIVAL_BUFFER_MINUTES = 180;
export const MAX_TRAVEL_MINUTES = 600;

export interface EventMeetingPlan {
  arrivalAt: string; // startsAt − buffer; always known
  arrivalBufferMinutes: number;
  meetingPoint: MeetingPoint | null; // null when nothing is configured at any level
  meetingPointSource: MeetingPointSource | null;
  travelMinutes: number | null; // null = unknown or stale
  travelMinutesSource: TravelMinutesSource | null;
  meetsAt: string | null; // null = « horaire à confirmer »
  meetsAtSource: MeetsAtSource | null;
}

export interface ClubMeetingSettings {
  meetingPoint: MeetingPoint | null;
  arrivalBufferMinutes: number;
}
export interface UpdateClubMeetingSettingsRequest {
  meetingPoint: MeetingPoint | null;
  arrivalBufferMinutes: number;
}

export interface TeamMeetingSettings {
  meetingPoint: MeetingPoint | null;
  arrivalBufferMinutes: number | null;
  /** The owner club's values, i.e. what the team inherits. A partner-club manager may not be a member of the owner club, so the team endpoint carries these itself. */
  clubDefaults: { clubName: string } & ClubMeetingSettings;
}
export interface UpdateTeamMeetingSettingsRequest {
  meetingPoint: MeetingPoint | null;
  arrivalBufferMinutes: number | null;
}

export interface UpdateEventMeetingRequest {
  meetingPoint?: MeetingPoint | null; // null clears the override (back to inherited)
  travelMinutes?: number | null; // a number sets manual minutes; null goes back to computed (queues a recompute)
  meetsAt?: string | null; // ISO; null clears the time override
}
```

`TeamEvent` gains `meetingPlan: EventMeetingPlan | null`, null for a TRAINING.

## Module `server/src/meeting-points`

| File                           | Role                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routing-client.ts`            | `ROUTING_CLIENT` token and `RoutingClient { geocode(text): Promise<LatLng \| null>; drivingMinutes(from, to): Promise<number \| null> }`. `null` means "the provider answered: not found / no route". A throw means "the provider failed".                                                               |
| `ors-routing.client.ts`        | ORS over `fetch` with a 10 s timeout. `GET /geocode/search?text=…&boundary.country=FR&size=1` and `GET /v2/directions/driving-car?start=lng,lat&end=lng,lat`, key in the `Authorization` header. Minutes = `ceil(duration / 60)`. A missing `duration` on a found route means a zero-length route, so 0. |
| `null-routing.client.ts`       | Always `null`. Bound when `ORS_API_KEY` is unset.                                                                                                                                                                                                                                                        |
| `meeting-plan.ts`              | Pure functions: `normaliseAddress`, `travelRouteKey(originAddress, location)`, `floorToQuarterHour`, `resolveMeetingPlan(event, team, ownerClub)`.                                                                                                                                                       |
| `geocoding.service.ts`         | `geocode(text, { bypassNegativeCache })` through `GeocodedAddress`. A hit with coordinates is reused forever. A "not found" is reused for 7 days. A provider throw is **not** cached.                                                                                                                    |
| `meeting-points.service.ts`    | Settings get/set, `resolvePlans(teamId, events)`, `setEventMeeting`, `recomputeTravel(eventId, { force })`, `enqueueRecompute(eventIds)`, `enqueueForTeam(teamId)`, `enqueueForClub(clubId)`.                                                                                                            |
| `meeting-travel.processor.ts`  | `@Processor('meeting-travel', { limiter: { max: 30, duration: 60_000 } })`, calls `recomputeTravel(id)`.                                                                                                                                                                                                 |
| `meeting-points.controller.ts` | Club and team settings routes.                                                                                                                                                                                                                                                                           |

`MeetingPointsModule` imports `AuthModule` (guards) and `QueueModule`, and exports
`MeetingPointsService`. `EventsModule` imports it. The event meeting routes stay in
`EventsController`, since they return a `TeamEvent`, which only `EventsService` assembles.

## Plan resolution (read path)

`MeetingPointsService.resolvePlans(teamId, events)` makes **one** query regardless of batch size:
the team's meeting columns plus its owner `ClubTeam → Club` meeting columns. It then maps each
MATCH through `resolveMeetingPlan`:

1. Place: the event's own if set, else the team's, else the owner club's. The source is recorded.
2. Buffer: `team.arrivalBufferMinutes ?? club.arrivalBufferMinutes`.
3. Travel: usable only if `event.travelRouteKey === travelRouteKey(place.address, event.location)`
   and `travelMinutes !== null`. The source is `MANUAL` when `travelMinutesManual`, else `COMPUTED`.
4. `meetsAt`: the override if set, else `floorToQuarterHour(arrivalAt − travel)` when travel is
   usable, else null.

A resolved place whose route key doesn't match means the stored minutes are **stale**.
`resolvePlans` collects those ids and calls `enqueueRecompute` (fire-and-forget; the queue
deduplicates on `jobId`).

`EventsService` calls `resolvePlans` once per call site, next to `resolveMatchResults`, and hands
the map to `toTeamEvent`. That adds one query per request.

## Write paths

- **Club settings**, `GET|PATCH /clubs/:clubId/meeting-settings`. GET: `ADMIN`/`MEMBER`. PATCH:
  `ADMIN`. After a PATCH, `enqueueForClub(clubId)`: upcoming MATCH events of every team the club
  **owns**.
- **Team settings**, `GET|PATCH /clubs/:clubId/teams/:teamId/meeting-settings`. GET:
  `ADMIN`/`MEMBER` of a linked club. PATCH: `TeamManagerGuard`. Both re-verify `ClubTeam` for the
  route's club. After a PATCH, `enqueueForTeam(teamId)`.
- **Event override**, `PATCH …/events/:eventId/meeting` (`TeamManagerGuard`), MATCH only,
  otherwise 400. Each field is applied only when present:
  - `meetingPoint`: sets or clears the override. If the effective place changes, the route key no
    longer matches and a recompute is queued.
  - `travelMinutes`: a number sets `travelMinutes`, `travelMinutesManual = true` and
    `travelRouteKey` = the current key. `null` clears manual (`manual = false`, `routeKey = null`)
    and queues a recompute. Requires a resolved place, otherwise 400.
  - `meetsAt`: must be ≤ `startsAt` (400 otherwise). Requires a resolved place (400 otherwise).
    `null` clears it.
  - Returns the updated `TeamEvent`.
- **Refresh**, `POST …/events/:eventId/meeting/refresh` (`TeamManagerGuard`):
  `recomputeTravel(id, { force: true })` synchronously, then returns the `TeamEvent`. A provider
  throw becomes `503` with « Le calcul d'itinéraire est indisponible. Saisissez la durée à la main. »
- **Existing event writes** in `EventsService`:
  - `updateEvent`: when `startsAt` changes, clear `meetsAtOverride`, which was set against the old
    kick-off. When a MATCH becomes a TRAINING, clear every meeting column.
  - Nothing else enqueues explicitly: every write path already answers with (or is followed by a
    read of) a `TeamEvent`, and `resolvePlans` queues any MATCH whose route key doesn't match.
    That covers `createEvent` (a new row has no key), a `location` change (the key no longer
    matches) and the FFBB import (its created and updated rows are stale on the next read)
    without touching three call sites.

## `recomputeTravel(eventId, { force })`

```
event, team, ownerClub ← one findUnique with includes
if event.type !== MATCH or no effective place: return
key ← travelRouteKey(place.address, event.location)
if !force and event.travelRouteKey === key: return          // already computed for this route
if !force and event.travelMinutesManual and event.travelRouteKey === key: return
from ← geocode(place.address, { bypassNegativeCache: force })
to   ← geocode(event.location, { bypassNegativeCache: force })
minutes ← from && to ? routing.drivingMinutes(from, to) : null
update event: travelMinutes = minutes, travelMinutesManual = false, travelRouteKey = key
```

The key is written even when `minutes` is null. The next read then sees "computed for this
route, unknown" rather than "stale", which would re-enqueue forever while an address can't be
found. A provider throw propagates: the job retries (3 attempts, exponential from 30 s), and the
refresh route answers 503.

`enqueueRecompute` uses `jobId: meeting-travel:<eventId>`, `removeOnComplete`/`removeOnFail`, and
swallows and logs any enqueue failure. `enqueueForTeam`/`enqueueForClub` select only
`{ type: MATCH, startsAt: { gt: now } }`.

## Env

`ORS_API_KEY` goes in `.env.example` with a comment. It is **not** added to `validateEnv`, same
policy as `GEMINI_API_KEY`.

## Tests

- `meeting-plan.spec.ts`: precedence (event > team > club), buffer inheritance, stale key giving
  null travel, 15-min floor (20:30, 45 min, 23 min → 19:15), override wins, TRAINING → null.
- `geocoding.service.spec.ts`: positive cache hit, negative cache within and after 7 days, bypass,
  throw not cached.
- `ors-routing.client.spec.ts`: request shape (header, lng/lat order), duration → minutes, missing
  duration → 0, empty features → null, non-2xx → throw.
- `meeting-points.service.spec.ts`: settings validation (paired name/address), enqueue scopes,
  `setEventMeeting` rules (MATCH-only, needs a place, meetsAt ≤ startsAt), `recomputeTravel`
  skip/force/null-key behaviour.
- `events.service.spec.ts`: `meetingPlan` present on MATCH and null on TRAINING, `startsAt`
  change clears the override, type → TRAINING clears the meeting columns, location change
  enqueues.
