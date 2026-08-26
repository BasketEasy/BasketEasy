# Player import from FBI export

Status: draft
Date: 2026-08-26

## Why

Clubs already maintain their full roster in the FFBB's own FBI system
(licenses, contact info, birthdates) because federal licensing is
mandatory. Today, getting those players into BasketEasy means an admin
retyping every player by hand via the existing single-player
`POST clubs/:clubId/players` flow (`server/src/clubs/clubs.service.ts`).
That's exactly the kind of onboarding friction that makes a club not
bother adopting a companion tool at all — a club with 80 licensed
players isn't going to type 80 rows in by hand.

FBI's "Éditions" tab lets a club export its own license list as
Excel. This spec adds a one-way, admin-triggered import: upload that
export (or a CSV built from it, or from any prior tool), map its
columns to `Player` fields, preview the resulting create/update/skip
actions, and commit. Source field definitions are per
`~/Downloads/basketeasy-fbi-data-format.md` (research doc, not itself
part of the repo) — field names, license structure, and the
create/skip filtering below all trace back to it.

Out of scope for this pass: the FFBB public club-directory
search-and-link flow the same research doc describes in its Part 2
(auto-filling a club's identity during club creation) — unrelated
surface, separate spec if/when it's picked up.

## Data model

### Shared `Gender` enum

`Team.gender` is currently the enum `TeamGender { MEN WOMEN }`
(`server/prisma/schema.prisma`). `Player` needs the same two values.
Rather than a second near-identical enum, rename `TeamGender` to a
shared `Gender` and add `Player.gender Gender?`.

This is a mechanical rename touching:

- `server/prisma/schema.prisma` — enum declaration, `Team.gender`, new
  `Player.gender`
- `server/src/teams/teams.service.ts`, `dto/create-team.dto.ts`,
  `dto/update-team.dto.ts`, `dto/list-teams.dto.ts` — type references
- `packages/@basketeasy/types/teams.ts` — `TeamGender` export becomes
  `Gender`, re-exported from wherever shared enums live (or defined
  once in `teams.ts` and imported by a future `players.ts` — no
  existing `@basketeasy/types/players` module today, see below)
- `app/src/clubs/TeamEditModal.tsx`, `TeamCreateForm.tsx`,
  `teamLabels.ts`, `TeamRosterCards.tsx`,
  `app/src/pages/MembersPage.tsx` — import renamed type

No behavior changes — every existing `MEN`/`WOMEN` value and check
stays as-is.

### `Player` additions

```prisma
model Player {
  id            String    @id @default(uuid())
  firstName     String
  lastName      String
  clubId        String
  userId        String?
  nationalId    String?   @unique
  licenseNumber String?
  birthDate     DateTime?
  gender        Gender?
  licenseType   String?
  createdAt     DateTime  @default(now())
  club          Club      @relation(fields: [clubId], references: [id])
  user          User?     @relation(fields: [userId], references: [id])
  teamPlayers   TeamPlayer[]

  @@unique([clubId, userId])
  @@index([clubId])
}
```

- **`nationalId`** — FBI's `N° national`: permanent, follows the
  player across clubs and seasons. This is the primary dedupe/match
  key and the only field with a DB-level unique constraint, because
  it's the only one FFBB guarantees is stable.
- **`licenseNumber`** — FBI's `N° licence`: this season's number
  (2-letter color/level prefix + digits, e.g. `VT4821093`, see the
  research doc's §1.3). Changes every season, so **not** unique and
  **not** used for matching — stored for display/reference only.
- **`birthDate`**, **`gender`** — needed for category eligibility
  (U9–SENIORS) elsewhere in the product eventually; not used by this
  import beyond being an import field and (for `birthDate`) a
  secondary match input.
- **`licenseType`** — free-text (`C`/`C1`/`C2`/`L` in practice, per
  research doc §1.4). Plain `String?`, not an enum — FFBB owns this
  code list and BasketEasy doesn't gate any behavior on the specific
  value today, so there's no reason to force a migration if a code is
  added or renamed.
- **Explicitly not modeled**, per the research doc's own
  recommendation: `Taille`, `Nationalité`, `Date du décès`,
  `Assurance`, `Couleur de licence`, `Date de radiation`. No product
  reason to store them; license color is derivable from
  `licenseNumber`'s prefix if a future feature ever needs it.

### Where the import module lives

The DTO and endpoint sit in the existing `server/src/clubs` module,
next to `createPlayer` — one new method on `ClubsService`
(`importPlayers`) rather than a new module, since this is one
endpoint operating on the same `Player` model `ClubsService` already
owns. A separate `players` module would be justified once player
concerns grow beyond "a sub-resource of clubs," not yet.

## Import flow

Four steps, one page — not a modal, per this repo's rule that a
multi-step flow gets a dedicated route, not a bigger `Dialog`
(`CLAUDE.md`). New route `/clubs/:clubId/import-players`, reached via
an "Importer les licenciés" button next to the existing "Ajouter un
joueur" action on the club roster page, visible only to club `ADMIN`s
(same guard tier as `createPlayer`).

1. **Upload** — accept `.xlsx`, `.xls`, `.csv` (FBI's native Excel
   export, plus CSV for anything else). Parsed entirely client-side
   with `xlsx` (SheetJS, new `app` dependency — reads all three
   formats, so no separate CSV library needed) into a header row +
   raw data rows. No file is ever sent to the server; only the
   mapped, structured rows are, in step 4.

2. **Map columns** — a form pairing each target field to a detected
   source column, pre-guessed by matching the research doc's known
   French labels (`Nom`, `Prénom`, `N° national`, `N° licence`, `Date
   de naissance`, `Sexe`, `Type lic.`) against the uploaded header
   row, always overridable via a select per field. Only `firstName`
   and `lastName` are required mappings; every other field can be
   left unmapped. A live preview of the first few raw rows sits next
   to the mapping form so the admin can sanity-check header guesses
   against real data before proceeding.

3. **Preview** — once required fields are mapped, resolve every row
   (client-side, against the club's existing roster fetched once via
   the existing players list) to one action:

   - **Filtered out before matching**: rows whose mapped
     `licenseType` is `T`, `AS`, `AS HN`, or `AGTSP` (research doc
     §1.4 — placements and non-player officials, not roster rows).
     Shown in the preview as a distinct "ignorée (type de licence)"
     row so the admin isn't left wondering why the row count is
     lower than the file, but they're excluded from the commit
     regardless.
   - **Skipped**: missing `firstName` or `lastName` after mapping —
     the only two hard-required fields.
   - **Conflict**: `nationalId` matches an existing `Player` at a
     **different** club (a transfer — this import never reassigns a
     player's club). Shown with the other club's name, excluded from
     commit.
   - **Update**: `nationalId` matches an existing `Player` at *this*
     club, OR (when `nationalId` is unmapped/blank on the row)
     `firstName + lastName + birthDate` matches an existing player
     at this club exactly. Every mapped field on the row overwrites
     the existing player's corresponding column.
   - **Create**: everything else.

   The name+birthDate fallback only fires when the row has a
   `birthDate` mapped and populated — first+last name alone is not
   a reliable match key on a roster of any size, so an unmapped or
   blank birthdate on a name-only match just falls through to
   **Create** rather than guessing.

   This is a read-only table (row → resolved action), not a
   per-row-editable grid — an admin who disagrees with an action goes
   back to step 2 and fixes the mapping, rather than the UI growing
   per-row override controls for what should be a rare case.

4. **Confirm** — a summary count per action type, plus a confirm
   button that POSTs the full mapped row set (only rows not filtered
   out or skipped) to
   `POST clubs/:clubId/players/import`. On success, navigate back to
   the roster page and `toast()` the result counts
   (`created`/`updated`/`conflicts`/`skipped`) — the roster list the
   admin lands on is itself the confirmation that rows saved, per
   this repo's feedback-placement convention, so no separate results
   page.

## API

```
POST clubs/:clubId/players/import
Body: {
  rows: Array<{
    firstName: string;
    lastName: string;
    nationalId?: string;
    licenseNumber?: string;
    birthDate?: string; // ISO 8601
    gender?: Gender;
    licenseType?: string;
  }>
}
Guard: ClubRolesGuard('ADMIN')
Response: { created: number; updated: number; conflicts: number }
```

The client has already filtered out ignored/skipped/conflict rows by
the time it posts — the server doesn't need a client-asserted
"action" per row, since it never trusts one. `ClubsService.importPlayers`
re-derives match state itself inside a single Prisma transaction,
using the same rule set as the client preview (nationalId →
club-scoped name+birthDate fallback → create), so a stale client-side
preview (roster changed by someone else between preview and confirm)
can't cause a wrong write — worst case a row that previewed as
"create" resolves as "update" server-side, or a nationalId conflict
appears that wasn't visible at preview time. Conflicts found
server-side are excluded from the write and rolled into the
`conflicts` count same as a client-predicted one, rather than failing
the whole batch — one late conflict shouldn't block 79 clean rows in
an 80-row import.

`nationalId` uniqueness is checked globally (not scoped to `:clubId`)
because it's a federal ID; the club-scoped name+birthDate fallback is
club-scoped only, since matching by name across the whole database has
no sound basis.

## Error handling

- Unparseable file (corrupt, wrong format, empty) — step 1 shows an
  inline error, no navigation past upload.
- Zero rows survive filtering by step 3 — preview shows an empty
  state with a reason ("toutes les lignes ont été ignorées"), confirm
  button disabled.
- Import endpoint failure (network, 500) — the whole request fails
  atomically (transaction rollback); `toast()` an error, admin stays
  on the confirm step and can retry without re-uploading.

## Testing

- `ClubsService.importPlayers` (Jest, colocated
  `clubs.service.spec.ts`): create-only batch, update-only batch
  (existing player at same club), cross-club nationalId conflict,
  club-scoped name+birthDate match, missing-name skip, mixed batch in
  one transaction.
- Column-mapping guess function and row-resolution function (the
  client-side match logic mirrored from the server) as plain unit
  tests, not component tests — they're pure functions over row data.
- One Vitest component test for the import page covering the
  happy path (upload a small fixture → map → preview shows expected
  actions → confirm) using a fixture `.csv`, not `.xlsx` — parsing
  correctness is `xlsx`'s job, not this repo's to re-test; the fixture
  format just needs to exercise the column-mapping and preview logic.

## Open questions for the plan phase

None — the above is fully scoped. The only external dependency this
spec can't verify itself is whether a real FBI Excel export's header
row matches the field names assumed here; per the research doc's own
caveat, get one real export from a pilot club and diff its headers
against the label-guessing list in step 2 before considering the
mapping "done," and adjust the guess list (not the underlying data
model) if headers differ.
