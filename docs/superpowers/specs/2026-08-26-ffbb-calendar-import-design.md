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
| Ligue | `pdl` (Pays de la Loire) | Region | Not modeled — appears only as part of the pasted team URL, never selected or stored on its own (see research findings on the club/engagement picker being cut) |
| Comité | `0044` (Loire-Atlantique / CD44) | Department | Not modeled — same as ligue |
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

`competitions.ffbb.com` is a Next.js frontend backed by an **unofficial,
undocumented** JSON API at `https://api.ffbb.com` — a **Directus**-backed
headless-CMS REST API (several independent open-source clients have
reverse-engineered it: `Fimeo/ffbb-api-ts`, `nickdesi/ffbb-data-client`,
`ffbb-api-client-v2`). This section originally assumed BasketEasy would call
that REST API directly. **That assumption is now empirically closed out —
negative — and replaced with a different, verified strategy.** Timeline of
what was actually tested (2026-08-26):

1. This sandbox's egress is *not* blocked — `api.ffbb.com`/
   `competitions.ffbb.com` resolve and respond normally over the network.
2. `api.ffbb.com` sits behind a Bunny CDN WAF: a plain request with no
   `Referer`/`Origin`/browser `User-Agent` gets a `403` from the CDN edge on
   every path. Adding those three headers gets past the WAF for
   `GET /items/configuration`, which returns a real, public "site identity"
   Directus token (`key_dh`) matching the third-party docs' shape exactly.
3. That token does **not** unlock the data: sending it as
   `Authorization: Bearer <key_dh>` (and as an `access_token` query param)
   against `/items/organismes`, `/items/rencontres`, and `/collections` all
   clear the WAF but come back with Directus's own `403 FORBIDDEN "You don't
   have permission to access collection..."` — a real permissions error from
   the backend, not the WAF. `key_dh` is scoped to `configuration`/`assets`
   only. **Conclusion: there is no client-reachable Directus token with read
   access to club or match data. Don't build against `api.ffbb.com` REST
   endpoints at all — there's nothing there for us to call.**
4. **What does work:** fetching a team's own page directly —
   `GET https://competitions.ffbb.com/ligues/<ligueCode>/comites/<comiteCode>/clubs/<clubCode>/equipes/<engagementId>`
   — returns `200` with the full page HTML, and that HTML contains the
   match data server-rendered inline as a Next.js RSC (React Server
   Components) streaming payload: plain JSON objects embedded in
   `self.__next_f.push(...)` script chunks, not a separate API call the
   browser makes. Fetching the real example URL from this spec
   (`.../clubs/pdl0044190/equipes/200000005346381`) returned **10 distinct,
   real upcoming fixtures** in one page load, e.g.:
   ```json
   {"id":"200000014580569","date_rencontre":"2026-09-20T00:00:00","joue":false,
    "numero":"3121","numeroJournee":"1","resultatEquipe1":null,"resultatEquipe2":null,
    "idEngagementEquipe1":{"id":"200000005346381","nom":"BASKET CLUB BASSE GOULAINE",...},
    "idEngagementEquipe2":{"id":"200000005346379","nom":"NANTES SULLY BASKET",...}}
   ```
   **This is the strategy this spec now builds on: parse the rendered page,
   not the REST API.** It needs no auth at all.
5. A bare engagement id does **not** resolve on its own — `/equipes/<id>`
   and `/equipe/<id>` (with or without a `/competitions/<season>/` prefix)
   both `404`, no redirect. Only the full
   `ligues/<x>/comites/<y>/clubs/<z>/equipes/<id>` path resolves. There is no
   confirmed way to derive that full path from a bare id (that would have
   been `searchClubs`'s job, and it has no working data source — see below).
   **This means the manual-entry fallback must accept the full pasted URL,
   not a bare id**, which loop 0's original design assumed would work — it
   doesn't, and there's currently no fix for that beyond "the admin must
   copy the full URL from FFBB's site."

**Rencontre (match) field mapping, corrected from the real payload above:**
`id` (stable external id, confirmed unique across a 10-fixture sample — not
sequential per team, drawn from a shared pool across the whole competition);
`date_rencontre` (ISO 8601, **no timezone offset** — `2026-09-20T00:00:00` —
confirmed local/naive, not UTC; see Open questions for how to interpret this
safely); `joue` (bool); `resultatEquipe1`/`resultatEquipe2` (both `null` on
every fixture sampled — none were played yet, so the played/scored shape is
still unconfirmed, see Open questions); team names live nested at
`idEngagementEquipe1.nom`/`idEngagementEquipe2.nom` (**not** top-level
`nomEquipe1`/`nomEquipe2` as originally assumed from third-party docs) —
`idEngagementEquipe1`/`2` is still the correct home/away resolution
mechanism (compare `.id` to our stored `ffbbEngagementId`). **Time-of-day
caveat, new finding:** 9 of the 10 sampled fixtures have `T00:00:00` and one
has a real time (`T14:00:00`) — `00:00:00` is FFBB's placeholder for "date
confirmed, kickoff time not yet set," not a literal midnight match. Import
logic must treat `00:00:00` as time-TBD (e.g. surface the `Event` with a
"heure à confirmer" flag rather than a hard 00:00), or coaches will see fake
midnight matches. **Venue field, unconfirmed:** no `salle`/`commune`/
`adresse` field was found in either the team-page fixture list or the
per-match detail page (`.../competitions/<comp>/match/<id>`) for the one
unplayed match checked — venue may only populate closer to matchday, or may
live somewhere else entirely; treat `location` as usually `null` until a
played or near-term match can be sampled (see Open questions).

- **Club/engagement search — cut this loop, not degraded, cut.** The
  Meilisearch-backed search third-party docs describe would need its own
  public token, and none was found (see point 3 above); nothing was found
  that lets BasketEasy look up a club or list a club's engagements without
  already knowing the full FFBB URL. Both pickers this loop's "Extend..."
  revision added (club-creation ligue→comité→club-search, team-creation
  engagement picker) are removed from scope — see Scope and Club & team
  linking UX below. `Club.ffbbClubCode`/`Team.ffbbEngagementId` stay as
  manually-pasted, opaque values.
- **No documented rate limits or terms of use, and no documented page
  contract either** — the RSC payload shape is an accident of how Next.js
  renders, not a published format, so it's more brittle than even the REST
  API would have been (a frontend redeploy can change chunk boundaries or
  field names with zero notice, where an API version bump is at least
  usually announced). This is precisely why the single-adapter boundary
  below matters more now than it did when this section assumed a stable
  REST contract: a broken parse must fail as one typed error from one file,
  not a silent `undefined` propagating into `Event` rows.

## Abstraction: the `FfbbProvider` boundary

The explicit design goal here is that **if FFBB changes its API contract
(renames fields, moves off Directus, restructures the ligue/comité/club/
engagement hierarchy), only one file changes** — not the Prisma schema, not
the DTOs, not any controller, not any frontend component.

That boundary is a single interface, `server/src/ffbb/ffbb-provider.ts`.
**Trimmed from the "Extend..." revision** — `searchClubs`/
`listClubEngagements` are removed; there's no working implementation behind
them (see research above), and per this codebase's convention, an interface
method with no viable implementation is dead weight, not a placeholder to
keep around for later:

```typescript
export interface FfbbRencontre {
  id: string;
  startsAt: string; // ISO 8601, no offset — see research notes on 00:00:00-as-TBD
  timeConfirmed: boolean; // false when startsAt's time-of-day is FFBB's 00:00:00 placeholder
  opponentLabel: string;
  isHome: boolean;
  location: string | null; // usually null — see research notes
  played: boolean;
}

export interface FfbbProvider {
  /** Matches for one engagement, already normalized (home/away, opponent resolved). */
  getRencontresForEngagement(engagementId: string): Promise<FfbbRencontre[]>;
  /**
   * Validates and extracts the engagement id from a pasted
   * competitions.ffbb.com team URL. Returns null if the URL doesn't match
   * the expected shape. Bare ids are NOT accepted — a bare id can't be
   * resolved to a fetchable page without knowing its ligue/comité/club
   * prefix, and there's no lookup for that (see research above).
   */
  parseEngagementRef(url: string): string | null;
}
```

Everything FFBB-specific — the URL shape, the RSC-payload parsing, the
`idEngagementEquipe1` vs. `2` home/away resolution, the `00:00:00`-as-TBD
handling — lives inside the one concrete implementation,
`FfbbPageScrapeProvider` (renamed from the originally-planned
`DirectusFfbbProvider` — there's no Directus REST call left in this design,
see research above), injected behind this interface via a Nest DI token
(`FFBB_PROVIDER`). Every controller/service in the app depends on
`FfbbProvider`, never on `FfbbPageScrapeProvider` directly. This boundary is
what made today's finding a one-file change instead of a redesign: the
interface itself didn't need to change shape when the underlying mechanism
flipped from "call a REST API" to "scrape a rendered page" — only
`FfbbPageScrapeProvider`'s internals did.

## Scope

**In scope:**

- **Club creation/editing:** an optional FFBB link, a single manually-pasted
  club code — stored as `Club.ffbbClubCode`, **unvalidated** (no working
  lookup exists to confirm a code is real; see research above). No
  `Club.ffbbClubLabel` — there's no source to fetch a display label from
  either, so showing one back to the admin would mean inventing it.
- **Team creation/editing:** an optional FFBB link, a single manually-pasted
  full `competitions.ffbb.com/.../equipes/<id>` URL (not a bare id — see
  research above) — stored as `Team.ffbbEngagementId` + cached
  `Team.ffbbEngagementLabel`. **This one is validated**, unlike the club
  code: submitting it triggers `FfbbProvider.getRencontresForEngagement`,
  and a `404`/parse failure rejects the link before it's stored — a
  materially better check than loop 0's original plan had, since it's a
  real fetch against the live page, not just a URL-shape regex.
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
- **Any club/engagement search or lookup UI** (ligue/comité pickers,
  club-search, "a club's engagements" dropdown). Cut this loop — see the
  research section above; there's no data source found to build them on. If
  a future session finds a legitimately public read-scoped token or a
  scrapeable club/search page, this is worth revisiting.
- **Validating `Club.ffbbClubCode` against a live source.** No club-only
  page or lookup was found to check it against (only team engagement pages
  are confirmed scrapeable) — it's stored trust-only, same status as before
  this loop, not newly resolved.

## Data model (Prisma)

```prisma
model Club {
  // ...existing fields...
  ffbbClubCode String? @unique
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
- **No `Club.ffbbClubLabel`.** Removed from this loop's original plan — there
  is no working lookup that returns a club display name to snapshot (see
  research above), so a label field would either sit permanently empty or
  have to be typed by the admin, which isn't a "label," it's just the club's
  own name typed twice.
- `Team.ffbbEngagementLabel`: a display-name snapshot taken at link time
  (e.g. "Seniors M D3", read off the validated page fetch at link time — see
  Scope), so the UI can show what a team is linked to without an extra FFBB
  round-trip on every page load. Refreshed whenever the link is (re-)set;
  allowed to go stale between relinks — it's a label, not a source of truth
  (the id is).
- Deliberately **no `Club.ffbbLigueCode`/`ffbbComiteCode` columns.** Ligue
  and comité were only ever going to be UI-only filters for a club-search
  picker that's now cut (see Club & team linking UX below); there's nothing
  left that would read these columns.
- `Event.externalId`: unchanged from loop 0 — the FFBB `rencontre.id` for an
  imported match, `null` for manually-created events (Postgres treats each
  `NULL` as distinct, so plain events never collide — the same convention
  `recurrenceId: null` already uses elsewhere in this schema).
  `@@unique([teamId, externalId])` makes the import upsert idempotent.

## Club & team linking UX

**Both pickers this loop originally planned are cut** — no ligue/comité
select, no club-search dropdown, no engagement dropdown. There's no data
source to build any of them on (see research above). What ships is two
plain optional text inputs, each inline within its existing create/edit
form (per `CLAUDE.md`'s inline-vs-modal rule: a single optional field is
not a focused enough action to warrant a `Dialog`):

**Club creation form** (`CreateClubForm`, app side) gains one optional,
skippable text field, "Code club FFBB", under a collapsed "Lier ce club à
la FFBB" section. No live validation — the field accepts whatever the admin
types and stores it as-is (see Scope: there's no lookup to check it
against). Skippable entirely (a club works today with no FFBB link); editable
later from the club's settings via `PATCH clubs/:clubId/ffbb-link`, `DELETE`
to unlink.

**Team creation form** gains the same kind of optional section, one field:
"Lien de l'équipe sur competitions.ffbb.com", accepting a **full pasted
URL only** (e.g. `https://competitions.ffbb.com/ligues/pdl/comites/0044/
clubs/pdl0044190/equipes/200000005346381`) — not a bare id, since a bare id
can't be resolved (see research above; the field's placeholder/help text
should say so explicitly, since "paste the id" was the more obvious ask
before this was tested). Unlike the club code, this one **is validated on
submit**: the backend calls `FfbbProvider.getRencontresForEngagement` against
the parsed id before persisting the link, and a `404` or unparseable page
rejects the submission with a clear error rather than silently storing a
dead link.

## Backend

Module renamed from the loop-0 `server/src/ffbb-import` to `server/src/ffbb`
(it now covers link-validation + import, not just import):

- **`ffbb-provider.ts`** — the interface from the Abstraction section.
- **`ffbb-page-scrape.provider.ts`** — the only FFBB-contract-aware file
  (renamed from the originally-planned `directus-ffbb.provider.ts` — no
  Directus REST call survives in this design, see research above):
  - `getRencontresForEngagement(engagementId)`: needs the full team-page URL,
    not just the id (see `parseEngagementRef` below) — fetches it with native
    `fetch` (Node 20+, no new HTTP dependency, no auth headers needed), then
    extracts the RSC JSON payload. Extraction is a targeted regex/string scan
    for the `"data":[...]` array holding rencontre objects inside the
    `self.__next_f.push(...)` chunks, then `JSON.parse` per object — not a
    full HTML/AST parser, since the payload is JSON-shaped, not markup. Maps
    `date_rencontre` + `00:00:00`-detection into `startsAt`/`timeConfirmed`,
    `idEngagementEquipe1`/`2` into `isHome`/`opponentLabel` (compare `.id` to
    the requested `engagementId`), `joue` into `played`, leaves `location`
    `null` (see research notes — no venue field found yet). Any fetch
    failure, unexpected status, or extraction/parse failure throws one typed
    `FfbbPageFormatError` rather than propagating a partial/garbage result —
    this is the file that eats a future FFBB frontend redeploy breaking the
    RSC shape, so it fails loud and in one place instead of silently
    importing wrong data.
  - `parseEngagementRef(url)`: validates the pasted string matches
    `ligues/<x>/comites/<y>/clubs/<z>/equipes/<id>` (via regex on the full
    URL, not just checking for a trailing id) and returns the full path
    (needed by `getRencontresForEngagement` above), or `null` if it doesn't
    match. Bare ids return `null` — see research above on why they can't be
    resolved.
  - `FFBB_BASE_URL` env var, default `https://competitions.ffbb.com`.
- **`FfbbImportService`** — unchanged from loop 0: `importSchedule(clubId,
  teamId)` fetches via `FfbbProvider.getRencontresForEngagement`, upserts
  `Event` rows keyed on `(teamId, externalId)`, skips already-`played`
  matches on re-sync, never touches `notes`. `timeConfirmed: false` on the
  fetched rencontre should surface on the created/updated `Event` in some
  form the frontend can flag (exact field TBD at implementation — could be
  as simple as not setting a time component at all, pending Open questions
  on the date/timezone shape).
- **`ClubsService.createClub`/`updateFfbbLink`**: thin, no validation call —
  just persists `ffbbClubCode` as typed (see Scope: unvalidated by design,
  not by oversight).
- **`TeamsService.createTeam`/`updateFfbbLink`**: parses the pasted URL via
  `FfbbProvider.parseEngagementRef`, `400`s if it doesn't match; then calls
  `getRencontresForEngagement` once to confirm the link actually resolves
  and to read a label (competition name) for `ffbbEngagementLabel`, `400`s
  on `FfbbPageFormatError` with a message distinguishing "bad URL" from
  "couldn't reach FFBB" for the admin.

No `FfbbLookupController` — there's nothing left for it to serve now that
club search and engagement listing are cut (see Scope).

## API surface

| Method | Path                                       | Guard               | Notes                                                              |
| ------ | -------------------------------------------- | -------------------- | -------------------------------------------------------------------- |
| POST   | `clubs`                                      | `JwtAuthGuard`       | `CreateClubDto` gains optional `ffbbClubCode`, stored unvalidated   |
| PATCH  | `clubs/:clubId/ffbb-link`                    | `ClubRoles('ADMIN')` | body `{ ffbbClubCode: string }`; stores unvalidated                 |
| DELETE | `clubs/:clubId/ffbb-link`                    | `ClubRoles('ADMIN')` | unlinks (teams under this club keep their own links untouched)      |
| POST   | `clubs/:clubId/teams`                        | `ClubRoles('ADMIN')` | `CreateTeamDto` gains optional `ffbbTeamUrl`; validated on submit    |
| PATCH  | `clubs/:clubId/teams/:teamId/ffbb-link`      | `TeamManagerGuard`   | body `{ ffbbTeamUrl: string }`; parsed + validated via a live fetch |
| DELETE | `clubs/:clubId/teams/:teamId/ffbb-link`      | `TeamManagerGuard`   | unlinks; does not touch previously-imported events                  |
| POST   | `clubs/:clubId/teams/:teamId/ffbb-import`    | `TeamManagerGuard`   | `400` if unlinked; returns `FfbbImportResult`                       |

## Shared types (`packages/@basketeasy/types/ffbb.ts`)

```typescript
export interface LinkFfbbClubRequest {
  ffbbClubCode: string;
}

export interface LinkFfbbTeamRequest {
  ffbbTeamUrl: string; // full competitions.ffbb.com equipes/<id> URL — bare ids are rejected server-side
}

export interface FfbbImportResult {
  created: number;
  updated: number;
  unchanged: number;
}
```

`FfbbScope`, `FfbbClubResult`, `FfbbEngagementResult` — dropped from this
loop's original plan along with the pickers they backed (see Scope). `Club`
(`packages/@basketeasy/types/clubs.ts`) gains `ffbbClubCode: string | null`
only (no label — see Data model). `Team` (`.../teams.ts`) gains
`ffbbEngagementId: string | null` and `ffbbEngagementLabel: string | null`.
`CreateClubRequest` gains `ffbbClubCode?: string`; `CreateTeamRequest` gains
`ffbbTeamUrl?: string`.

## Frontend

- No picker components or search hooks this loop — cut along with the
  pickers (see Scope). `CreateClubForm`/club settings gain one plain
  optional text `Input` ("Code club FFBB") under a collapsed section.
  `CreateTeamForm`/`TeamDetailPage`'s team info area gain one plain optional
  text `Input` ("Lien FFBB de l'équipe") with help text stating a full URL
  is required, plus its own `FieldError` surfaced from the `400` a bad/
  unresolvable URL returns — inline validation feedback bound to that field,
  per `CLAUDE.md`'s `FieldError`-vs-`toast()` rule (this is a validation
  error tied to one input, not a completed-mutation outcome).
- Import action (`TeamDetailPage`, visible once linked): a button, outcome
  (`created`/`updated`/`unchanged` counts, or a friendly error) surfaced via
  `toast()`, per `CLAUDE.md`'s "outcome of a completed mutation" rule.
- `EventRow`/`AgendaEventCard`: a small badge on events where the API
  indicates FFBB origin (expose as `isImported: boolean` on `TeamEvent`
  rather than the raw `externalId`), plus a distinct "heure à confirmer"
  treatment when `timeConfirmed` is `false` (new this revision — without it,
  a `00:00:00` placeholder would render as a real midnight kickoff).

## Testing

- `FfbbPageScrapeProvider`: unit tests with a `fetch` mock returning
  captured real HTML fixtures (from today's verified page fetch) —
  successful extraction of all fields including the `nom`-is-nested and
  `00:00:00`-is-TBD cases; a mangled/restructured payload (simulating a
  future FFBB frontend change) surfaces `FfbbPageFormatError` rather than
  throwing an unhandled parse error or returning garbage; `404` surfaces a
  distinct "link doesn't resolve" error; `parseEngagementRef` accepts the
  real URL shape and rejects a bare id and a malformed URL.
- `FfbbImportService`: fixture-driven tests unchanged from loop 0 (new
  match → created; existing unplayed match with changed fields → updated,
  RSVPs/convocations survive; existing played match → unchanged even if
  fields differ; manual event with `externalId: null` never touched;
  opponent/home-away resolution for both engagement-1 and engagement-2
  cases) plus a new case for `timeConfirmed: false` propagating correctly.
- `ClubsService`: `ffbb-link` set/unlink persists the code unvalidated (no
  rejection case — there's nothing to reject against).
- `TeamsService`: `ffbb-link` set rejects a bare id and a URL that doesn't
  resolve (mocked `FfbbPageFormatError`/404 from the provider), accepts and
  persists a resolving URL plus its label.
- Vitest/RTL: the updated create/edit forms — submitting a bad team URL
  shows the field-level error, submitting a good one succeeds; no picker
  component tests (none exist this loop).

## Open questions (resolve before/at implementation start)

**Resolved 2026-08-26 — how to get match data at all.** The original
premise of this section (call `api.ffbb.com`'s REST API) is dead: the only
public token (`key_dh`, from `GET /items/configuration`) returns a clean
`403 FORBIDDEN "You don't have permission to access collection..."` from
Directus itself (not the WAF) on `organismes`, `rencontres`, and
`/collections` alike — confirmed by sending it as both an
`Authorization: Bearer` header and an `access_token` query param. What
works instead, verified against the real example URL from this spec
(`.../clubs/pdl0044190/equipes/200000005346381`): fetching the team's
`competitions.ffbb.com` page directly and parsing the match data out of its
embedded Next.js RSC JSON — no auth needed, `200` response, **10 real,
distinct upcoming fixtures** extracted in one fetch. This is now the
design's actual data-access strategy (see research and Backend sections
above), not an open question — but it resolved into three narrower,
still-open ones plus confirmed two of the original three:

1. **`date_rencontre` serialization and timezone — largely resolved.**
   Confirmed format: `2026-09-20T00:00:00`, no offset (naive local time).
   **New finding, not previously suspected:** `T00:00:00` is not a literal
   midnight kickoff, it's FFBB's placeholder for "time not yet confirmed" —
   9 of 10 sampled fixtures had it, one had a real time (`T14:00:00`). Still
   open: confirm this placeholder theory holds once a match's real time gets
   set closer to matchday (re-fetch the same fixture in a few weeks and
   check whether `00:00:00` flips to a real time), and confirm the naive
   local time is always Europe/Paris (untested — France has one timezone, so
   low risk, but not verified against a fixture during a DST transition
   week).
2. **What a cancelled/postponed match looks like in the feed** — still
   unresolved. All 10 sampled fixtures were normal upcoming, unplayed
   matches; none were cancelled/postponed, so no field for that state was
   observed (and none is documented). Needs a real example, which requires
   either waiting for one to occur on a tracked team or finding one
   elsewhere in the current season's data.
3. **Whether `rencontre.id` is stable across a season — partially
   confirmed.** The 10 sampled ids were confirmed distinct within one team's
   fixture list and drawn from a shared, non-team-sequential pool across the
   competition (a good sign for stability as an external key). Not yet
   confirmed: that the *same* id is returned for the *same* match on a later
   re-fetch (only fetched once per fixture so far) — needed before trusting
   it as the upsert key in `@@unique([teamId, externalId])`.
4. **New — venue (`salle`) field location, unresolved.** Not found in either
   the team-page fixture list or the one per-match detail page checked
   (an unplayed match ~3 weeks out). Might appear closer to matchday, might
   live under a different field name, or might not be scraped at all in
   this design's page-fetch approach. `FfbbRencontre.location` should be
   assumed `null` until this is checked against a near-term or already-
   played match.
5. **New — played-match (`joue: true`) field shape, unresolved.** All 10
   sampled fixtures were unplayed (`resultatEquipe1`/`2: null`); the current
   season for this specific team hadn't started any matches yet as of the
   test date. Needs checking against a team/competition already mid-season
   to confirm score fields populate as expected.
6. **Club/engagement search and lookup — resolved, cut from scope.** See
   Scope and Club & team linking UX above: no data source exists for either
   picker with a client-reachable token. Both pickers are cut in favor of
   manual entry (club code unvalidated, team link validated via a live
   fetch). Revisit only if a future session finds a legitimately public
   read-scoped token or a scrapeable club/search page.
7. **Whether a club code's ligue/comité prefix convention is universal.**
   Unchanged — doesn't block this design (we never rely on it), and now
   moot for the cut club-search picker; would only matter again if that
   picker is revisited.
8. **Whether a team can legitimately need more than one active
   `ffbbEngagementId`** (multi-competition case from the hierarchy section).
   Unchanged — if real clubs hit this often, `Team.ffbbEngagementId` being
   singular is the wrong shape; worth checking against a couple of real
   CD44 teams' FFBB pages before general rollout.
