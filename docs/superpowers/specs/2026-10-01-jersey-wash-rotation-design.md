# Jersey wash rotation: design

**Status:** spec, not built. **Date:** 2026-10-01.

## Problem

After a match someone takes the team's jersey set home, washes it and brings it back to the next match. Clubs run this as a rotation, usually by jersey number, tracked on paper or in a WhatsApp group.

Kluvo has a single per-event slot today (`Event.jerseysTeamPlayerId`, « Maillots : qui apporte le jeu de maillots ? »): one assignee, set by themself or a manager from a dropdown on the match page. It knows nothing about who washed last, who has never done it, who can't, or that bringing the set to match N is the same fact as having washed it after match N−1. Managers fall back to their paper list.

## Decisions

| #   | Question                      | Decision                                                                                                                                                                                                                                                              |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What the duty is              | **Wash after the match.** The assignee of match N takes the set home after N and brings it back clean to the team's next MATCH.                                                                                                                                       |
| 2   | Which items                   | Match jerseys only. « Chasubles » (the TRAINING use of the same slot) and « Ballons » keep today's behaviour unchanged.                                                                                                                                               |
| 3   | « Qui apporte » on a match    | **Derived, no longer stored.** Match N shows « Maillots apportés par X », X being the washer of the team's previous MATCH. One source of truth.                                                                                                                       |
| 4   | How the next person is chosen | **Auto-suggested, a team manager can override.** No jersey number is stored (clubs share sets, numbers change, see the Team stats module).                                                                                                                            |
| 5   | Suggestion order              | Fewest turns this season → longest since last turn (never washed first) → last name, first name → `TeamPlayer.id`.                                                                                                                                                    |
| 6   | Pool                          | Convoked **and** `GOING` on this match, not exempted. Nobody in the pool → **no suggestion** (« Aucune suggestion »): no fallback to the roster.                                                                                                                      |
| 7   | Exemption                     | Per roster entry, set by a team manager (no washing machine, coach, injured long-term…). An exempted player is never suggested but can still be assigned by a manager.                                                                                                |
| 8   | Timing                        | The suggestion is visible **before** the match, as soon as someone is in the pool, and moves with RSVPs until someone accepts or a manager assigns.                                                                                                                   |
| 9   | What counts as a turn         | **Whoever holds the duty at kickoff.** Accepted or not. Declines before kickoff don't count.                                                                                                                                                                          |
| 10  | Done                          | A manager can mark a turn « Fait » (the clean set came back). Status only: the turn counts from kickoff either way. A manager can also **void** a turn (bag stayed in the gym, match cancelled on site) so it doesn't count.                                          |
| 11  | Player actions                | Before kickoff, the assignee (or the suggested player) can **accept** (« C'est noté »), **decline** (« Je ne peux pas », suggestion moves on) or **propose a swap** to a teammate in the pool, who accepts or refuses. After kickoff only a manager changes anything. |
| 12  | Notifications                 | **On assignment only** (manager assignment, kickoff freeze of an un-accepted suggestion, accepted swap). No « rapportez les maillots » reminder, no « not returned » alert in v1.                                                                                     |
| 13  | Overview                      | Whole team sees it: a « Lavage des maillots » section on the team page.                                                                                                                                                                                               |
| 14  | Fairness window               | Per team, per season (1 September → 31 August, `seasonYearFor` from `team-stats`). A child on two teams has two independent counts.                                                                                                                                   |
| 15  | Per-team switch               | `Team.jerseyRotationEnabled`, **on by default**: few clubs wash their teams' jerseys centrally. A manager turns it off for a team whose club does; the match then keeps today's plain « Qui apporte » slot and the freeze job skips it.                               |

## Family

The duty belongs to a **player** (one roster entry), never to a household. Guardians act and are notified on the player's behalf.

| #   | Question                       | Decision                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | Unit of fairness               | **Each player.** No sibling merge: two brothers on one team are two turns, and a family with two children there washes twice as often. Accepted.                                                                                                                                                                                           |
| F2  | Who can act for a minor        | **The child (if they have an account) and every linked guardian**, through the persona switcher and `?forPlayerId=` resolved by `resolveActingTeamPlayer`. This lifts the guardian spec's decision 9 exclusion **for jersey duty only**; balls and chasubles stay player-only.                                                             |
| F3  | Several guardians / households | **Whoever accepts.** No household model, no « responsible guardian ». Every guardian is notified; the first one to accept is shown as handling it (« Accepté par Sophie M. », first name + last initial, never a relationship label, same rule as RSVP's `respondedByUserId`). Any other guardian can still decline or swap until kickoff. |
| F4  | Notification audience          | `resolvePlayerAudience` + `groupByRecipient`: the child's own account plus every guardian, merged per reader. A parent's copy names the child (`subjectFirstName`) and deep-links through the child's club with `?pour=<playerId>`, exactly like a convocation.                                                                            |
| F5  | A playing parent               | A parent rostered on the same team as their child is a separate unit with their own count.                                                                                                                                                                                                                                                 |
| F6  | Unreachable minor              | No account and no guardian linked: **still suggested**. Nobody can be notified or accept; the manager tells the family offline and assigns. The match card shows « Personne ne sera prévenu » next to that name for a manager.                                                                                                             |
| F7  | Siblings on different teams    | No cross-team rule. Two children of one family can both hold a duty the same weekend.                                                                                                                                                                                                                                                      |
| F8  | Swap target                    | A swap is proposed to a **player**, so the target's child account and guardians all receive it and any of them can accept or refuse.                                                                                                                                                                                                       |

## Rules

- **One duty per match, one holder.** Never two players on the same match.
- **Suggestion only for the team's next MATCH.** A later match shows « Suggestion après le match du <date> ». Without this, two upcoming matches compute independently and propose the same person twice.
- **Suggestions are computed on read, never stored.** Only an acceptance, a manager assignment, a swap or the kickoff freeze writes a row. A `GET` writes nothing (CLAUDE.md: a `GET` never writes user-owned state).
- **Kickoff freeze.** A repeatable BullMQ job (`jersey-duty-freeze`, every 10 min, same registration shape as `retention-sweep`) finds matches of teams with the rotation on whose `startsAt` has passed within the last 7 days, with no duty row and a non-empty pool, and writes the suggestion as the assignment (`source: SUGGESTION`), then notifies. A match with an empty pool stays unassigned: a manager can assign afterwards.
- **Decline memory.** A decline is remembered per match (`EventJerseyDecline`) so the suggestion skips that player for that match. It doesn't affect fairness. A manager can still assign a decliner.
- **Volunteering.** Any player in the pool can still take the duty themself before kickoff (today's self-assign), replacing an un-accepted suggestion, never an accepted holder (that's a swap).
- **Manager powers, any time:** assign any roster member (pool or not, exempted or not), clear, mark « Fait » / undo, void / unvoid. After kickoff this is the only way to change the holder.
- **Removal from the roster** clears the duty (`SetNull`); the match falls back to « Aucun » and the turn no longer counts for anyone.
- **TRAINING → MATCH and back:** switching a match to TRAINING deletes its duty row (same as `EventMeeting`).

## Data model

```prisma
enum JerseyDutySource {
  SUGGESTION   // frozen at kickoff
  SELF         // accepted or volunteered (player or guardian)
  MANAGER
  SWAP
  BACKFILL
}

model EventJerseyDuty {
  eventId            String           @id
  teamPlayerId       String?
  source             JerseyDutySource
  acceptedAt         DateTime?
  acceptedByUserId   String?          // the caller, never the persona (F3)
  doneAt             DateTime?
  doneByUserId       String?
  voidedAt           DateTime?
  voidedByUserId     String?
  swapToTeamPlayerId String?          // one pending swap at a time
  swapRequestedAt    DateTime?
  updatedAt          DateTime         @updatedAt
  event              Event            @relation(fields: [eventId], references: [id], onDelete: Cascade)
  teamPlayer         TeamPlayer?      @relation("JerseyDutyHolder", fields: [teamPlayerId], references: [id], onDelete: SetNull)
  swapTo             TeamPlayer?      @relation("JerseyDutySwapTarget", fields: [swapToTeamPlayerId], references: [id], onDelete: SetNull)
  // acceptedBy/doneBy/voidedBy: User? SetNull
}

model EventJerseyDecline {
  eventId      String
  teamPlayerId String
  declinedAt   DateTime @default(now())
  // relations Cascade both ways
  @@id([eventId, teamPlayerId])
}

model TeamPlayer {
  // …
  jerseyDutyExempt Boolean @default(false)
}

model Team {
  // …
  jerseyRotationEnabled Boolean @default(true)
}
```

1–1 row rather than columns on `Event`, same reasoning as `EventMeeting`: most of its fields are null most of the time and only MATCH events have one.

**Migration.** For every MATCH with `jerseysTeamPlayerId` set, the team's previous MATCH gets a duty row for that player (`source: BACKFILL`, no `acceptedAt`) when it has none: « brought to N » and « washed after N−1 » are the same fact. A team's first match has no previous one and its value is dropped. Accepted: it is exactly the rotation as clubs run it (after a game someone takes the bag, washes it, brings it back to the next game). Then `jerseysTeamPlayerId` is nulled on every MATCH; the column stays for TRAINING chasubles.

## API

All under `clubs/:clubId/teams/:teamId`. Player-side routes take `?forPlayerId=` (F2) and carry `@AllowGuardians()`.

| Route                                                      | Who                                                   | Does                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET events/:eventId/jersey-duty`                          | event audience                                        | `JerseyDutyDetail`: holder, status, suggestion (+ why), brought-by, pending swap, my rights |
| `POST events/:eventId/jersey-duty/accept`                  | suggested player, holder, or pool member volunteering | Becomes / confirms holder, `source: SELF`                                                   |
| `POST events/:eventId/jersey-duty/decline`                 | holder or suggested player                            | Clears holder if any, writes `EventJerseyDecline`                                           |
| `POST events/:eventId/jersey-duty/swap` `{teamPlayerId}`   | holder                                                | Sets `swapToTeamPlayerId`, notifies the target's audience                                   |
| `POST events/:eventId/jersey-duty/swap/accept` · `/refuse` | swap target                                           | Accept moves the duty (`source: SWAP`, accepted) and notifies the old holder                |
| `DELETE events/:eventId/jersey-duty/swap`                  | holder                                                | Cancels the pending swap                                                                    |
| `PUT events/:eventId/jersey-duty` `{teamPlayerId \| null}` | `TeamManagerGuard`                                    | Assign / clear, `source: MANAGER`, notifies                                                 |
| `POST`/`DELETE events/:eventId/jersey-duty/done`           | `TeamManagerGuard`                                    | Mark / unmark « Fait »                                                                      |
| `POST`/`DELETE events/:eventId/jersey-duty/void`           | `TeamManagerGuard`                                    | Void / unvoid the turn                                                                      |
| `GET jersey-rotation?season=`                              | team audience (guardians included)                    | `JerseyRotationOverview`                                                                    |
| `PATCH` team settings `{jerseyRotationEnabled}`            | `TeamManagerGuard`                                    | Existing team edit route, new field                                                         |
| `PATCH players/:teamPlayerId` `{jerseyDutyExempt}`         | `TeamManagerGuard`                                    | Existing roster-entry route, new field                                                      |

All player-side writes refuse after kickoff (`409 JERSEY_DUTY_LOCKED`) and on a TRAINING (`400`). `PATCH events/:eventId/logistics` with `field: 'JERSEYS'` on a MATCH answers `400 USE_JERSEY_DUTY`.

**On `TeamEvent`** (cheap, no suggestion): `jerseyDuty: { holder: EventLogisticsAssignee | null; status: 'UNASSIGNED' | 'ASSIGNED' | 'ACCEPTED' | 'DONE' | 'VOIDED'; broughtBy: EventLogisticsAssignee | null; isMine: boolean } | null`, null for a TRAINING. `logistics.jerseys` is null for a MATCH from now on. `broughtBy` is the holder of the previous MATCH's non-voided duty: one extra query per batch (previous match per event via a window over the team's matches). `MyAgendaEvent` mirrors it.

**Suggestion cost.** Only `GET …/jersey-duty` computes it, only for the next match: pool (convocations ∩ GOING RSVPs ∩ not exempt ∩ not declined) and one `groupBy` over the season's non-voided duty rows of the team. Bounded, independent of season length.

## Notifications

New `NotificationType`s, copy in `server/src/events/jersey-duty-notification-copy.ts` (Europe/Paris dates, `common/event-copy.ts` fixture wording):

- `JERSEY_DUTY_ASSIGNED` « Lavage des maillots » — « Vous lavez les maillots après le match contre X samedi 4 oct. » / guardian copy « Léo lave les maillots… ». Sent on manager assignment, kickoff freeze and accepted swap. Not on self-accept (the reader did it).
- `JERSEY_SWAP_REQUESTED` « Échange proposé » — « Emma M. vous propose de laver les maillots à sa place après le match contre X. » Needed for decision 11 to work at all; strictly an assignment proposal, so within « on assignment ».

## Frontend

- **Match page** (`EventLogisticsCard`, MATCH branch): the « Maillots » row becomes « Lavage des maillots » with, top to bottom: « Apportés par Lucas D. » (derived), then the holder or the suggestion (« Suggestion : Emma M. · 2 lavages cette saison »), then the actions for the reader: « C'est noté », « Je ne peux pas », « Proposer un échange » (a `Dialog` listing the pool, react-hook-form), and for a manager a `SelectField` to assign plus « Fait » / « Annuler ce tour ». A pending swap shows on both sides. Outcomes as `toast()`.
- **Team page**: « Lavage des maillots » section (`SectionHeading`), a `ResponsiveTable` per player: lavages cette saison, dernier lavage, « Exempté » `Badge`, next match's suggestion on top. Visible to the whole team; manager-only exemption toggle inline per row.
- **Agenda / dashboard**: the existing jersey mini chip reads the new `jerseyDuty` (« Vous lavez les maillots » when `isMine`).
- Query branches `error → loading → empty → data` everywhere; persona is the last segment of the query keys.

## Parts

1. Backend: schema + migration + backfill, `TeamEvent.jerseyDuty`, duty routes, suggestion, freeze job, rotation overview. Unit specs + a `test/db` case for the backfill and the `SetNull` on roster removal.
2. Notifications: the two types, audience fan-out, copy.
3. Match page card + swap dialog, agenda chip.
4. Team page section + exemption toggle.

## Out of scope

Rotation by jersey number, « rapportez les maillots » reminders, « set not returned » alerts, household/family grouping, cross-team sibling balancing, washing for chasubles or balls, a configurable list of other duties (goûter, buvette, table de marque).

## Open questions

1. **Handing over between matches.** After match N the holder has the bag at home. If they then can't make match N+1, can they pass the duty (and the bag) to a teammate themselves, or must a manager reassign? This spec says manager only, since player swaps close at N's kickoff.
