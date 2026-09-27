# Match meeting point (point de rendez-vous)

Status: design (agreed with product owner 2026-09-27)
Date: 2026-09-27

Implementation is split into four parts, each with its own spec written before it is built:

1. [Backend — places, travel time, plan on `TeamEvent`](./2026-09-27-match-meeting-point-part1-backend-plan.md)
2. [Backend — player travel choice and notifications](./2026-09-27-match-meeting-point-part2-choice-notifications.md)
3. [Frontend — club and team settings](./2026-09-27-match-meeting-point-part3-settings-ui.md)
4. [Frontend — the match page](./2026-09-27-match-meeting-point-part4-match-ui.md)

## Why

On matchday a coach needs two answers: when does everyone meet, and who is travelling with the
group. Today that happens in a WhatsApp thread: "RDV 12h45 au gymnase, qui vient direct ?". Kluvo
already knows the match (`Event`), who is coming (`EventRsvp`) and who is called up
(`EventConvocation`). It doesn't know where the group meets or when.

Two rules from the club:

- **Players arrive 45 minutes before tip-off.** That is the arrival time for someone going
  straight to the gym.
- **The meeting point is in the club's town**, so the meeting time is kick-off − 45 min − driving
  time from the meeting point to the gym.

## Vocabulary

"Rendez-vous" is already used in the UI as a generic word for "next event" (the player home's
« Prochain rendez-vous » hero, `docs/ux-audit/player-journey.md` §4). To keep the two apart, the
UI copy is **« Point de rendez-vous »** / **« RDV »** for this feature. The code says
`meetingPoint` (the place) and `meetsAt` (the time).

## Decisions

| Question                          | Decision                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which events                      | Every `MATCH`, home and away. Never a `TRAINING`.                                                                                                                |
| The place                         | A **name + address** (e.g. « Parking salle Coubertin », « 12 rue … 44000 Nantes »).                                                                              |
| Where it is set                   | Club default (club `ADMIN`) → team default (team manager) → per-match override (team manager). The most specific one wins.                                       |
| CTC team                          | Inherits the **owner club's** default (`ClubTeam.isOwner`). A team default overrides it when partner clubs meet elsewhere.                                       |
| Arrival buffer                    | 45 min by default. Club setting, with a team override (e.g. 60 min for U11).                                                                                     |
| Driving time                      | Computed with **OpenRouteService** (geocoding + car routing), stored on the event.                                                                               |
| Recompute                         | Automatic when the place or the match location changes, plus a manual « Recalculer » button.                                                                     |
| Driving time fails or looks wrong | The team manager can always type the minutes. Until a time is known the RDV shows as « horaire à confirmer ».                                                    |
| Per-match time override           | A team manager can set the RDV time directly (a stop for lunch, traffic on the périphérique).                                                                    |
| Rounding                          | The computed time is **rounded down to the nearest 15 min** (never later than needed).                                                                           |
| Home match                        | Same formula. When the meeting point is the home gym, driving time is 0 and the RDV equals the arrival time.                                                     |
| Player choice                     | Only for a player who answered « Présent »: **RDV** or **Direct**. Someone who hasn't chosen counts as **RDV**. Answering Absent or Peut-être clears the choice. |
| Who answers                       | Self-service only, like RSVP. A coach can't answer for a player.                                                                                                 |
| Visibility                        | The whole roster sees who comes to the RDV and who goes direct (same audience as the RSVP breakdown).                                                            |
| Notifications                     | The convocation notification includes the RDV. When the RDV place or time changes, **only players going to the RDV** are notified.                               |
| Out of scope                      | Carpooling (drivers, seats), traffic-aware times, a map.                                                                                                         |

## The formula

```
arrivalAt = startsAt − arrivalBufferMinutes
meetsAt   = meetsAtOverride
            ?? floorTo15min(arrivalAt − travelMinutes)   when travelMinutes is known
            ?? null                                       (« horaire à confirmer »)
```

`arrivalBufferMinutes` is the team's value when set, otherwise the owner club's (default 45).
`travelMinutes` is the manually entered value when there is one, otherwise the computed one.
Neither counts if it was computed or typed for a different route (see _Staleness_ below).

Rounding down to 15 min on the UTC instant is the same as rounding in Europe/Paris, because the
offset is a whole number of hours.

Worked example: tip-off 20:30, buffer 45 min, 23 min drive → arrival 19:45 → 19:22 → **RDV 19:15**.

## Data model

Three places carry a meeting point, stored as columns on the row they belong to:

- `Club.meetingPointName/Address`, `Club.arrivalBufferMinutes Int @default(45)`
- `Team.meetingPointName/Address`, `Team.arrivalBufferMinutes Int?` (null = inherit)
- `EventMeeting` (1–1 with `Event`, keyed by `eventId`, cascade-deleted with it):
  `meetingPointName/Address` (null = inherit), plus the per-match state `travelMinutes Int?`,
  `travelMinutesManual Boolean`, `travelRouteKey String?`, `meetsAtOverride DateTime?`,
  `meetingAnnouncedKey String?`. No row reads as "nothing stored yet".

Why a side table for the match but columns for club and team: seven match-only columns would sit
null on every training, which is most rows of `Event`, and would widen the table every other
module reads. A 1–1 row also gives the meeting state its own `updatedAt`.

Why columns and not a shared `MeetingPoint` table and not a shared `MeetingPoint` table: each row owns exactly one place, nothing is
shared between rows, and a separate table would bring an orphan lifecycle (who deletes the place
when a club is deleted?) with nothing to show for it. Coordinates are **not** stored on these
rows. They live in a shared geocoding cache (below), because the same gym comes back every other
Saturday for a dozen teams.

`EventRsvp.travelMode EventTravelMode @default(MEETING_POINT)` (`MEETING_POINT | DIRECT`) holds
the player's choice. It sits on the RSVP because it only means something while the RSVP is
`GOING`. The column default is how "no choice" counts as RDV, with no three-state null.

`GeocodedAddress` caches every address → coordinates lookup: `query` (normalised, unique),
`latitude/longitude` (both null when the address was not found), `resolvedAt`, `lastUsedAt`. A
"not found" result is kept for 7 days and then retried, so a typo fixed upstream eventually
resolves without calling ORS on every page view. A hit refreshes `lastUsedAt` at most once a day,
and the nightly retention sweep drops rows unused for 12 months, so the cache doesn't grow
forever with typos and one-off away gyms. Concurrent lookups of the same address share one
provider call in-process.

## Staleness: `travelRouteKey`

Driving time is stored on the event, but the origin it was measured from is inherited. A club
admin who moves the club's meeting point silently changes the origin of every match that
inherits it. Instead of trying to find and fix every affected row at write time, the event
records which route its minutes belong to:

```
travelRouteKey = "v1:" + sha1(normalise(originAddress) + "\0" + normalise(event.location))
```

Hashed so the column has a fixed width whatever the addresses; versioned so a change to
`normalise` makes every stored key stale once (and recomputed) instead of never matching.

On read, the service builds the key for the _current_ effective origin and location. If it
doesn't match the stored key, the minutes are **stale**: they are treated as unknown
(`meetsAt: null`, « horaire à confirmer ») and a recompute is queued. Manual minutes follow the
same rule: minutes typed for « Salle Coubertin » say nothing about « Gymnase Léo Lagrange ».

The same comparison makes the write paths simple. Changing a club default doesn't have to touch
every event: it enqueues recomputes for the upcoming matches that inherit it, and anything the
queue misses is still correct on read.

## Travel computation

- **Provider seam.** `ROUTING_CLIENT` (`server/src/meeting-points/routing-client.ts`), mirroring
  `SCORESHEET_VISION_CLIENT` and `MAIL_CLIENT`: `geocode(text)` and `drivingMinutes(from, to)`.
  `OrsRoutingClient` is bound when `ORS_API_KEY` is set. Otherwise a `NullRoutingClient` answers
  `null` to everything, so with no key the feature still works with manually entered minutes.
  Like every other integration credential, `ORS_API_KEY` is **not** boot-validated.
- **ORS** (openrouteservice.org, run by HeiGIT in Heidelberg) keeps the lookup inside the EU.
  The addresses are gyms and car parks, not personal data. Free tier: 1,000 geocodes and 2,000
  routes a day, 40 routes a minute. The geocoding cache and the per-event storage keep usage far
  below that for a department-sized launch.
- **Async, rate-limited.** Recomputes run on a new BullMQ queue, `meeting-travel`, one job per
  event, deduplicated by `jobId = event id`, with a worker limiter under the ORS per-minute cap.
  Enqueueing is fire-and-forget (logged on failure), same policy as the rest of the queue: an
  unreachable Redis degrades travel times, never an event save.
- **Refresh button** (`POST …/events/:eventId/meeting/refresh`) runs the same computation
  synchronously for one event, so a manager gets the answer in the response. It also clears
  manual minutes.
- `travelMinutes = ceil(durationSeconds / 60)`.

## Notifications

- **Convocation.** When a meeting time is known at convocation time, the body gets a second
  sentence: « RDV à 19:15 — Parking salle Coubertin. » Otherwise the copy is unchanged.
- **Change.** `EventMeeting.meetingAnnouncedKey` records the last RDV (place + time) a player could have
  seen. Whenever a write or a recompute produces a _known_ RDV that differs from the stored key,
  the key is updated, and if the match is upcoming, a previous key existed and tip-off is within
  the next **7 days**, an `EVENT_MEETING_CHANGED` (or, for the first known hour,
  `EVENT_MEETING_FIXED`) notification goes to every roster member who is
  `GOING` with `travelMode = MEETING_POINT` and has a linked account. The rules, and what each
  prevents:
  - A transition _to_ « à confirmer » never notifies. That would be noise: the next known value
    will.
  - The first time an RDV becomes known notifies too, titled « RDV fixé ». (Revised after the
    UI design: the player's travel choice says « vous serez prévenu·e » while the hour is « à
    confirmer », so that first hour is owed a message.)
  - The 7-day window keeps a club-wide default change from sending one notification per future
    match. A match further out is updated quietly, and the player sees it when they open it.

## Permissions

| Action                                                      | Guard                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Set club meeting point / buffer                             | `ClubRolesGuard` + `@ClubRoles('ADMIN')`                                                                   |
| Set team meeting point / buffer                             | `TeamManagerGuard`                                                                                         |
| Set match override (place, minutes, time) / refresh         | `TeamManagerGuard`                                                                                         |
| Set own travel mode                                         | `ClubRoles('ADMIN','MEMBER')`, narrowed to "has a `TeamPlayer` on this team and is `GOING`" in the service |
| Read (plan on `TeamEvent`, travel modes on the RSVP roster) | Same as the event itself                                                                                   |

## API surface (summary)

- `PATCH /clubs/:clubId/meeting-settings`: `{ meetingPoint: {name,address} | null, arrivalBufferMinutes }`
- `PATCH /clubs/:clubId/teams/:teamId/meeting-settings`: `{ meetingPoint: {name,address} | null, arrivalBufferMinutes: number | null }`
- `PATCH …/events/:eventId/meeting`: `{ meetingPoint?, travelMinutes?, meetsAt? }`, each nullable to clear
- `POST …/events/:eventId/meeting/refresh`
- `PATCH …/events/:eventId/travel-mode`: `{ travelMode: 'MEETING_POINT' | 'DIRECT' }`
- `Club` and `Team` gain their settings. `TeamEvent` gains `meetingPlan: EventMeetingPlan | null`
  and `myTravelMode`. `EventRsvpRosterEntry` gains `travelMode`.

Exact shapes are in the part specs.

## Explicitly not in this slice

- **Carpooling**: who drives, how many seats. A natural next step, built on the list of RDV-goers
  this slice creates.
- **Dashboard / player home**: `MyAgendaEvent` doesn't carry the RDV yet. The « Prochain
  rendez-vous » hero can add it once the match page has proven the shape.
- **Per-club timezone**: formatting stays Europe/Paris, same as every other notification.
- **Traffic-aware or time-of-day routing**: the free ORS profile has no live traffic. The manual
  override is the answer.
- **A map or pin picker**: the address plus the existing « Itinéraire » link is enough.

This supersedes `docs/ux-audit/player-journey.md` §6.9 ("a geocoded venue is not needed") for
this one purpose. Geocoding is needed here to compute a driving time, not to draw a map.
