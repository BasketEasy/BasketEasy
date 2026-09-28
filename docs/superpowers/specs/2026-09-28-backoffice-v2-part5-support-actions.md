# Back-office v2: Part 5, support actions

Status: spec (implements Part 5 of [`2026-09-28-backoffice-browse-stats-actions-design.md`](./2026-09-28-backoffice-browse-stats-actions-design.md))
Date: 2026-09-28
Depends on: [Part 4](./2026-09-28-backoffice-v2-part4-stats.md)

`pr-scope.yml` flags this PR (`server/prisma`, `server/src/auth`, `server/src/audit`): the
description lists the migration, the new audit type and every new write route.

## 1. Design gate

Canvas first: the « Actions support » card on user, club, team, player and scoresheet pages, the
confirm `Dialog` (what will happen, reason field with counter, confirm / cancel, danger variant),
a 409 shown as the form's root `Alert`, the success toast.

## 2. Schema

Migration `20260928120000_backoffice_support_actions` (hand-written):

```sql
ALTER TYPE "AuditEventType" ADD VALUE 'ADMIN_SUPPORT_ACTION';
ALTER TYPE "ParentalConsentSource" ADD VALUE 'PLATFORM_STAFF';
```

Mirrored in `@basketeasy/types/platform-admin` (`AuditEventType`) and wherever
`ParentalConsentSource` is typed (export types included).

## 3. Types

`@basketeasy/types/platform-admin-actions`:

```ts
export type AdminSupportActionKind =
  | 'RESEND_VERIFICATION'
  | 'MARK_EMAIL_VERIFIED'
  | 'SEND_PASSWORD_RESET'
  | 'REVOKE_SESSIONS'
  | 'CHANGE_CLUB_ROLE'
  | 'REMOVE_MEMBERSHIP'
  | 'ADD_TEAM_ADMIN'
  | 'REMOVE_TEAM_ADMIN'
  | 'TRANSFER_TEAM_OWNERSHIP'
  | 'RETRY_OCR'
  | 'CANCEL_GUARDIAN_INVITE'
  | 'REMOVE_GUARDIAN'
  | 'RECORD_PARENTAL_CONSENT'
  | 'CLUB_CREATED';
export interface AdminReasonRequest {
  reason: string;
} // 10–500
export interface ChangeClubRoleRequest extends AdminReasonRequest {
  role: ClubRole;
}
export interface AddTeamAdminRequest extends AdminReasonRequest {
  userId: string;
}
export interface TransferTeamOwnershipRequest extends AdminReasonRequest {
  clubId: string;
}
export interface RecordConsentRequest extends AdminReasonRequest {
  givenBy: string;
  method: string;
} // e.g. "Mère, par téléphone"
export interface AdminActionResult {
  action: AdminSupportActionKind;
  auditLogId: string;
}
```

## 4. Server

- `ReasonDto` (the 10–500 rule) extracted; `ErasePlatformUserDto` and `ExportPlatformUserDto` extend it.
- `platform-admin-actions.service.ts`. Each method:
  1. loads and validates the subject (404 / 409 in French);
  2. runs the write and `tx.auditLog.create({ type: 'ADMIN_SUPPORT_ACTION', userId: admin, actorEmail, ipAddress, userAgent, metadata: { action, reason, …subjects, before, after } })` in **one** `$transaction`;
  3. triggers side effects that can't be transactional (e-mails, queue) **after** commit, fire-and-forget as elsewhere.
- Domain methods that must join the transaction get an optional `tx` parameter
  (`ClubsService.removeMember`, `ClubsService.recordParentalConsent` + optional `source`,
  `GuardiansService.cancelInvite` / `removeGuardian`). Their product callers are unchanged.
- Rules:
  - `MARK_EMAIL_VERIFIED`, `RESEND_VERIFICATION`: 409 when already verified.
  - `CHANGE_CLUB_ROLE` to MEMBER and `REMOVE_MEMBERSHIP`: 409 when it is the club's last ADMIN
    (counted inside the transaction with `SELECT … FOR UPDATE` on the club's ADMIN memberships).
  - `ADD_TEAM_ADMIN`: the user must be a member of a club linked to the team; 409 if already admin.
  - `TRANSFER_TEAM_OWNERSHIP`: the target club must already be linked; flips both `isOwner`
    flags; 409 if it already owns the team.
  - `RETRY_OCR`: 409 on `CONFIRMED` and on `QUEUED`/`PROCESSING` younger than 1 hour; enqueue via
    `ScoresheetsService.enqueueOcr` after commit.
  - `RECORD_PARENTAL_CONSENT`: 400 without a birth date or for an adult; `attestedByName` =
    « <admin name> (Kluvo) — <givenBy>, <method> », `attestedByUserId` = admin, `source: PLATFORM_STAFF`.
  - `REVOKE_SESSIONS`: sets `revokedAt` on every live `RefreshToken`; also refused on the caller's own account.
- Routes as in the design record's table, both roles, `@HttpCode(200)`, returning `AdminActionResult`.
- `GET /admin/audit-log` gains `action?: AdminSupportActionKind` (matches `metadata.action`).

## 5. Frontend

- `AdminActionsCard` per detail page, listing the actions that apply to that record's state
  (e.g. « Renvoyer l'e-mail de vérification » only when unverified).
- One `AdminActionDialog` component (react-hook-form + zod: reason 10–500 plus per-action extra
  fields), configured per action with title, summary, confirm label and `danger` flag. 4xx →
  `setError('root')` + `Alert`; success → `toast()`, close, invalidate the record's detail and
  its lists (`['admin', <area>]` prefix).
- Audit log page: action filter + French labels for every kind.

## 6. Tests

Per action: success writes the change and exactly one audit row with the right metadata; each
refusal writes nothing; a failing write leaves no audit row (transaction). Last-ADMIN
concurrency: two parallel demotions of a two-admin club leave one ADMIN. Components: reason
validation, 409 display, toast + invalidation.

## 7. Docs

CLAUDE.md, Platform back-office: the support-action rule (named routes, reason, one
`ADMIN_SUPPORT_ACTION` row in the same transaction, domain services reused), `PLATFORM_STAFF`.
