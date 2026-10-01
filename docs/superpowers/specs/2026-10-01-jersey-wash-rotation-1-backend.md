# Jersey wash rotation, part 1: backend

**Status:** spec, not built. **Date:** 2026-10-01. **Design:** [`2026-10-01-jersey-wash-rotation-design.md`](./2026-10-01-jersey-wash-rotation-design.md) (decisions 1–15, F1–F8, Rules, Data model, API). This part has no screen; the states it must serve are the artboards of parts 3 and 4, listed per field below so the contract carries everything they draw.

**One PR.** Leaves `main` green and the app working: the match page keeps rendering, because `logistics.jerseys` goes null on a MATCH and the existing card already renders « Non assigné » for null. Part 3 replaces that row. No notification is sent by this part (part 2 adds them at the emission points marked **[P2]** below).

## Scope

Schema + migration + backfill, shared types, `TeamEvent.jerseyDuty`, the duty routes, the suggestion, the kickoff freeze job, the rotation overview, the two new manager fields, the RGPD export. Unit specs plus `server/test/db` cases. `backend-slice` checklist applies; `privacy-review` runs before the PR (guardians act for minors, new `*ByUserId` columns, export).

## Corrections to the design (found in the code)

| Design says                                                 | Code says                                                                                                                                                        | Spec decision                                                                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH players/:teamPlayerId {jerseyDutyExempt}`            | The route is `PATCH clubs/:clubId/teams/:teamId/players/:playerId`, keyed by **`Player.id`** (`teamId_playerId`), and `UpdateTeamPlayerDto.role` is **required** | Keep the route and its `:playerId`. `role` and `jerseyDutyExempt` both become `@IsOptional()`, at least one required (400 otherwise). Rename `updateTeamPlayerRole` → `updateTeamPlayer`. |
| `PATCH` team settings `{jerseyRotationEnabled}`             | `UpdateTeamDto` / `TeamsService.updateTeam` accept `name`/`category`/`gender` only, typed inline                                                                 | Add `jerseyRotationEnabled?: boolean` to `UpdateTeamRequest`, the DTO and the service's `data` type. `Team` gains the field.                                                              |
| Player-side routes take `?forPlayerId=`                     | `forPlayerId` is a **`Player.id`**, resolved by `resolveActingTeamPlayer` (`server/src/common/acting-as.ts`)                                                     | Same: `ActingAsQueryDto`, never a `TeamPlayer.id` from the client for the acting persona.                                                                                                 |
| `seasonYearFor` « from `team-stats` »                       | Exported from `team-stats.service.ts`, already imported by `platform-admin-stats.service.ts`                                                                     | Move `seasonYearFor` + `seasonWindow` to `server/src/common/season.ts`, update both importers. Events must not import a sibling module's service file.                                    |
| Guardians act for jersey duty (F2)                          | `docs/decisions/guardians.md` decision 9 lists « jerseys/balls » among what a parent can't do; `PATCH .../logistics` has no `@AllowGuardians()`                  | Lift it for jersey **duty** only, in the same PR: amend decision 9 (balls and chasubles stay player-only, the `logistics` route keeps no `@AllowGuardians()`).                            |
| (not in design)                                             | The RGPD export (`PlatformAdminService`, `logisticsAssignments` with `duty: 'JERSEYS' \| 'BALLS'`) reads `TeamPlayer.jerseysAssignedEvents`                      | Add the person's duty rows (see « RGPD export »). Without it, a nulled MATCH column silently drops data from the export.                                                                  |
| `TeamEvent.logistics` « populated for both event types »    | Comment in `types/events.ts` and `EventsService.toTeamEvent` say so                                                                                              | `toTeamEvent` forces `logistics.jerseys` to null on a MATCH whose team has the rotation on (a value set while it was off must not show beside the duty); update both comments.            |
| « `MyAgendaEvent` mirrors it »; « Agenda / dashboard » chip | `MyAgendaEvent.logistics` has **no frontend reader**: the dashboard renders no logistics chip; only `TeamEventsAgenda`/`EventRow` (on `TeamEvent`) do            | `MyAgendaEvent` does **not** gain `jerseyDuty` (a field nobody reads is dead contract). `DashboardService` is unchanged.                                                                  |

## Schema (`server/prisma/schema.prisma`)

As in the design's Data model, plus:

- `EventJerseyDuty.acceptedBy` / `doneBy` / `voidedBy`: `User?` relations, `onDelete: SetNull` (erasure of a guardian keeps the turn; « Accepté par » then disappears).
- `@@index([teamPlayerId])` and `@@index([swapToTeamPlayerId])` on `EventJerseyDuty`; `@@index([teamPlayerId])` on `EventJerseyDecline`.
- Back-relations on `Event` (`jerseyDuty EventJerseyDuty?`, `jerseyDeclines EventJerseyDecline[]`), `TeamPlayer` (`jerseyDuties`, `jerseySwapRequests`, `jerseyDeclines`) and `User`.
- `TeamPlayer.jerseyDutyExempt Boolean @default(false)`, `Team.jerseyRotationEnabled Boolean @default(true)`.
- **Rotation off keeps today's behaviour.** On a team with `jerseyRotationEnabled: false`, a MATCH uses `Event.jerseysTeamPlayerId` exactly as today; `jerseyDuty` is null on its `TeamEvent`, and every duty route answers `409 JERSEY_ROTATION_DISABLED`. Turning the switch off or on never rewrites rows: duty rows stay and count again when it comes back on.

## Migration (`server/prisma/migrations/<ts>_jersey_wash_rotation/migration.sql`)

Hand-written in Prisma's style, then `prisma generate`.

1. Enum, two tables, two columns, FKs, indexes.
2. **Backfill** in one `INSERT … SELECT`: for every MATCH `m` with `jerseysTeamPlayerId` set, the team's previous MATCH `p` (`LAG(id) OVER (PARTITION BY "teamId" ORDER BY "startsAt", id)` over `type = 'MATCH'`) gets `("eventId" = p.id, "teamPlayerId" = m."jerseysTeamPlayerId", source = 'BACKFILL')`, `ON CONFLICT ("eventId") DO NOTHING`. A team's first match has no `p`: dropped (design, accepted).
3. `UPDATE "Event" SET "jerseysTeamPlayerId" = NULL WHERE type = 'MATCH'`.

Backfill runs regardless of the switch (on by default for every team at migration time).

## Shared types (`packages/@basketeasy/types/jersey-duty.ts`, new subpath export)

```ts
export type JerseyDutyStatus = 'UNASSIGNED' | 'ASSIGNED' | 'ACCEPTED' | 'DONE' | 'VOIDED';

/** On every MATCH `TeamEvent` of a team with the rotation on; null otherwise. */
export interface EventJerseyDutySummary {
  holder: EventLogisticsAssignee | null;
  status: JerseyDutyStatus;
  broughtBy: EventLogisticsAssignee | null;
  /** The acting persona holds it (the reader, or the child they act for). */
  isMine: boolean;
}

export interface JerseyDutyCandidate extends EventLogisticsAssignee {
  turnsThisSeason: number;
  lastTurnAt: string | null;
}

export interface JerseyDutyDetail {
  eventId: string;
  teamGender: Gender; // copy agreement: « joueuses convoquées », « Exemptée »
  locked: boolean; // startsAt passed
  status: JerseyDutyStatus;
  holder: (JerseyDutyCandidate & { gender: Gender | null; reachable: boolean }) | null;
  acceptedBy: EventRsvpRespondent | null; // toRsvpRespondent, F3 « Accepté par Sophie M. », the caller who accepted, never the persona
  broughtBy: EventLogisticsAssignee | null;
  suggestion:
    | {
        kind: 'SUGGESTED';
        candidate: JerseyDutyCandidate & { gender: Gender | null; reachable: boolean };
        /** Strictly fewer turns than every other pool member: « …, le moins de l'équipe ». */
        isFewest: boolean;
      }
    | { kind: 'EMPTY_POOL' } // « Aucune suggestion pour l'instant »
    | { kind: 'AFTER_PREVIOUS'; previousMatchStartsAt: string } // « Suggestion après le match du 4 oct. »
    | null; // a holder exists, or locked
  /** Convoked ∩ GOING, exemptions included: « Parmi 8 joueuses convoquées et présentes, 1 exemptée. » */
  pool: { convokedGoingCount: number; exemptedCount: number };
  /** Swap targets, suggestion order, the acting persona excluded. Empty unless `rights.canSwap`. */
  swapCandidates: JerseyDutyCandidate[];
  pendingSwap: { to: EventLogisticsAssignee; requestedAt: string } | null;
  /** « Ramène le sac au match du 11 oct. » */
  nextMatchStartsAt: string | null;
  rights: {
    canAccept: boolean; // suggested persona, or holder not yet accepted
    canDecline: boolean;
    canSwap: boolean; // holder or suggested persona, no swap pending
    canCancelSwap: boolean;
    canRespondToSwap: boolean; // acting persona is the swap target
    canManage: boolean; // TeamManagerGuard, and not acting for a child
  };
}

export interface JerseyRotationRow extends JerseyDutyCandidate {
  /** `Player.id`: the key of `PATCH …/players/:playerId` (the exemption toggle). */
  playerId: string;
  exempt: boolean;
  isMe: boolean; // the acting persona
}

export interface JerseyRotationOverview {
  seasonYear: number;
  teamGender: Gender;
  enabled: boolean;
  canManage: boolean; // TeamManagerGuard, and not acting for a child: shows the toggles
  nextMatch: {
    eventId: string;
    startsAt: string;
    holder: EventLogisticsAssignee | null;
    suggestion: EventLogisticsAssignee | null;
  } | null;
  /** Suggestion order (design decision 5), exempted rows last. */
  rows: JerseyRotationRow[];
}

export interface AssignJerseyDutyRequest {
  teamPlayerId: string | null;
}
export interface ProposeJerseySwapRequest {
  teamPlayerId: string;
}
export const JERSEY_DUTY_ERROR_CODES = {
  LOCKED: 'JERSEY_DUTY_LOCKED',
  NOT_STARTED: 'JERSEY_DUTY_NOT_STARTED',
  ROTATION_DISABLED: 'JERSEY_ROTATION_DISABLED',
  USE_JERSEY_DUTY: 'USE_JERSEY_DUTY',
} as const;
```

`TeamEvent` gains `jerseyDuty: EventJerseyDutySummary | null`. `Team` gains `jerseyRotationEnabled`, `TeamPlayer` gains `jerseyDutyExempt`, `UpdateTeamPlayerRequest` becomes `{ role?; jerseyDutyExempt? }`.

### Which artboard each field serves

| Field                                            | Artboard (`assets/2026-10-01-jersey-wash-rotation/`)                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `suggestion.kind: 'SUGGESTED'`, `isFewest`       | [`Main`](./assets/2026-10-01-jersey-wash-rotation/Main.dc.html), [`Parent`](./assets/2026-10-01-jersey-wash-rotation/Parent.dc.html), [`Coequipier`](./assets/2026-10-01-jersey-wash-rotation/Coequipier.dc.html), [`Coach-avant`](./assets/2026-10-01-jersey-wash-rotation/Coach-avant.dc.html) |
| `status: 'ACCEPTED'`                             | [`Accepte`](./assets/2026-10-01-jersey-wash-rotation/Accepte.dc.html)                                                                                                                                                                                                                            |
| `acceptedBy`                                     | [`Parent-2`](./assets/2026-10-01-jersey-wash-rotation/Parent-2.dc.html)                                                                                                                                                                                                                          |
| `swapCandidates`                                 | [`Echange`](./assets/2026-10-01-jersey-wash-rotation/Echange.dc.html)                                                                                                                                                                                                                            |
| `pendingSwap`, `rights.canCancelSwap`            | [`Echange-attente`](./assets/2026-10-01-jersey-wash-rotation/Echange-attente.dc.html)                                                                                                                                                                                                            |
| `rights.canRespondToSwap`                        | [`Echange-cible`](./assets/2026-10-01-jersey-wash-rotation/Echange-cible.dc.html)                                                                                                                                                                                                                |
| `pool`, `rights.canManage`                       | [`Coach-avant`](./assets/2026-10-01-jersey-wash-rotation/Coach-avant.dc.html)                                                                                                                                                                                                                    |
| `locked`, `nextMatchStartsAt`                    | [`Coach-apres`](./assets/2026-10-01-jersey-wash-rotation/Coach-apres.dc.html)                                                                                                                                                                                                                    |
| `suggestion.kind: 'EMPTY_POOL'`                  | [`Vide`](./assets/2026-10-01-jersey-wash-rotation/Vide.dc.html)                                                                                                                                                                                                                                  |
| `suggestion.kind: 'AFTER_PREVIOUS'`, `broughtBy` | [`Plus-tard`](./assets/2026-10-01-jersey-wash-rotation/Plus-tard.dc.html)                                                                                                                                                                                                                        |
| `JerseyRotationOverview`                         | [`Equipe`](./assets/2026-10-01-jersey-wash-rotation/Equipe.dc.html), [`Equipe-coach`](./assets/2026-10-01-jersey-wash-rotation/Equipe-coach.dc.html)                                                                                                                                             |

`gender` (the player's, falling back to `teamGender` client-side) exists because the guardian copy agrees with the child: « Il ne peut pas », « Elle lave les maillots ».

## Service (`server/src/events/jersey-duty.service.ts`)

Its own service and controller (`JerseyDutyController`, same `clubs/:clubId/teams/:teamId` prefix) inside `EventsModule`, so `events.service.ts` doesn't grow by 500 lines. Queries Prisma directly (cross-module convention). Every route starts with `assertEventInTeam` (team in club, event in team), then `type === MATCH` (else `400`), then `team.jerseyRotationEnabled` (else `409 JERSEY_ROTATION_DISABLED`).

### Definitions (one place, `jersey-duty-rules.ts`, pure, unit-tested)

- **Counted turn:** a duty row with `teamPlayerId` not null, `voidedAt` null, on a MATCH of the team whose `startsAt <= now` and inside the season window (`seasonWindow(seasonYearFor(event.startsAt))`). Pre-kickoff rows don't count yet (decision 9).
- **Pool** for an event: `EventConvocation` ∩ `EventRsvp.status = GOING` ∩ `TeamPlayer.jerseyDutyExempt = false` ∩ no `EventJerseyDecline` for that event.
- **Order** (decision 5): `turnsThisSeason` asc → `lastTurnAt` asc with null first → `lastName`, `firstName` (`localeCompare(…, 'fr')`) → `TeamPlayer.id`.
- **Next match:** the team's earliest MATCH with `startsAt > now`. Only it gets `SUGGESTED`/`EMPTY_POOL`; any later MATCH with no holder gets `AFTER_PREVIOUS` (with the next match's `startsAt`).
- **No holder before kickoff = no row.** Decline and a pre-kickoff manager clear **delete** the row (the pending swap goes with it). After kickoff, a manager clear keeps the row with `teamPlayerId: null`. This is what lets the freeze job select « no row » and never re-assign a match a manager cleared on purpose.
- **Accepted transient:** between kickoff and the next freeze tick (≤ 10 min) the just-played match has no row yet, so the next match's suggestion is computed without that turn. Not worth a second code path; the freeze job re-reads the pool when it runs.

### Reads

- `TeamEvent.jerseyDuty` in `buildTeamEventsForUser`: one `findMany` of the batch's duty rows + **one** `$queryRaw` for `broughtBy` (`LAG` over the batch teams' MATCH events, joined to the previous event's non-voided duty row) + the holder names through the existing `resolveLogisticsAssignees` map (extend its id set). Bounded, independent of batch size. `isMine` compares with the persona from `resolveMyEventState`.
- `GET events/:eventId/jersey-duty`: the row, the season's counted turns (`groupBy` on `teamPlayerId` with `_count` and `_max` of the event's `startsAt` via a raw query, or a `findMany` of the season's counted rows' `(teamPlayerId, startsAt)`; either is one query bounded by the season), the pool (convocations + RSVPs + declines, three `findMany` in parallel), `reachable` (`resolvePlayerAudience` for the one or two candidates shown). Writes nothing.
- `GET jersey-rotation?season=&forPlayerId=` (`JerseyRotationController`, `ClubRolesGuard` + `@AllowGuardians()`): roster (full, so a player who never washed shows at 0), the season's counted turns, and the next match's holder or suggestion computed with the same functions. Default season = current. The one duty route that answers on a rotation-off team (`enabled: false`, `nextMatch: null`), so a manager can still see and flip the switch.

### Writes (all in one `$transaction`; player-side ones `409 JERSEY_DUTY_LOCKED` once `startsAt <= now`)

| Action                | Precondition (else)                                                                                           | Effect                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accept`              | persona is holder, or the current suggestion, or in the pool with no **accepted** holder (volunteering) (403) | upsert row: `teamPlayerId` = persona, `source: SELF`, `acceptedAt`, `acceptedByUserId` = caller; clears a pending swap if the holder changed                                                        |
| `decline`             | persona is holder or current suggestion (403)                                                                 | delete the row if persona holds it; upsert `EventJerseyDecline`                                                                                                                                     |
| `swap {teamPlayerId}` | persona is holder or current suggestion; no pending swap (409); target in pool, not the persona (400)         | upsert row as `accept` would (proposing implies taking it: « Vous restez responsable tant qu'elle n'a pas accepté »), set `swapToTeamPlayerId`, `swapRequestedAt`. **[P2]** `JERSEY_SWAP_REQUESTED` |
| `DELETE swap`         | persona is holder with a pending swap (404 if none)                                                           | clear the swap fields                                                                                                                                                                               |
| `swap/accept`         | persona is the swap target (403); target still in pool (409)                                                  | conditional `updateMany` on `swapToTeamPlayerId` (first writer wins): holder = target, `source: SWAP`, `acceptedAt`, `acceptedByUserId` = caller, swap cleared. **[P2]** notify the previous holder |
| `swap/refuse`         | persona is the swap target (403)                                                                              | clear the swap fields                                                                                                                                                                               |
| `PUT {teamPlayerId}`  | `TeamManagerGuard`; id on the team's roster (400; pool and exemption not required, design « Manager powers ») | non-null: upsert, `source: MANAGER`, `acceptedAt` null, swap cleared. **[P2]** `JERSEY_DUTY_ASSIGNED`. null: before kickoff delete the row, after kickoff keep it with `teamPlayerId: null`         |
| `POST/DELETE done`    | `TeamManagerGuard`; kickoff passed (`409 JERSEY_DUTY_NOT_STARTED`); a holder (409)                            | set / clear `doneAt`, `doneByUserId`                                                                                                                                                                |
| `POST/DELETE void`    | same as done                                                                                                  | set / clear `voidedAt`, `voidedByUserId`                                                                                                                                                            |

Player-side routes: `@UseGuards(ClubRolesGuard) @ClubRoles('ADMIN','MEMBER') @AllowGuardians()`, persona through `resolveActingTeamPlayer({ userId, teamId, forPlayerId })` (a stranger's id is a 403, never « not rostered »). The acting persona must be on the roster (`403`). Every write answers the fresh `JerseyDutyDetail`, so the client sets it into the cache rather than refetching. Manager routes: `TeamManagerGuard`, no `@AllowGuardians()`. `GET` answers the event audience (`ClubRolesGuard` + `@AllowGuardians()`, like `GET events/:eventId`).

### Interaction with existing code

- `PATCH events/:eventId/logistics` with `field: 'JERSEYS'` on a MATCH of a rotation-on team: `400 USE_JERSEY_DUTY`. Balls and TRAINING chasubles unchanged.
- `EventsService.updateEvent` MATCH → TRAINING deletes the duty row and declines (next to the existing `eventMeeting.deleteMany`). TRAINING → MATCH: nothing to do.
- `TeamsService.removeTeamPlayer`: in the same transaction as the delete, delete that player's duty rows on matches **not yet started** (so the next match's suggestion moves on rather than holding a null row the freeze would skip). Started ones are left to the `SetNull` (« Aucun », the turn stops counting).
- FFBB import (`ffbb-import.service.ts`) creates/moves MATCHes without touching duties: a moved kickoff simply moves the lock; no change needed. Say so in a comment where it writes `startsAt`.

## Kickoff freeze (`server/src/events/jersey-duty-freeze.*`)

- New `JERSEY_DUTY_FREEZE_QUEUE` registered in `QueueModule`; `onModuleInit` calls `upsertJobScheduler('jersey-duty-freeze', { every: 10 * 60_000 }, …)`, scheduling failure logged and swallowed (same shape as `RetentionModule`, same « `REDIS_URL` is not boot-validated » policy). `JERSEY_DUTY_FREEZE_ENABLED` (default on) gates it.
- The processor delegates to `JerseyDutyService.freezeDue(now)`: MATCH events with `startsAt` in `(now − 7 days, now]`, team rotation on, **no duty row**, at most 200 per run ordered by `startsAt`. For each: compute the pool and order **as of now**, and if non-empty `createMany` with `skipDuplicates` (a concurrent manager write wins) `source: SUGGESTION`. **[P2]** notify the frozen holders. Empty pool: nothing written.

## RGPD export

`PlatformAdminService` export: `logisticsAssignments` gains `duty: 'JERSEY_WASH'` entries from the person's `jerseyDuties` (`eventStartsAt`, plus `status`), and the acts the person did as a caller (`acceptedByUserId`, guardians included) appear under the existing respondent section the way `EventRsvp.respondedByUserId` does. `doneBy`/`voidedBy` are staff-side acts on someone else's turn: omitted from the subject's bundle (art. 15(4), same reasoning as the acting admin's identity). Update the bundle's `notice` block.

## Tests

- Unit: `jersey-duty-rules.spec.ts` (order with ties at each level, pool, `isFewest`, next-match / `AFTER_PREVIOUS`), `jersey-duty.service.spec.ts` (every row of the writes table: success, each precondition's status code, the lock, guardian persona, stranger `forPlayerId` 403, rotation off 409), `jersey-duty.controller.spec.ts` (guards and decorators per route), freeze processor and scheduler registration (mirror `retention.module.spec.ts`), `events.service.spec.ts` (logistics 400, MATCH → TRAINING deletes), `teams.service.spec.ts` (optional fields, removal deletes pre-kickoff rows).
- `server/test/db/jersey-duty.db-spec.ts`: the migration's backfill (first match dropped, conflict skipped, MATCH column nulled, TRAINING untouched); `SetNull` on roster removal after kickoff; cascade with the event; the `broughtBy` `LAG` query across two teams; concurrent `swap/accept` (one winner); freeze `skipDuplicates` against a manager write.

## Docs in the same PR

`CLAUDE.md`: a « Jersey wash rotation » subsection under Events (no-row-before-kickoff rule, the freeze selects « no row », suggestion computed on read only, guardians lifted for duty only, `logistics.jerseys` null on a rotation MATCH). `docs/decisions/events.md`: the decision tables from the design, the corrections above. `docs/decisions/guardians.md`: amend decision 9. Delete this spec file.

## Out of scope for this part

Notifications (part 2), every screen (parts 3, 4), and everything in the design's « Out of scope ».
