# Back-office v2: Part 6, club creation

Status: spec (implements Part 6 of [`2026-09-28-backoffice-browse-stats-actions-design.md`](./2026-09-28-backoffice-browse-stats-actions-design.md))
Date: 2026-09-28
Depends on: [Part 5](./2026-09-28-backoffice-v2-part5-support-actions.md)

## 1. Design gate

Canvas first: « Créer un club » on the clubs list, the dialog (name, FFBB code, first-admin
picker with search results, unverified-account warning, reason), success navigation.

## 2. API

`POST /admin/clubs` (both roles), body `AdminCreateClubRequest extends AdminReasonRequest { name: string; ffbbClubCode?: string; firstAdminUserId: string }`, returns `AdminClubDetail`.

- 404 when the user doesn't exist.
- `ClubsService.createClub(firstAdminUserId, …)` gains an optional `tx`; the club, its ADMIN
  membership and the `ADMIN_SUPPORT_ACTION` row (`action: 'CLUB_CREATED'`, `metadata.clubId`,
  `metadata.subjectUserId`) commit together.
- FFBB-code conflict: the existing `toFfbbClubCodeError` 409, mapped to the `ffbbClubCode` field.
- An unverified first admin is allowed; the response carries nothing special, the warning is
  client-side from the picked user's `emailVerified`.

## 3. Frontend

`AdminCreateClubDialog`: react-hook-form + zod; the picker reuses Part 3's search endpoint
restricted to users (so `SUPPORT` finds by exact e-mail); on success toast + navigate to
`/admin/clubs/:id`.

## 4. Tests

Creation writes club + membership + audit row; unknown user; duplicate FFBB code as a field
error; the unverified warning renders.

## 5. As built

- Canvas approved: https://claude.ai/artifact/7B3ciP82ACBDbu42qLVkzx (boards Main, Errors, Mobile,
  Success).
- `POST /admin/clubs` returns `AdminCreateClubResult` (`AdminActionResult` + `clubId`) rather than
  `AdminClubDetail`: the dialog only needs the id to open the club's page, which then loads the
  detail itself, and every support action keeps one result shape.
- Creation moved to `createClubWithAdmin` in `server/src/clubs/club-writes.ts` (with
  `toFfbbClubCodeError`), called by `ClubsService.createClub` and the back-office alike, instead of
  a `tx` parameter on `ClubsService`: the platform-admin module doesn't import `ClubsModule`, the
  same choice Part 5 made for membership and consent writes.
- The unverified warning reads a new `emailVerified` on user search hits
  (`AdminSearchHit.emailVerified`), so picking a first admin never opens (and audits) their record.
- A blank FFBB code is stored as none (`AdminCreateClubDto` maps `""` to `undefined`), so two clubs
  without a code can't collide on the column's unique index.
- Screenshot fixture: `scripts/fixtures/admin-actions.json` gained the search hits and the create
  route.
