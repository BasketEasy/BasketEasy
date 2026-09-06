# Platform back-office

Status: draft (loop 0)
Date: 2026-09-06

## Why

Per club feedback already logged in `docs/market-research.md`, Kluvo staff need a way to
actually action GDPR access/erasure requests and confirm the retention sweep is doing its job,
without a `psql` session. Nothing like this exists today: `CLAUDE.md`'s "What's deliberately not
here yet" lists no platform-admin concept, and every guard in `server/src/auth/guards`
(`ClubRolesGuard`, `TeamManagerGuard`, `EmailVerifiedGuard`) scopes authority to a club or team,
never to the platform itself.

This spec depends on the `AuditLog` table introduced in the companion
[`2026-09-06-data-retention-policy-design.md`](./2026-09-06-data-retention-policy-design.md) —
that spec's automated sweep is complete and functions without this one; this back-office is the
human-operated complement for the cases the sweep alone doesn't cover: a named request that
needs handling *before* the 12-month clock fires, and visibility into what the sweep has done.

## Scope

**In scope:**

- A `PlatformAdmin` grant model + `PlatformAdminGuard`, gating a small, tightly-scoped set of
  routes.
- Mandatory TOTP step-up authentication to actually use any granted access (see Security — the
  bulk of this spec's design effort).
- Full audit logging (via the retention spec's `AuditLog` table) of every PII view and every
  admin action.
- A minimal frontend: a redacted list of accounts nearing the inactivity cutoff, a single-record
  detail view, a manual-erasure action, and the retention sweep's run history.

**Out of scope (explicitly deferred):**

- **A general admin CRUD panel** over every table. This is scoped to retention/erasure
  oversight, not a second product.
- **MFA/TOTP for regular club users** — only platform admins get step-up auth here. Club
  admins/members keep today's password + refresh-token flow; broadening MFA to all users is a
  separate decision.
- **Self-service admin promotion** — see Hardening: grants are provisioned out-of-band only.
- **A DSAR export generator** beyond the `ADMIN_EXPORT_GENERATED` audit hook — producing an
  actual machine-readable export bundle is a follow-up once the viewing/erasure flow is proven.

## Why a back-office, scoped this tightly

The only operations a human needs to perform outside the retention spec's automated sweep are:
(1) handle a named GDPR access/erasure request before the 12-month clock would otherwise fire,
(2) confirm the sweep is actually running and see what it did, (3) look up which club an
inactive account belonged to before erasing it, in case a club raises a support ticket first.
That's the entire surface — not a general admin panel. Every route below is deliberately
read-mostly, with exactly one destructive action (manual erasure), because a back-office over
personal data is the single highest-blast-radius surface in the product: it's the one place a
compromised credential exposes every club's roster at once, rather than one club's own data.

## Data model (Prisma)

```prisma
// Platform-staff authority, deliberately its own table rather than a role
// enum on User (mirrors TeamAdmin's existing pattern in CLAUDE.md's Teams
// module) — grants are auditable rows with their own createdAt/grantedBy,
// not a flag that's silently flipped with no trace of who did it or when.
enum PlatformRole {
  // Read-only: can view anonymized aggregates and the retention sweep's
  // run history. Cannot view PII or trigger erasure. Day-to-day support
  // staff level.
  SUPPORT
  // Can view a specific data subject's PII when handling a named GDPR
  // access/erasure request, and action erasure. Every PII view and every
  // erasure is its own AuditLog row (ADMIN_PII_VIEWED / ADMIN_USER_ERASED)
  // — see Security.
  DATA_OFFICER
}

model PlatformAdmin {
  id              String       @id @default(uuid())
  userId          String       @unique
  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  role            PlatformRole
  // TOTP secret for step-up auth on back-office login (see Security) —
  // separate from the account's normal password, required before this
  // grant is usable at all.
  totpSecret      String?
  // Optional per-admin network restriction, empty = unrestricted (see
  // Hardening).
  allowedCidrs    String[]     @default([])
  lockedUntil     DateTime?
  grantedByUserId String?
  createdAt       DateTime     @default(now())
}
```

`User` gains a `platformAdmin PlatformAdmin?` back-relation. The retention spec's
`AuditEventType` enum gains platform-admin-specific values, additive to that spec rather than
modifying its meaning:

```prisma
enum AuditEventType {
  // ...existing values from the retention policy spec...

  // Platform-admin/back-office actions get their own event types (not
  // folded into a generic "ADMIN_ACTION") so a CNIL/DPO export can filter
  // precisely on them.
  ADMIN_LOGIN_SUCCESS
  ADMIN_LOGIN_FAILURE
  ADMIN_PII_VIEWED
  ADMIN_USER_ERASED
  ADMIN_EXPORT_GENERATED
}
```

## Authorization model

`PlatformAdmin` is checked by a new `PlatformAdminGuard`, structurally identical to
`ClubRolesGuard`'s shape but with no route param to key off — it reads `request.user.id`, looks
up `PlatformAdmin`, and 403s if absent, mirroring `TeamManagerGuard`'s defense-in-depth style
(guard does the coarse check, service methods still re-verify scope before any mutation).
`@PlatformRoles('DATA_OFFICER')` on top of it gates the one destructive route (erasure) the same
way `@ClubRoles('ADMIN')` already gates ownership-only actions elsewhere.

Critically, **holding a `PlatformAdmin` grant is necessary but not sufficient** — every
back-office route additionally requires a step-up credential, issued separately from the
account's normal JWT:

1. A platform admin logs into their normal Kluvo account exactly as any user would
   (email + password → normal access/refresh token pair). This token cannot open any
   `/admin/*` route — `PlatformAdminGuard` explicitly checks for a second claim (below), not
   just `PlatformAdmin` existence, so a stolen regular session token is useless here even if it
   belongs to an admin.
2. To *enter* the back-office, they additionally submit a TOTP code (`PlatformAdmin.totpSecret`,
   standard RFC 6238, same primitive as any authenticator app — no new client dependency beyond
   a QR-code enrollment screen). On success, the server issues a second, separate JWT
   (`platformAccessToken`) with its own short TTL (15 minutes, vs. the normal access token's
   longer lifetime) and its own claim (`scope: 'platform-admin'`) that `PlatformAdminGuard`
   requires. This token is never a refresh-rotated long-lived credential — expiry means
   re-entering the TOTP code, not a silent refresh, since the whole point is that a session left
   open on a shared machine goes cold fast.
3. Every `/admin/*` request is logged to `AuditLog` regardless of outcome — `ADMIN_LOGIN_SUCCESS`
   /`ADMIN_LOGIN_FAILURE` at step 2, `ADMIN_PII_VIEWED` on any route that returns a data
   subject's PII (with which subject, in `metadata`), `ADMIN_USER_ERASED` on the destructive
   route, `ADMIN_EXPORT_GENERATED` if a DSAR export is produced. This is the record a DPO needs
   to answer "who looked at this person's data and why" — without it, the back-office would
   itself be an ungoverned access path to every club's PII, worse than not having one.

## Hardening beyond auth

- **Separate rate limit**, tighter than the public API's: `/admin/login` (the TOTP step) is
  limited per-account (not just per-IP, since an admin's IP is often a fixed office/VPN address
  attackers could rotate around) to 5 attempts per 15 minutes, then sets `PlatformAdmin.lockedUntil`
  until manually cleared — a locked-out admin is an acceptable cost, an unlimited TOTP
  brute-force is not.
- **IP allowlist, optional but supported**: `PlatformAdmin.allowedCidrs` (empty = unrestricted,
  matching how `BREVO_API_KEY`-style optional integrations degrade gracefully per `CLAUDE.md`'s
  convention) so a club-network or office-VPN restriction can be layered on per-admin without
  being mandatory for launch.
- **No PII in list views.** Any route that lists candidates (e.g. "accounts inactive 11+
  months, expiring soon") returns id, email-domain-redacted-or-not-at-all, and last-active date
  only — never a full profile — until a `DATA_OFFICER` opens one specific record for one named
  request, which is the `ADMIN_PII_VIEWED` moment.
- **Erasure requires a reason string** (free text, stored in the `AuditLog.metadata` for that
  `ADMIN_USER_ERASED` row) — a manual erasure with no recorded justification is exactly the gap
  an audit log exists to close.
- **The back-office ships as its own frontend route tree** (`app/src/admin/`, gated by a
  client-side check that's advisory only — the real enforcement is server-side
  `PlatformAdminGuard`, per usual "don't trust the client" practice) rather than a hidden tab
  inside `AppHeader`/`AccountMenu`, so it never renders, fetches, or bundles admin-only code for
  the 99.9% of users who aren't platform staff.
- **Grants are provisioned out-of-band** (a migration or a one-off script run by an operator
  with DB access), not through a "promote to admin" button anywhere in the product — there is no
  self-service path to `PlatformAdmin`, matching how the first `TeamAdmin` for a team requires an
  existing club `ADMIN` rather than being self-grantable.

## API surface

| Method | Path                                  | Guard                                      | Notes                                                              |
| ------ | -------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| POST   | `/admin/login`                         | `JwtAuthGuard`                              | body `{ totpCode }`; issues `platformAccessToken`; rate-limited      |
| GET    | `/admin/retention/runs`                | `PlatformAdminGuard`                        | last N sweep results (`RetentionRun`, from the retention spec)       |
| POST   | `/admin/retention/dry-run`             | `PlatformAdminGuard` + `PlatformRoles('DATA_OFFICER')` | triggers an on-demand dry-run sweep                        |
| GET    | `/admin/users?status=inactive-soon`    | `PlatformAdminGuard`                        | redacted list only, per Hardening above                              |
| GET    | `/admin/users/:userId`                 | `PlatformAdminGuard` + `PlatformRoles('DATA_OFFICER')` | full profile; emits `ADMIN_PII_VIEWED`                     |
| POST   | `/admin/users/:userId/erase`           | `PlatformAdminGuard` + `PlatformRoles('DATA_OFFICER')` | body `{ reason }`; manual erasure ahead of the sweep       |
| GET    | `/admin/audit-log?userId=`             | `PlatformAdminGuard` + `PlatformRoles('DATA_OFFICER')` | for answering "who accessed this person's data"            |

## Frontend

Minimal: a login screen (email/password, already exists, reused) → TOTP prompt → a three-page
shell (`RetentionRunsPage`, `UsersNearingExpiryPage`, `UserDetailPage` with the erase action
behind a `Dialog` confirm per `CLAUDE.md`'s destructive-action modal convention). No new design
system components needed — reuses `Table`/`Dialog`/`Alert`/`Badge` as-is. Not themed as "Kluvo"
consumer product chrome (no `AppHeader`, no club switcher) — a plain internal-tool shell, since
conflating it visually with the product invites an admin to browse it like a support dashboard
rather than treat every click as an audited, justified action.

## Testing

Jest `*.spec.ts`: `PlatformAdminGuard` (missing grant, missing step-up claim, valid),
`/admin/login` rate-limit lockout and TOTP verification. Vitest/RTL for the three back-office
pages and the TOTP prompt. No new E2E harness — the `screenshot-ui` flow covers the back-office
frontend once built, same as any other UI change per `CLAUDE.md`.
