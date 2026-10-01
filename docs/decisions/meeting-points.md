# Meeting points (« point de rendez-vous »)

Rules live in `CLAUDE.md` (« Meeting points module »). This is the reasoning.

## The club's two rules

Players arrive **45 minutes before tip-off** (the time for someone going straight to the gym), and
the meeting point is in the club's town, so the meeting time is kick-off − buffer − driving time.

```
arrivalAt = startsAt − arrivalBufferMinutes
meetsAt   = meetsAtOverride ?? floorTo15min(arrivalAt − travelMinutes) ?? null (« horaire à confirmer »)
```

Worked example: tip-off 20:30, buffer 45, drive 23 min → arrival 19:45 → 19:22 → **RDV 19:15**.
Rounding is always down (never later than needed). Flooring the UTC instant equals flooring in
Europe/Paris because the offset is whole hours. The formula lives in `@basketeasy/types` so the
API and the « Ajuster » preview can't drift.

## Vocabulary

« Rendez-vous » already meant « next event » on the player home. This feature is always « Point de
rendez-vous » / « RDV » in copy, `meetingPoint` (place) and `meetsAt` (time) in code.

## Decisions

| Question      | Decision                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Events        | every MATCH, never a TRAINING. Home matches get no default RDV (the team goes to its own gym); a manager may set one per match |
| Place         | name + address, both or neither                                                                                                |
| Precedence    | match override → team default → **owner** club default; buffer: team → owner club (default 45)                                 |
| Driving time  | computed (OpenRouteService), typed by a manager, or a fixed RDV time; « à confirmer » until one is known                       |
| Player choice | only after « Présent »: RDV (the default, so not choosing counts as RDV) or direct                                             |
| Who answers   | self-service, like RSVP                                                                                                        |
| Out           | carpooling, traffic-aware times, a map or pin picker, a per-club timezone                                                      |

## Storage

- Club and team defaults are columns on their own rows. Per-match state is a 1–1 `EventMeeting`
  row, not columns on `Event`: seven match-only columns would sit null on every training (most
  rows) and widen the table every module reads.
- No shared `MeetingPoint` table: nothing is shared between rows and it would bring an orphan
  lifecycle. Coordinates are not stored on these rows either; they live in the `GeocodedAddress`
  cache, because the same away gym comes back for a dozen teams.

## Staleness: `travelRouteKey`

The origin is inherited, so moving a club default silently changes every inheriting match's route.
Instead of rewriting rows on every settings change, each match stores the key of the route its
minutes belong to: `"v1:" + sha1(normalise(origin) + "\0" + normalise(location))`. Hashed for a
fixed width, versioned so a change to `normalise` invalidates every key once. On read, a mismatch
means unknown (« à confirmer ») plus a queued recompute; typed minutes follow the same rule.
**The key is written even when the provider found no route**, otherwise the next read would see
« stale » and re-queue forever.

## OpenRouteService

- Run by HeiGIT (Heidelberg), so lookups stay in the EU; the addresses are gyms and car parks, not
  personal data. Free tier: 1,000 geocodes and 2,000 routes a day, 40 routes a minute.
- `GET /geocode/search?text=…&boundary.country=FR&size=1`, `GET /v2/directions/driving-car?start=lng,lat&end=lng,lat`
  (longitude first), key in `Authorization`. Minutes = `ceil(duration / 60)`; a found route
  without `duration` is a zero-length route.
- Geocode cache: a hit is kept forever, « not found » for 7 days (a fixed typo eventually
  resolves), a provider error never; concurrent lookups share one call; unused rows are pruned
  after 12 months by the retention sweep.
- Recomputes run on the `meeting-travel` queue (job id = event, limiter 30/min under the ORS cap).
  « Recalculer » runs synchronously with a 5 s timeout and a 15 s per-match cooldown so a mashed
  button can't spend the quota; a provider failure answers 503 « Saisissez la durée à la main ».

## Notifications

- The convocation body adds « RDV à 19:15 — Parking salle Coubertin. » once the time is known.
- `meetingAnnouncedKey` records the last RDV a player could have seen. A move to « à confirmer »
  never notifies (the next known value will); the **first** known RDV notifies as « RDV fixé »,
  because the travel choice promised « vous serez prévenu·e »; later moves notify as « RDV
  modifié ». Only players `GOING` with `MEETING_POINT`.
- Only matches in the next **7 days** announce: a club-default change would otherwise send one
  message per future match. A further match keeps its old key and announces against it once inside
  the window.
- The key is claimed with a conditional `updateMany` (still equal to the value read), so two racing
  writers announce once. Announcement failures are logged and swallowed.

## Choice rules

- Leaving `GOING` resets the choice to RDV; re-tapping « Présent » keeps « Direct ».
- No meeting point configured → no choice offered and no RDV/Direct badges (travel mode is noise).
- A settings card with nothing set is valid data (« Aucun point de rendez-vous »), not an empty
  state.
