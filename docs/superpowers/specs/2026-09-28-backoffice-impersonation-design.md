# Back-office: read-only impersonation

Status: draft (needs product-owner validation of the decisions marked _proposed_ and the open
questions at the end before any code)
Date: 2026-09-28
Extends: [`2026-09-28-backoffice-browse-stats-actions-design.md`](./2026-09-28-backoffice-browse-stats-actions-design.md)
("Next step: read-only impersonation") and the plan's "After phase 6" item.

## Why

Browse, search, stats and support actions (v2 parts 1–6) answer "what is in the database". They
don't answer "what does this person see", and some bugs only reproduce with someone's own data:
a parent who sees the wrong child's convocation, a CTC coach whose team page 403s, an agenda that
shows an event twice. Today the only way to see the screen is a screenshot from the user, or
rebuilding their graph by hand in a dev database.

Read-only impersonation lets a `DATA_OFFICER` open the **product** (not the back-office) as that
user, with every write refused, for 15 minutes at most, with a reason and an audit trail.

It is the first credential in Kluvo that acts as someone else. That is why it has its own spec
and threat model, and why the design leans on server-side enforcement everywhere a convention
would be easier.

## Decisions

| Topic                | Decision                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Who                  | `DATA_OFFICER` only. It is a disclosure (the subject's full product view), like export. `SUPPORT` stays on redacted browsing.        |
| Justification        | Mandatory reason, 10–500 characters (`ReasonDto`), same as erase / export / support actions                                          |
| Scope                | Read-only. Every non-`GET`/`HEAD` request carrying the credential is refused **by the strategy that authenticates it**               |
| Lifetime             | 15 minutes, never refreshed, revocable at any time; one live session per admin                                                       |
| Credential           | Its own JWT, signed with `PLATFORM_JWT_SECRET`, scope `impersonation-readonly`; never `JWT_ACCESS_SECRET`                            |
| Where it runs        | The same SPA tab, in memory only: a reload ends it                                                                                   |
| Who can be a subject | Any existing account except the admin themself and any account holding a `PlatformAdmin` grant                                       |
| Audit                | `ADMIN_IMPERSONATION_STARTED` and `ADMIN_IMPERSONATION_ENDED` rows; individual reads during the session are not audited (_proposed_) |
| Secret vote          | The subject's own MVP ballot is masked during impersonation (_proposed_)                                                             |
| Subject notified     | No per-session notification; covered by the privacy notice (_proposed_, see open questions)                                          |

## Threat model

**Asset.** Everything one user can read in the product: their clubs, teams, rosters, events,
RSVPs, notifications, and, for a guardian, their children's pages. Plus two things that must
_not_ be reachable: any write as the subject, and the back-office itself.

**Actors.** (a) An honest `DATA_OFFICER` making a mistake. (b) A `DATA_OFFICER` abusing access
(insider). (c) An outside attacker holding a leaked impersonation token, a leaked platform token,
or a leaked `PLATFORM_JWT_SECRET`.

| #   | Threat                                                                                                         | Mitigation                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | A write slips through a route nobody annotated                                                                 | Read-only is enforced inside the passport strategy (§ Server), which every authenticated route already runs through `JwtAuthGuard`. There is no per-route opt-in to forget.                                                      |
| T2  | A `GET` handler has a side effect on the subject's data                                                        | Inventory below; `LastActiveInterceptor` skips impersonated requests. A new convention in CLAUDE.md: a `GET` must not write user-owned state.                                                                                    |
| T3  | Escalation into the back-office with an impersonation token                                                    | `PlatformAdminGuard` refuses any request whose `request.user.impersonation` is set, before any lookup. Subjects with a `PlatformAdmin` grant are refused at start anyway.                                                        |
| T4  | Token confusion: step-up token used as a product credential, or the reverse                                    | Both are signed with `PLATFORM_JWT_SECRET`, so the `scope` claim is the separator: the strategy accepts only `impersonation-readonly`, the guard only `platform-admin`. `HS256` pinned on both. Spec tests cover both crossings. |
| T5  | Leaked impersonation token                                                                                     | ≤15 min, read-only, bound to a live `ImpersonationSession` row checked on every request (revocable), re-checks the actor's grant, lock and `allowedCidrs`. Never in a URL, cookie or storage: memory only.                       |
| T6  | Session outlives the admin's authority (grant revoked, account locked)                                         | The per-request session check joins the actor's `PlatformAdmin` row: no grant, locked, or IP outside `allowedCidrs` → 401.                                                                                                       |
| T7  | Insider browses people without cause                                                                           | `DATA_OFFICER` only, mandatory reason, start/end audited with the subject in `metadata.subjectUserId`, so `GET /admin/audit-log?userId=<subject>` lists every session about them.                                                |
| T8  | Admin's own session corrupted (refresh cookie rotated, logged out as themself, persona preference overwritten) | Client: refresh disabled in impersonation mode, every non-`GET` short-circuited before it is sent (`/auth/logout` included), persona storage neither read nor written. The server never sets a cookie for this credential.       |
| T9  | Data from two identities mixed on screen                                                                       | TanStack Query cache cleared on enter **and** exit; a permanent banner names the subject.                                                                                                                                        |
| T10 | Staff learn what the subject voted (peer vote is anonymous by construction)                                    | `myVote` masked when the caller is impersonated (§ Disclosure).                                                                                                                                                                  |
| T11 | Leaked `PLATFORM_JWT_SECRET`                                                                                   | Forged tokens still need a live `ImpersonationSession` row with a matching id, subject and actor, so the secret alone mints nothing. Rotating the secret ends every session.                                                     |

Out of this model on purpose: an attacker who already has database write access (they can create
a session row and a grant; nothing in the app defends against that).

## Data model

```prisma
model ImpersonationSession {
  id            String    @id @default(uuid())
  actorUserId   String
  actor         User      @relation("ImpersonationActor", fields: [actorUserId], references: [id], onDelete: Cascade)
  subjectUserId String
  subject       User      @relation("ImpersonationSubject", fields: [subjectUserId], references: [id], onDelete: Cascade)
  reason        String
  startedAt     DateTime  @default(now())
  expiresAt     DateTime
  endedAt       DateTime?
  endReason     ImpersonationEndReason?

  @@index([actorUserId, endedAt])
}

enum ImpersonationEndReason {
  EXITED    // the admin clicked « Quitter »
  REPLACED  // the admin started another session
  REVOKED   // subject erased, or ended by an operator
}
```

Plus two `AuditEventType` values: `ADMIN_IMPERSONATION_STARTED`, `ADMIN_IMPERSONATION_ENDED`.

- The row is operational state (is this token still good?), not the record. The record is the
  audit log, which outlives it. Rows cascade with either user, which is fine for that reason: an
  erased subject's sessions end by disappearing, and their audit rows stay (`SetNull` on
  `AuditLog.userId`, subject in `metadata`).
- Expiry is not written back: `expiresAt < now` is the state. An expired session writes no
  `ENDED` row (duration is `expiresAt − startedAt`, derivable).
- Pruning: the retention sweep's `auditLogs` step also deletes sessions with
  `expiresAt < now − 1 day`, so no new `RetentionRun` column is needed. The reason text lives on
  in the audit row, under that row's own 12-month rule.
- Not a column on `RefreshToken` or `PlatformAdmin`: different lifetime, different owner, and a
  session has two users.

## Server

### Routes

| Method | Path                                   | Guard                                                                  | Behaviour                                                                                                       |
| ------ | -------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| POST   | `/admin/users/:userId/impersonate`     | `JwtAuthGuard`, `PlatformAdminGuard`, `@PlatformRoles('DATA_OFFICER')` | body `{ reason }`; returns `{ sessionId, token, expiresAt, subject: { id, displayName } }`                      |
| POST   | `/admin/impersonations/:sessionId/end` | same                                                                   | ends the caller's own live session (`EXITED`); 404 for someone else's; idempotent on an already-ended one (204) |

`start` refuses with:

- 404: unknown user.
- 400: `userId` is the caller.
- 403: the subject holds a `PlatformAdmin` grant (staff-on-staff viewing is not a support case,
  and a subject with a grant is the one case where T3 would matter).

In one transaction: end the caller's other live sessions (`REPLACED`, one `ENDED` row each),
create the session, write `ADMIN_IMPERSONATION_STARTED` (`metadata: { sessionId,
subjectUserId, reason, expiresAt }`). The token is minted after the commit, from the row.

### The credential

```ts
// @basketeasy/types/platform-admin-impersonation
export const IMPERSONATION_TOKEN_SCOPE = 'impersonation-readonly';
```

Claims: `{ sub: subjectUserId, act: actorUserId, sid: sessionId, scope }`, `exp` = the row's
`expiresAt`, `HS256`, `PLATFORM_JWT_SECRET` via `resolvePlatformSecret` (so with the back-office
off, impersonation is off too). Sent as an ordinary `Authorization: Bearer` header: the product's
routes read nothing else, and a second header would mean touching every guard.

### Authentication and read-only enforcement

A second passport strategy, `ImpersonationStrategy` (`'jwt-impersonation'`), and
`JwtAuthGuard` becomes `AuthGuard(['jwt', 'jwt-impersonation'])`. A normal access token fails the
second strategy's signature check and vice versa, so each token is accepted by exactly one.

`ImpersonationStrategy.validate(request, payload)`:

1. `scope === IMPERSONATION_TOKEN_SCOPE`, else fail.
2. `request.method` is `GET` or `HEAD`, else **403** `{ code: 'IMPERSONATION_READ_ONLY' }`
   (not 401: the client must not treat it as expiry).
3. One query: the session by `sid` with its actor's `PlatformAdmin`. Fail (401) unless the row
   exists, `endedAt` is null, `expiresAt > now`, `actorUserId === act`, `subjectUserId === sub`,
   the grant exists with role `DATA_OFFICER`, is not locked, and `clientIpOf(request)` passes
   `allowedCidrs`.
4. Returns `{ id: sub, email: <subject's e-mail>, impersonation: { sessionId, actorUserId } }`.

`RequestUser` gains the optional `impersonation` field. Everything downstream (`ClubRolesGuard`,
`TeamManagerGuard`, `@AllowGuardians()`, services) sees the subject as the caller, which is the
point: the admin sees exactly the 403s and the data the subject would.

Step 2 lives in the strategy, not a separate global guard, because global guards run before
`JwtAuthGuard` has populated `request.user`, and a check that runs before it knows who is calling
can't tell an impersonated request apart.

`PlatformAdminGuard`: first line, `if (request.user?.impersonation) throw new ForbiddenException()`.

### Side effects of GET handlers (T2 inventory, as of this spec)

| Where                                                | Effect                                        | During impersonation                                                  |
| ---------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| `LastActiveInterceptor`                              | writes `User.lastActiveAt`                    | **skipped**: staff viewing must not reset the subject's erasure clock |
| `EventsService` list → stale meeting route re-queued | enqueues a `meeting-travel` job (system data) | allowed: same as any viewer, touches no user-owned row                |
| `GET .../ffbb-poule-results`                         | fills the FFBB cache                          | allowed: shared cache, no user data                                   |
| `GET .../scoresheet`                                 | presigned R2 read URL                         | allowed: a read                                                       |
| `GET /me/notifications`                              | none (read state changes by `PATCH`)          | refused writes cover it                                               |

The implementation PR re-checks this table against every `@Get(` in `server/src` and lists the
result in its description.

### Disclosure: the secret vote

`GET .../events/:eventId/votes` returns `myVote`, whom the caller voted for. The RGPD export
already withholds a vote's nominee (art. 15.4); staff watching the subject's screen would learn
it anyway. When `user.impersonation` is set, `EventsService.getEventVoteResults` returns
`myVote: { best: null, worst: null }` and `myVoteHidden: true` (new field on `EventVoteResults`,
`false` otherwise), and the vote card renders « Vote masqué (consultation support) ». The
aggregate counts stay: every roster member sees those.

Nothing else is masked: seeing what the subject sees, including a guardian's view of their
children, is the purpose, and the reason plus audit row are the control.

## Frontend

- **Start:** a « Voir en tant que » action on `AdminUserDetailPage`, `DATA_OFFICER` only, opening
  an `AdminActionDialog`-style `Dialog` (what will happen, 15-minute limit, read-only, reason).
- **Client state:** `app/src/api/client.ts` gains `impersonationToken` next to `accessToken` and
  `platformToken`. While set: non-`/admin` paths send it as `Authorization` instead of the admin's
  access token; `/admin` paths keep the admin's access + platform token (so « Quitter » works);
  `attemptRefresh` is never called; every non-`GET` to a non-`/admin` path is rejected locally
  with an `ApiError` carrying `IMPERSONATION_READ_ONLY`, without a network call.
- **Enter:** `queryClient.clear()`, set the token, navigate to `/dashboard`.
- **While in it:** `ImpersonationBanner` in `ProtectedRoute` beside `EmailVerificationBanner`
  (same "both breakpoints" reasoning): « Vue en tant que J. D. · lecture seule · 12 min ·
  Quitter », `tone` from the danger family so it can't be mistaken for product chrome. The
  display name follows the admin's role redaction (a `DATA_OFFICER` sees the full name).
  `ActingAsProvider` skips its localStorage read and write. A read-only 403 surfaces as one
  `toast()` (« Action impossible en lecture seule »). Controls are **not** hidden: the admin must
  see the subject's screen as it is.
- **Exit:** « Quitter », a 401 on a product call, or reaching `expiresAt` → best-effort
  `POST /admin/impersonations/:id/end`, drop the token, `queryClient.clear()`, navigate to
  `/admin/users/:subjectId` with a toast. A reload loses the in-memory token and lands on the
  admin's own session (no banner), which is the intended "goes cold" behaviour.

Design gate as for every back-office phase: a Claude Design canvas (start dialog, banner on
mobile and desktop, masked vote card, read-only toast, expiry return) validated before frontend
code.

## Tests

Server (Jest):

- `ImpersonationStrategy`: wrong scope; `POST`/`PATCH`/`DELETE` → 403 with the code; ended,
  expired, unknown `sid`; `act`/`sub` mismatch; actor grant removed, locked, demoted to `SUPPORT`,
  IP outside `allowedCidrs`.
- Token crossings (T4): a step-up token as `Bearer` fails; an impersonation token as
  `X-Platform-Token` fails; a normal access token still works on `JwtAuthGuard`.
- `PlatformAdminGuard` refuses an impersonated request.
- Start: role gate, self, subject with a grant, unknown user, reason bounds, `REPLACED` of a
  previous session, audit rows in the transaction.
- `LastActiveInterceptor` skips; votes masked only when impersonated.

Frontend (Vitest + RTL): client routing of the three tokens, local refusal of writes, no refresh
on 401, cache cleared on enter and exit, banner countdown and exit, persona storage untouched.

## Delivery

One PR, `claude/backoffice-impersonation`, after this spec is validated. `pr-scope.yml` will flag
it (`server/src/auth`, `server/src/audit`, `server/prisma`); the description names the new
strategy, the `JwtAuthGuard` change, the `PlatformAdminGuard` refusal, the migration, the two
audit types, the vote masking and the `GET` inventory. CLAUDE.md's Platform back-office section
gains the rules above, and Working conventions gains "a `GET` handler never writes user-owned
state".

## Out of scope

- Write impersonation ("do it for them"). Support actions are the named, audited write path.
- `SUPPORT` access, even redacted: a redacted product view is a second product.
- Impersonating from outside the back-office (a CLI, a link sent to someone else).
- Recording what was viewed page by page.

## Open questions for the product owner

1. **Tell the subject?** Options: nothing per session (privacy notice only, _proposed_); an
   in-app notification after the session (« Le support Kluvo a consulté votre compte le … »);
   or require the subject's consent first (a code they read out on the phone). Consent is the
   strongest and the slowest; a notification is cheap and makes insider abuse visible.
2. **Audit individual reads?** _Proposed_ no: the session is the disclosure, and per-request rows
   would be dozens per session. Alternative: one `metadata.paths` summary on the `ENDED` row.
3. **Minors.** Impersonating a guardian shows their children. Impersonating a player account of a
   minor is allowed too. Should a minor subject require a second `DATA_OFFICER`'s approval?
   _Proposed_ no for v1, reason + audit is the same bar as export.
