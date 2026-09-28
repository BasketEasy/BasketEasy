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
