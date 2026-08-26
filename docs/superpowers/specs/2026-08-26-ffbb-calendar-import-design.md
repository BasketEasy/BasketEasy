# FFBB calendar import

Status: draft (loop 0)
Date: 2026-08-26

## Why

A club's official match calendar already exists — the FFBB publishes it on
[competitions.ffbb.com](https://competitions.ffbb.com) per team (e.g.
`.../equipes/200000005346381`). Today a coach has to re-type every match into
BasketEasy's `Event` calendar (`server/src/events`) by hand: date, opponent,
venue, one `MATCH` event at a time. That's exactly the kind of team-day
friction BasketEasy exists to remove — and it's squarely inside the product's
stated positioning as "a companion layer to the FFBB's mandatory federal
stack," not a replacement for it (`CLAUDE.md`). This spec is a one-way,
admin-triggered import: pull a team's official matches from FFBB and create
(or refresh) `Event` rows for them, so the calendar a coach manages in
BasketEasy — RSVP, convocations, notes — starts from the federation's own
fixture list instead of a blank page.

## How the FFBB calendar is actually built (research)

`competitions.ffbb.com` is a frontend SPA over an **unofficial, undocumented**
JSON API at `https://api.ffbb.com` — a **Directus**-backed headless-CMS REST
API (not a public, versioned "standard" FFBB publishes or supports; several
independent open-source clients have reverse-engineered it: `Fimeo/ffbb-api-ts`
(TypeScript), `nickdesi/ffbb-data-client` and `ffbb-api-client-v2` (Python)).
Key points for this spec, gathered from those clients' docs (this sandbox
cannot reach `api.ffbb.com`/`competitions.ffbb.com` directly — egress to FFBB
domains is proxy-blocked here, so the exact response shape below needs a
one-time empirical confirmation from an environment that *can* reach it,
before finalizing the field mapping):

- **Auth:** tokens are obtained automatically and publicly — the site itself
  fetches a bearer token from `GET /items/configuration` (a Directus
  collection, not a login) on page load, no API key registration or FFBB
  account needed. Both a Directus token (REST) and a Meilisearch token
  (search) come back; we only need the Directus one.
- **Collections relevant here:** `organismes` (clubs), `competitions`,
  `poules` (pools/groups), `engagements` (a club's entry of one team into a
  poule/competition — this is what the URL's `equipes/<id>` segment
  identifies), `rencontres` (matches).
- **Team URL → API mapping**, from the example URL structure
  (`ligues/pdl/comites/0044/clubs/pdl0044190/equipes/200000005346381`):
  `pdl` = ligue code, `0044` = comité code, `pdl0044190` = `organisme.code`
  (the club), `200000005346381` = the `engagement` id for that specific team
  — this is the id we store and query by, not the club code.
- **Querying matches for one team:** `rencontres` don't have a direct
  "belongs to equipe X" field beyond the two engagement references; a client
  filters with `idEngagementEquipe1` or `idEngagementEquipe2` equal to the
  team's engagement id (Directus filter syntax, `_or` of two `_eq`), e.g.:
  ```
  GET /items/rencontres
    ?filter={"_or":[{"idEngagementEquipe1":{"_eq":"200000005346381"}},{"idEngagementEquipe2":{"_eq":"200000005346381"}}]}
    &fields=id,date_rencontre,numero,numeroJournee,joue,resultatEquipe1,resultatEquipe2,nomEquipe1,nomEquipe2,idEngagementEquipe1,idEngagementEquipe2,salle.libelle,salle.commune.libelle
    &sort=date_rencontre
    &limit=-1
    Authorization: Bearer <directus token>
  ```
- **Rencontre (match) fields we use:** `id` (stable external id),
  `date_rencontre` (kickoff date/time — exact timezone/offset serialization
  to be confirmed empirically, see Open questions), `nomEquipe1`/`nomEquipe2`
  (display names), `idEngagementEquipe1`/`idEngagementEquipe2` (which side is
  "us" vs. opponent), `joue` (bool, already played), `resultatEquipe1`/
  `resultatEquipe2` (score, once played), `salle.libelle` +
  `salle.commune.libelle` (venue name + town). No "cancelled" flag is
  documented — see Scope.
- **No documented rate limits or terms of use.** Because this is not an
  official, stable integration point, the client (below) must behave
  defensively: short timeouts, no polling, cache the token, and fail the
  import cleanly (a toast, not a crash) if FFBB's shape drifts.

## Scope

**In scope:**

- An admin/`TeamManagerGuard`-eligible manager links a `Team` to its FFBB
  engagement id by pasting the `competitions.ffbb.com` team URL they already
  have open (parsed server-side; a bare numeric id also works).
- A manual "Importer le calendrier FFBB" action pulls every `rencontre` for
  that engagement id and creates/updates one `MATCH` `Event` per rencontre on
  that team, idempotently (re-running the import never duplicates a match).
- Re-running the import after FFBB updates a match's date/time/venue updates
  the existing `Event` **in place** (same `id`), so `EventRsvp`/
  `EventConvocation` rows tied to that event survive a schedule change
  instead of being orphaned by a delete-and-recreate.
- Imported events are visibly distinct from manually-created ones (so a
  manager knows which rows a re-import will touch) and manually-entered
  `notes` on an imported event are never overwritten by a re-sync.

**Out of scope (explicitly deferred, don't build speculatively):**

- **Automatic/scheduled re-sync** (a nightly BullMQ job). `CLAUDE.md`'s
  Scheduling module is explicitly "not yet built," and this spec doesn't need
  a queue to be useful — v1 is a manual button a manager clicks before a
  season and occasionally after (e.g. after FFBB reschedules a match). Add a
  scheduled job as its own follow-up once the manual flow has proven the
  mapping is reliable, not bundled in here.
- **Two-way sync / writing back to FFBB.** BasketEasy never pushes anything
  to `api.ffbb.com` — read-only, one direction, matching the "companion
  layer, not a replacement" positioning.
- **Importing results/scores** into BasketEasy's data model. `resultatEquipe1`/
  `2` and `joue` are fetched (useful for filtering/labeling) but there's no
  score field on `Event` today and adding one is a separate feature
  (scoresheet capture is its own planned P1 module) — v1 only uses `joue` to
  skip re-touching already-played matches on re-sync (see Data model).
- **Detecting/handling matches removed from the FFBB feed** (postponed to
  "TBD," forfeited, etc. — no `cancelled` flag is documented). v1 never
  deletes an `Event` it previously imported; a mismatch is left for manual
  cleanup. Worth a follow-up once the exact behavior of a cancelled
  `rencontre` is confirmed against the real API.
- **CTC/multi-club disambiguation beyond what already exists.** A `Team`
  already models multi-club ownership (`ClubTeam`); the FFBB link is a
  property of the `Team` itself (one team, one federal engagement), not of
  any specific linked club.
- **Importing training sessions.** FFBB only publishes competitive matches;
  `type` is always `MATCH` for imported rows.

## Data model (Prisma)

```prisma
model Team {
  // ...existing fields...
  ffbbEquipeId String? @unique
}

model Event {
  // ...existing fields...
  externalId String?
}
```

- `Team.ffbbEquipeId`: the FFBB `engagement` id (e.g. `"200000005346381"`),
  set once via the link action below. `@unique` — one FFBB engagement maps to
  at most one BasketEasy team. `null` (the default/unset state) means the
  team has no FFBB link and the import action is unavailable.
- `Event.externalId`: the FFBB `rencontre.id` for an imported match; `null`
  for every manually-created event (Postgres treats each `NULL` as distinct,
  so plain events never collide with each other or with imports — the same
  "no row/no value means not this thing" convention `recurrenceId: null`
  already uses elsewhere in this schema). `@@unique([teamId, externalId])`
  makes the upsert in `FfbbImportService` (below) idempotent per team.

No new enum: whether an `Event` is FFBB-sourced is `externalId !== null`,
not a separate `source` field — nothing else imports events yet, and
`CLAUDE.md` explicitly rules out a direct e-Marque bridge, so a general
"provenance" field would be speculative.

## Backend

New module, `server/src/ffbb-import`, following the "query `PrismaService`
directly rather than importing another module's service" convention already
used by Events/Dashboard (`CLAUDE.md`):

- **`FfbbClientService`** — the only thing that talks to `api.ffbb.com`.
  - `getToken()`: fetches and caches (in-memory, per-instance) a bearer token
    from `GET /items/configuration`; refetches once on a `401` from any other
    call rather than pre-emptively expiring it (no documented TTL). Redis-backed
    cross-instance caching is a reasonable fast-follow, not needed for v1's
    single manual action.
  - `getRencontresForEquipe(equipeId: string): Promise<FfbbRencontre[]>` —
    the Directus query above, via native `fetch` (Node 20+, no new HTTP
    dependency needed — `server/package.json` has no axios today). Short
    timeout (~10s), one retry on network failure, and errors surface as a
    typed `FfbbImportError` rather than leaking a raw fetch failure to the
    controller.
  - `FFBB_API_BASE_URL` env var (default `https://api.ffbb.com`), so tests
    point it at a fixture server and prod can be repointed if FFBB moves
    domains.
- **`FfbbImportService`**
  - `linkTeam(clubId, teamId, ffbbUrlOrId: string): Promise<Team>` —
    `assertTeamInClub(clubId, teamId)` (private helper, mirrors
    `EventsService`'s own copy rather than importing `TeamsService`, per the
    established pattern), parses `ffbbUrlOrId` (accepts either a bare numeric
    id or a full `competitions.ffbb.com/.../equipes/<id>` URL via one regex,
    `400` if neither matches), then `team.update({ ffbbEquipeId })`.
  - `unlinkTeam(clubId, teamId): Promise<Team>` — sets `ffbbEquipeId: null`.
    Previously-imported `Event` rows are left untouched (still real events,
    just no longer subject to future re-sync).
  - `importSchedule(clubId, teamId): Promise<FfbbImportResult>` —
    `400` if `ffbbEquipeId` is unset; otherwise fetches rencontres, maps each
    to an `Event` shape (`type: 'MATCH'`, `startsAt` from `date_rencontre`,
    `opponentName` from whichever of `nomEquipe1`/`nomEquipe2` is *not* our
    `idEngagementEquipe{1,2}`, `location` as `` `${salle.libelle} — ${salle.commune.libelle}` ``
    when present), then per rencontre:
    ```typescript
    const existing = await this.prisma.event.findUnique({
      where: { teamId_externalId: { teamId, externalId: rencontre.id } },
    });
    if (!existing) {
      await this.prisma.event.create({ data: { teamId, externalId: rencontre.id, ...mapped } });
      created++;
    } else if (existing.joue) {
      unchanged++; // already played — FFBB won't reschedule it further, skip
    } else if (fieldsDiffer(existing, mapped)) {
      await this.prisma.event.update({ where: { id: existing.id }, data: mapped });
      updated++;
    } else {
      unchanged++;
    }
    ```
    `notes` is never part of `mapped` — a manager's own notes on an imported
    match are untouched by re-sync, matching Scope.

## API surface

| Method | Path                                    | Guard              | Notes                                                             |
| ------ | ---------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| PATCH  | `clubs/:clubId/teams/:teamId/ffbb-link`  | `TeamManagerGuard`  | body `{ ffbbUrlOrId: string }`; sets/replaces the team's FFBB link |
| DELETE | `clubs/:clubId/teams/:teamId/ffbb-link`  | `TeamManagerGuard`  | clears the link; does not touch previously-imported events         |
| POST   | `clubs/:clubId/teams/:teamId/ffbb-import`| `TeamManagerGuard`  | `400` if unlinked; returns `FfbbImportResult`                      |

Mounted under the existing `TeamManagerGuard` (club `ADMIN` of a linked club,
or a `TeamAdmin` of this team) — same authority level as editing team info or
managing events, which this effectively is.

## Shared types (`packages/@basketeasy/types/ffbb-import.ts`)

```typescript
export interface LinkFfbbTeamRequest {
  ffbbUrlOrId: string;
}

export interface FfbbImportResult {
  created: number;
  updated: number;
  unchanged: number;
}
```

`Team` (in `packages/@basketeasy/types/teams.ts`) gains
`ffbbEquipeId: string | null`.

## Frontend

- `TeamDetailPage.tsx`'s team-info area gains an "FFBB" block (visible when
  `canManage`, same gate as other team-info edits): shows the linked URL (or
  an empty state + input to paste one) and, once linked, an "Importer le
  calendrier FFBB" button.
- Linking is a **focused edit of one field with clear success/failure** —
  fits `CLAUDE.md`'s inline-editing case (single-field, low frequency but
  not destructive) better than a `Dialog`; a plain input + save button next
  to the existing team-info fields, no modal.
- The import action itself is a mutation with no fields to fill — a button,
  not a form — so its outcome (`created`/`updated`/`unchanged` counts, or a
  friendly error if FFBB is unreachable) surfaces via `toast()`
  (`@basketeasy/ui/toast-store`), per `CLAUDE.md`'s "outcome of a completed
  mutation" rule, since the button may have already been clicked from a tab
  that then re-renders.
- `EventRow`/`AgendaEventCard`: a small badge/icon on events where
  `externalId` is present (needs to be added to `TeamEvent` — currently
  omitted from the API response entirely; decide at implementation time
  whether to expose it as `isImported: boolean` rather than the raw FFBB id,
  to avoid leaking an internal-ish identifier into a public-ish response) so
  a manager can tell at a glance which matches came from FFBB before editing
  one.
- New hooks: `useFfbbLink`/`useFfbbUnlink`/`useFfbbImport` mutations,
  invalidating `teamQueryKey`/`teamEventsQueryKey` on success (same
  invalidation shape as other team-info mutations already in
  `app/src/clubs/`).

## Testing

- `FfbbClientService`: unit tests with a fetch mock — token fetch/caching,
  401-triggers-refetch, the Directus filter URL is built correctly for a
  given engagement id, and a network failure surfaces as `FfbbImportError`
  rather than throwing raw.
- `FfbbImportService`: fixture-driven tests (a small JSON array of rencontres
  covering: a new match → `created`; an existing unplayed match with a
  changed `date_rencontre` → `updated` and RSVPs/convocations on that event
  id survive; an existing *played* match → `unchanged` even if fields
  technically differ; a manually-created event with `externalId: null` is
  never touched by import). Opponent-name resolution tested for both "we're
  `idEngagementEquipe1`" and "we're `idEngagementEquipe2`" cases.
- Controller tests: guard wiring (`TeamManagerGuard`), `400` on import
  without a link, `400` on an unparseable `ffbbUrlOrId`.
- Vitest/RTL: the new team-info FFBB block (linked vs. unlinked states,
  import button loading/success/error toast).

## Open questions (resolve before/at implementation start)

1. **Exact `date_rencontre` serialization and timezone.** This sandbox
   cannot reach `api.ffbb.com` to inspect a live response (FFBB domains are
   proxy-blocked here). Confirm from an environment that can — likely
   `Europe/Paris` local time with no explicit offset, matching how
   `updateEventTimeOfDay`'s existing DST caveat is already documented in
   `CLAUDE.md` — before writing the `startsAt` mapping.
2. **What a cancelled/postponed match looks like in the feed** (removed
   entirely vs. a status field vs. `date_rencontre: null`) — confirm against
   a real match that's been rescheduled, since it changes whether "leave
   orphaned imports alone" (current Scope) is actually the safe default.
3. Confirm `rencontre.id` is stable across a full season for a given match
   (not regenerated if FFBB itself edits the fixture) — the idempotency
   guarantee in this spec depends on it.
