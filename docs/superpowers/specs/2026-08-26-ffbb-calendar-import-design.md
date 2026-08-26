# FFBB calendar import

Status: draft (loop 1)
Date: 2026-08-26

Loop 1 adds club- and team-creation UX for linking BasketEasy entities to
their FFBB identity (this was originally scoped as a single team-level
"paste a URL" action; see "FFBB entity hierarchy" and "Club & team linking
UX" below) and makes the FFBB integration boundary explicit as a single
adapter interface, per an explicit ask to keep this resilient to FFBB
changing its API contract.

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

## FFBB entity hierarchy

FFBB organizes competition data in four levels, all visible in a
`competitions.ffbb.com` team URL —
`ligues/pdl/comites/0044/clubs/pdl0044190/equipes/200000005346381`:

| Level | Example | What it is | Maps to |
| --- | --- | --- | --- |
| Ligue | `pdl` (Pays de la Loire) | Region | Not modeled in BasketEasy — a UI filter only |
| Comité | `0044` (Loire-Atlantique / CD44) | Department | Not modeled — a UI filter only |
| Organisme | `pdl0044190` | A club | `Club.ffbbClubCode` |
| Engagement | `200000005346381` | One club's entry of one specific team into one competition for one season | `Team.ffbbEngagementId` |

Two things worth being explicit about, since they shape the data model
below:

- **A club can have several engagements** (one per team it fields, and in
  principle more than one per team if that team plays more than one
  competition — e.g. championship + a cup — in the same season). BasketEasy
  only needs *one* engagement per `Team` — the one whose calendar we import
  — so `Team.ffbbEngagementId` is deliberately singular, not a list. If a
  team plays two competitions and a club wants both imported, that's future
  scope (see Open questions), not this spec.
- **The organisme code's structure (ligue+comité+suffix) is not something
  BasketEasy should rely on.** It looks composed from the one example URL
  we have, but nothing confirms that holds for every club in every ligue, or
  that it'll keep holding. BasketEasy stores the code FFBB gives us
  opaquely and never tries to parse or reconstruct it.

## How the FFBB calendar is actually built (research)

`competitions.ffbb.com` is a frontend SPA over an **unofficial, undocumented**
JSON API at `https://api.ffbb.com` — a **Directus**-backed headless-CMS REST
API (not a public, versioned "standard" FFBB publishes or supports; several
independent open-source clients have reverse-engineered it: `Fimeo/ffbb-api-ts`
(TypeScript), `nickdesi/ffbb-data-client` and `ffbb-api-client-v2` (Python)).
Key points for this spec, gathered from those clients' docs (this sandbox
cannot reach `api.ffbb.com`/`competitions.ffbb.com` directly — egress to FFBB
domains is proxy-blocked here, so everything below needs a one-time empirical
confirmation from an environment that *can* reach it, before finalizing field
mappings and before trusting the "search clubs" / "list a club's engagements"
calls this loop adds — see Open questions):

- **Auth:** tokens are obtained automatically and publicly — the site itself
  fetches a bearer token from `GET /items/configuration` (a Directus
  collection, not a login) on page load, no API key registration or FFBB
  account needed. Both a Directus token (REST) and a Meilisearch token
  (search) come back; we use both (Meilisearch backs the club-search picker
  below).
- **Collections relevant here:** `organismes` (clubs), `competitions`,
  `poules` (pools/groups), `engagements` (a club's entry of one team into a
  poule/competition — the `equipes/<id>` URL segment), `rencontres` (matches).
- **Querying matches for one engagement:** `rencontres` don't have a direct
  "belongs to engagement X" field beyond the two engagement references; a
  client filters with `idEngagementEquipe1` or `idEngagementEquipe2` equal to
  the engagement id (Directus filter syntax, `_or` of two `_eq`), e.g.:
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
  to be confirmed empirically), `nomEquipe1`/`nomEquipe2` (display names),
  `idEngagementEquipe1`/`idEngagementEquipe2` (which side is "us" vs.
  opponent), `joue` (bool, already played), `resultatEquipe1`/
  `resultatEquipe2` (score, once played), `salle.libelle` +
  `salle.commune.libelle` (venue name + town). No "cancelled" flag is
  documented — see Scope.
- **Club/engagement search (new in this loop):** the same Meilisearch
  full-text index the site's own club/team search box uses is reported to
  cover `organismes` (clubs); an `organisme` record is reported to carry its
  own `engagements[]`. Both are the basis for the pickers below — **not yet
  empirically confirmed from this sandbox**, so the lookup endpoints (below)
  are built with a graceful-failure fallback (manual code/ID entry) from day
  one, not added later as an afterthought.
- **No documented rate limits or terms of use.** Because this is not an
  official, stable integration point, every call this spec makes goes
  through one adapter (below) that can add caching, backoff, or a circuit
  breaker in one place if FFBB turns out to be fragile in practice.

## Abstraction: the `FfbbProvider` boundary

The explicit design goal here is that **if FFBB changes its API contract
(renames fields, moves off Directus, restructures the ligue/comité/club/
engagement hierarchy), only one file changes** — not the Prisma schema, not
the DTOs, not any controller, not any frontend component.

That boundary is a single interface, `server/src/ffbb/ffbb-provider.ts`:

```typescript
export interface FfbbClubResult {
  code: string; // opaque — never parsed/decomposed elsewhere in the app
  label: string; // display name, e.g. "Basket Club Basse-Goulaine"
}

export interface FfbbEngagementResult {
  id: string; // opaque
  label: string; // e.g. "Seniors M D3"
}

export interface FfbbRencontre {
  id: string;
  startsAt: string; // ISO 8601
  opponentLabel: string;
  isHome: boolean;
  location: string | null;
  played: boolean;
}

export interface FfbbProvider {
  /** Clubs matching `query` within a comité — powers the club-creation picker. */
  searchClubs(comiteCode: string, query: string): Promise<FfbbClubResult[]>;
  /** A club's own competition engagements — powers the team-creation picker. */
  listClubEngagements(clubCode: string): Promise<FfbbEngagementResult[]>;
  /** Matches for one engagement, already normalized (home/away, opponent resolved). */
  getRencontresForEngagement(engagementId: string): Promise<FfbbRencontre[]>;
  /** Accepts either a raw id or a pasted competitions.ffbb.com team URL. */
  parseEngagementRef(urlOrId: string): string | null;
}
```

Everything FFBB-specific — the Directus base URL, the `/items/configuration`
token dance, Meilisearch, the exact filter/field names, the
`idEngagementEquipe1` vs. `2` home/away resolution — lives inside the one
concrete implementation, `DirectusFfbbProvider`, injected behind this
interface via a Nest DI token (`FFBB_PROVIDER`). Every controller/service in
the app depends on `FfbbProvider`, never on `DirectusFfbbProvider` directly.
Swapping providers (or wrapping the existing one with caching/retry) is a
one-line change in `ffbb.module.ts`. The ligue/comité list (below) is
similarly kept out of `DirectusFfbbProvider` — it's static app config, not
fetched from FFBB, so it survives even if FFBB's own concept of "ligue"
changes shape.

## Scope

**In scope:**

- **Club creation/editing:** an optional FFBB link, set via a ligue → comité
  → club-search picker (see UX below), stored as `Club.ffbbClubCode` +
  cached `Club.ffbbClubLabel`.
- **Team creation/editing:** an optional FFBB link, set via a picker over the
  team's club's own engagements when the club is linked, falling back to a
  manual paste-a-URL-or-id input otherwise (or always, as an "advanced"
  option) — stored as `Team.ffbbEngagementId` + cached
  `Team.ffbbEngagementLabel`.
- A manual "Importer le calendrier FFBB" action, available once a team is
  linked, that pulls every rencontre for that engagement id and
  creates/updates one `MATCH` `Event` per rencontre, idempotently (re-running
  never duplicates a match).
- Re-running the import after FFBB updates a match's date/time/venue updates
  the existing `Event` **in place** (same `id`), so `EventRsvp`/
  `EventConvocation` rows tied to that event survive a schedule change
  instead of being orphaned by a delete-and-recreate.
- Imported events are visibly distinct from manually-created ones, and
  manually-entered `notes` on an imported event are never overwritten by a
  re-sync.

**Out of scope (explicitly deferred, don't build speculatively):**

- **Automatic/scheduled re-sync** (a nightly BullMQ job) — v1 is a manual
  button; see loop-0 reasoning, unchanged.
- **Two-way sync / writing back to FFBB.**
- **Importing results/scores** into `Event`; `joue` is only used to skip
  re-touching already-played matches on re-sync.
- **Detecting/handling matches removed from the FFBB feed.** v1 never
  deletes an `Event` it previously imported.
- **A team playing more than one competition/engagement at once.** One
  `Team` ↔ one `ffbbEngagementId`; if that turns out to matter, it's a
  follow-up (see Open questions).
- **Importing training sessions.** FFBB only publishes competitive matches.
- **A live "list ligues"/"list comités" FFBB endpoint.** See Club & team
  linking UX — this loop uses a static, hand-maintained list instead.

## Data model (Prisma)

```prisma
model Club {
  // ...existing fields...
  ffbbClubCode  String? @unique
  ffbbClubLabel String?
}

model Team {
  // ...existing fields...
  ffbbEngagementId    String? @unique
  ffbbEngagementLabel String?
}

model Event {
  // ...existing fields...
  externalId String?
}
```

- `Club.ffbbClubCode` / `Team.ffbbEngagementId`: opaque identifiers exactly
  as FFBB gives them — never parsed, decomposed, or recomposed anywhere in
  the app (see Abstraction section). `@unique` on both: one FFBB club maps
  to at most one BasketEasy club, one FFBB engagement to at most one
  BasketEasy team.
- `*Label` fields: a display-name snapshot taken at link time (e.g. "Basket
  Club Basse-Goulaine", "Seniors M D3"), so the UI can show what a team/club
  is linked to without an extra FFBB round-trip on every page load. Refreshed
  whenever the link is (re-)set; allowed to go stale between relinks — it's
  a label, not a source of truth (the code/id is).
- Deliberately **no `Club.ffbbLigueCode`/`ffbbComiteCode` columns.** Ligue
  and comité are UI-only filters used to narrow the club-search picker (see
  below); persisting them would duplicate what's already encoded in
  `ffbbClubCode` and could silently drift from it. If a club's own ligue/
  comité is ever needed at runtime, look it up through `FfbbProvider` from
  the code, not from a stored column.
- `Event.externalId`: unchanged from loop 0 — the FFBB `rencontre.id` for an
  imported match, `null` for manually-created events (Postgres treats each
  `NULL` as distinct, so plain events never collide — the same convention
  `recurrenceId: null` already uses elsewhere in this schema).
  `@@unique([teamId, externalId])` makes the import upsert idempotent.

## Club & team linking UX

**Supported ligue/comité list** is a small static array in the codebase
(e.g. `server/src/ffbb/ffbb-scopes.ts`), *not* a live FFBB call — there's no
confirmed "list all ligues/comités" endpoint, and BasketEasy only targets
Loire-Atlantique at launch (`CLAUDE.md`) anyway:

```typescript
export const FFBB_SCOPES = [
  { ligueCode: 'pdl', ligueLabel: 'Pays de la Loire', comiteCode: '0044', comiteLabel: 'Loire-Atlantique (CD44)' },
] as const;
```

Adding a department later (once BasketEasy expands) is a one-line addition
here — no migration, no schema change, because ligue/comité are never
persisted (see Data model).

**Club creation form** (`CreateClubForm`, app side) gains an optional,
skippable "Lier ce club à la FFBB" section:

1. Ligue select, populated from `FFBB_SCOPES` (today: one option,
   pre-selected).
2. Comité select, filtered by the chosen ligue (today: one option).
3. A debounced club-name search input, calling
   `GET /ffbb/clubs?comiteCode=0044&query=basse` → `FfbbClubResult[]`; the
   admin picks a result, which fills `ffbbClubCode`/label for the create
   request. Nothing is called until the admin actually types — this never
   fires on page load.

Skippable entirely (a club works today with no FFBB link — the field is
optional in `CreateClubDto`); linkable later from the club's settings via
`PATCH clubs/:clubId/ffbb-link` (same picker), `DELETE` to unlink.

**Team creation form** gains the same kind of optional section, using the
*team's club's* link:

- If the club has `ffbbClubCode` set: fetch
  `GET /ffbb/clubs/:clubCode/engagements` → `FfbbEngagementResult[]` and show
  it as a searchable dropdown (labeled by competition, e.g. "Seniors M D3"),
  the friendliest path since the admin never has to go find a raw id.
- Always available (whether or not the club is linked, and as a fallback if
  the team isn't in the listed engagements — e.g. it hasn't appeared in
  FFBB's system yet): a manual input accepting either a bare engagement id
  or a pasted `competitions.ffbb.com/.../equipes/<id>` URL, resolved via
  `FfbbProvider.parseEngagementRef`. This keeps the original loop-0 flow
  intact as the always-works path.

**This is a deliberate addition beyond what was asked** (a picker, not just
an input, for the team side) — flagging it because it's easy to cut back to
"input only" if the picker turns out not to be worth it once
`listClubEngagements` is verified against the real API; the manual input
stays either way so nothing is lost by trying the picker first.

## Backend

Module renamed from the loop-0 `server/src/ffbb-import` to `server/src/ffbb`
(it now covers lookup + import, not just import):

- **`ffbb-provider.ts`** — the interface from the Abstraction section.
- **`directus-ffbb.provider.ts`** — the only FFBB-contract-aware file:
  Directus token fetch/cache (`/items/configuration`, refetch on `401`, no
  documented TTL so no pre-emptive expiry), the `rencontres` query from
  loop 0, plus `searchClubs`/`listClubEngagements` via Meilisearch/Directus.
  Native `fetch` (Node 20+, no new HTTP dependency). `FFBB_API_BASE_URL` env
  var, default `https://api.ffbb.com`.
- **`ffbb-scopes.ts`** — the static ligue/comité list.
- **`FfbbLookupController`** — `@Controller('ffbb')`, behind `JwtAuthGuard`
  only (read-only external directory browsing, not BasketEasy data, so no
  club-role check):
  - `GET /ffbb/scopes` → `FFBB_SCOPES`
  - `GET /ffbb/clubs?comiteCode=&query=` → `FfbbProvider.searchClubs(...)`
  - `GET /ffbb/clubs/:clubCode/engagements` → `FfbbProvider.listClubEngagements(...)`
- **`FfbbImportService`** — unchanged from loop 0: `importSchedule(clubId,
  teamId)` fetches via `FfbbProvider.getRencontresForEngagement`, upserts
  `Event` rows keyed on `(teamId, externalId)`, skips already-`played`
  matches on re-sync, never touches `notes`.
- **`ClubsService.createClub`/`updateFfbbLink`** and
  **`TeamsService.createTeam`/`updateFfbbLink`** gain the new optional
  fields — thin: validate (via `FfbbProvider`, e.g. confirm the code/id
  resolves to something before storing it) and persist code + label.

## API surface

| Method | Path                                       | Guard               | Notes                                                              |
| ------ | -------------------------------------------- | -------------------- | -------------------------------------------------------------------- |
| GET    | `ffbb/scopes`                                | `JwtAuthGuard`       | static ligue/comité list                                            |
| GET    | `ffbb/clubs`                                 | `JwtAuthGuard`       | `?comiteCode=&query=` → search results                              |
| GET    | `ffbb/clubs/:clubCode/engagements`           | `JwtAuthGuard`       | a club's own FFBB team engagements                                  |
| POST   | `clubs`                                      | `JwtAuthGuard`       | `CreateClubDto` gains optional `ffbbClubCode`                       |
| PATCH  | `clubs/:clubId/ffbb-link`                    | `ClubRoles('ADMIN')` | body `{ ffbbClubCode: string }`; validates + (re)links              |
| DELETE | `clubs/:clubId/ffbb-link`                    | `ClubRoles('ADMIN')` | unlinks (teams under this club keep their own links untouched)      |
| POST   | `clubs/:clubId/teams`                        | `ClubRoles('ADMIN')` | `CreateTeamDto` gains optional `ffbbEngagementId`                   |
| PATCH  | `clubs/:clubId/teams/:teamId/ffbb-link`      | `TeamManagerGuard`   | body `{ ffbbUrlOrId: string }`; parsed via `parseEngagementRef`     |
| DELETE | `clubs/:clubId/teams/:teamId/ffbb-link`      | `TeamManagerGuard`   | unlinks; does not touch previously-imported events                  |
| POST   | `clubs/:clubId/teams/:teamId/ffbb-import`    | `TeamManagerGuard`   | `400` if unlinked; returns `FfbbImportResult`                       |

## Shared types (`packages/@basketeasy/types/ffbb.ts`)

```typescript
export interface FfbbScope {
  ligueCode: string;
  ligueLabel: string;
  comiteCode: string;
  comiteLabel: string;
}

export interface FfbbClubResult {
  code: string;
  label: string;
}

export interface FfbbEngagementResult {
  id: string;
  label: string;
}

export interface LinkFfbbClubRequest {
  ffbbClubCode: string;
}

export interface LinkFfbbTeamRequest {
  ffbbUrlOrId: string;
}

export interface FfbbImportResult {
  created: number;
  updated: number;
  unchanged: number;
}
```

`Club` (`packages/@basketeasy/types/clubs.ts`) gains
`ffbbClubCode: string | null` and `ffbbClubLabel: string | null`. `Team`
(`.../teams.ts`) gains `ffbbEngagementId: string | null` and
`ffbbEngagementLabel: string | null`. `CreateClubRequest` and
`CreateTeamRequest` each gain the matching optional field.

## Frontend

- New `app/src/ffbb/` (one-file-per-concern, matching the rest of the app):
  `useFfbbScopes.ts`, `useFfbbClubSearch.ts` (debounced),
  `useFfbbClubEngagements.ts`, and the two small picker components
  (`FfbbClubPicker.tsx`, `FfbbEngagementPicker.tsx`) shared between the club
  and team creation forms.
- `CreateClubForm`/club settings and `CreateTeamForm`/`TeamDetailPage`'s team
  info area each embed the relevant picker as an optional, collapsed-by-
  default section — not a `Dialog` (this is a field within an existing
  create/edit form, not a standalone focused action).
- Import action (`TeamDetailPage`, visible once linked): a button, outcome
  (`created`/`updated`/`unchanged` counts, or a friendly error) surfaced via
  `toast()`, per `CLAUDE.md`'s "outcome of a completed mutation" rule.
- `EventRow`/`AgendaEventCard`: a small badge on events where the API
  indicates FFBB origin (expose as `isImported: boolean` on `TeamEvent`
  rather than the raw `externalId`, to avoid leaking an internal-ish
  identifier into a broadly-visible response).

## Testing

- `DirectusFfbbProvider`: unit tests with a fetch mock — token fetch/
  caching, 401-triggers-refetch, correct filter/query construction for
  `searchClubs`/`listClubEngagements`/`getRencontresForEngagement`, network
  failure surfaces as a typed error rather than throwing raw.
- `FfbbImportService`: fixture-driven tests unchanged from loop 0 (new
  match → created; existing unplayed match with changed fields → updated,
  RSVPs/convocations survive; existing played match → unchanged even if
  fields differ; manual event with `externalId: null` never touched;
  opponent/home-away resolution for both engagement-1 and engagement-2
  cases).
- `ClubsService`/`TeamsService`: new cases for the `ffbb-link` set/unlink
  paths and optional-field-at-creation paths, including the "code/id doesn't
  resolve" rejection.
- `FfbbLookupController`: guard wiring, empty-query/short-query handling
  (don't hit FFBB on an empty search string).
- Vitest/RTL: `FfbbClubPicker`/`FfbbEngagementPicker` (empty, loading,
  results, no-results, error-falls-back-to-manual-input states), the updated
  create forms.

## Open questions (resolve before/at implementation start)

1. **Exact `date_rencontre` serialization and timezone** — unchanged from
   loop 0, still needs empirical confirmation.
2. **What a cancelled/postponed match looks like in the feed** — unchanged
   from loop 0.
3. **Whether `rencontre.id` is stable across a season** — unchanged from
   loop 0.
4. **New this loop — whether club search and "a club's engagements" are
   real, usable, comité-scoped queries against `api.ffbb.com`/Meilisearch**
   (not just inferred from third-party client docs). If `listClubEngagements`
   turns out to be unreliable or missing, the team-creation picker degrades
   to "manual input only," which is exactly loop 0's original design — no
   rework needed, just don't ship the picker.
5. **Whether a club code's ligue/comité prefix convention is universal.**
   Doesn't block this design (we never rely on it), but would let us
   validate that a picked club actually belongs to the selected comité
   client-side, as a nice-to-have sanity check, if confirmed.
6. **Whether a team can legitimately need more than one active
   `ffbbEngagementId`** (multi-competition case from the hierarchy section).
   If real clubs hit this often, `Team.ffbbEngagementId` being singular is
   the wrong shape and this needs revisiting before general rollout — worth
   checking against a couple of real CD44 teams' FFBB pages before writing
   code, not just assumed away.
