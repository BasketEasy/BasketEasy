# Data retention policy & back-office

Status: draft (loop 0)
Date: 2026-09-06

## Why

Launch requires a documented, enforced data retention policy (RGPD, art. 5.1.e — data kept no
longer than necessary) and, per club feedback already logged in `docs/market-research.md`, a
way for Kluvo staff to actually action deletion/erasure requests without a `psql` session.
Neither exists today: `CLAUDE.md`'s "What's deliberately not here yet" lists no retention job,
no audit-log table, and no platform-admin concept — every guard in `server/src/auth/guards`
(`ClubRolesGuard`, `TeamManagerGuard`, `EmailVerifiedGuard`) scopes authority to a club or team,
never to the platform itself.

Five retention rules, as specified:

1. **Active account:** kept for the duration of use, no automatic action.
2. **Inactive account:** 12 months of inactivity → delete.
3. **Stats / scoresheets:** kept forever — **not** anonymized after 3 seasons as first proposed.
   Reasoning to record here since it reverses the initial ask: `docs/superpowers/specs/2026-09-02-team-season-stats-design.md`
   and the scoresheets module already treat `MatchPlayerStat`/`ScoresheetExtraction` as
   historical record (season-over-season comparison is the whole point of the stats screen),
   and none of it is special-category data under RGPD (art. 9) — it's game results. Anonymizing
   it would silently break a club's own multi-season history for a compliance rule that doesn't
   actually apply to this data. Only the *account* retention rule below can still remove PII
   *about a person* that happens to intersect this data (see Interaction section).
4. **Security logs:** 12 months (CNIL's standard recommendation for connection/security logs).
   Doesn't exist as a concept yet — this spec adds it.
5. **Backups:** 30-day rotation. This is infrastructure, not application data — see Scope.
6. **Parental consent proof:** account/player + 5 years (civil liability limitation period,
   art. 2224 Code civil). Doesn't exist as a feature yet — this spec adds the simplest possible
   version alongside its retention rule, since a retention rule for data that isn't collected
   is meaningless.

## Scope

**In scope:**

- `User.lastActiveAt` tracking + a nightly retention sweep job that deletes accounts inactive
  12+ months.
- A minimal `ParentalConsent` feature: one checkbox at the point a club adds/invites a player
  under 18, capturing who confirmed consent and when. Retained 5 years *after* the player/account
  it documents is removed, not 5 years from creation (see Data model — this is what "compte + 5
  ans" means: the clock doesn't start until there's something to prescribe against).
- A new `AuditLog` table capturing security-relevant events (login, login failure, password
  reset, refresh-token reuse/revocation, platform-admin actions), swept at 12 months.
- A `RetentionModule` running all sweeps as one nightly BullMQ repeatable job, each policy as
  an independent, idempotent step, with a dry-run mode and a persisted run record for compliance
  evidence ("prove the policy actually executes," which is itself part of RGPD accountability,
  art. 5.2).
- A back-office: a small set of platform-admin-only routes + a minimal frontend, scoped tightly
  to what's needed for GDPR access/erasure requests and retention oversight (see Back-office
  section — this is where the bulk of the design work and this spec's security focus goes).

**Out of scope (explicitly deferred):**

- **Backup rotation itself** — set at the infrastructure level (Postgres backup tool's own
  retention config, or an R2 bucket lifecycle rule for scoresheet-photo backups if they're
  backed up separately from the primary R2 bucket). No application code enforces this; it's
  documented here so the policy list is complete, and the actual config lives in the deploy
  runbook, not this repo's business logic.
- **A general admin CRUD panel** over every table. The back-office below is scoped to
  retention/erasure oversight, not a second product.
- **Automated inactivity warnings** ("your account will be deleted in 30 days") — the retention
  sweep needs a notification hook eventually (reusing `server/src/notifications`), but v1 ships
  the deletion mechanism first and the warning as a fast-follow once the sweep is proven
  correct in production for one cycle. Flagged here so it isn't forgotten, not built
  speculatively.
- **Consent withdrawal / re-consent flows**, **age verification beyond `Player.birthDate`**, and
  **a parent-facing portal** — v1 is the "easiest possible" version: a staff/admin-entered
  attestation at creation time, not a signed-by-the-parent-directly flow. If a real e-signature
  or parent-account flow is wanted later, that's a follow-up spec, not a scope creep here.
- **MFA/TOTP for regular club users** — only platform admins get step-up auth (see Back-office
  security). Club admins/members keep today's password + refresh-token flow; broadening MFA to
  all users is a separate decision.

## Interaction between rules 2 and 3

Deleting an inactive `User` must not delete the `Player`/`MatchPlayerStat`/`ScoresheetExtraction`
rows that reference them, since stats are kept forever. `Player.userId` is already nullable
(the schema supports a roster entry with no linked account — see `CLAUDE.md`'s Teams module),
so account deletion:

- Deletes the `User` row (cascades: `ClubMembership`, `RefreshToken`, `Notification`,
  `PushSubscription`, `EmailVerificationToken`, `PasswordResetToken` — all already `onDelete:
Cascade` per existing schema).
- Sets `Player.userId = null` on any `Player` the account was linked to, rather than deleting
  the `Player`. The roster entry, its `TeamPlayer` rows, and every `MatchPlayerStat` referencing
  it survive untouched — a club's historical roster and stats page still shows "Jean Dupont, 14
  points" after Jean's account is gone, exactly as it does today for a `Player` that was never
  claimed by an account at all.
- This is not a new mechanism: `TeamsService`/`ScoresheetsService` already treat `Player.userId:
null` as a normal, supported state (an invited-but-unregistered player). Account deletion just
  produces that same state.

## Data model (Prisma)

```prisma
model User {
  // ...existing fields unchanged...

  // Updated on login, refresh, and any authenticated mutating request
  // (see Service logic) — the single signal the retention sweep reads to
  // decide "inactive." Distinct from createdAt: a user who logged in once
  // three years ago and never returned is inactive from that login, not
  // from registration.
  lastActiveAt DateTime @default(now())
}

// Security-relevant events, per CLAUDE.md's CNIL-12-month rule. Deliberately
// narrow (auth events only, not a general application audit trail) —
// broadening this to cover every mutation is a distinct, larger feature
// than "security logs," and would multiply write volume on every request
// for a compliance rule that only asks for authentication activity.
enum AuditEventType {
  LOGIN_SUCCESS
  LOGIN_FAILURE
  LOGOUT
  PASSWORD_RESET_REQUESTED
  PASSWORD_RESET_COMPLETED
  REFRESH_TOKEN_REUSE_DETECTED
  EMAIL_VERIFIED
  // Platform-admin/back-office actions are logged as their own event types
  // (not folded into a generic "ADMIN_ACTION") so a CNIL/DPO export can be
  // filtered precisely — see Back-office section.
  ADMIN_LOGIN_SUCCESS
  ADMIN_LOGIN_FAILURE
  ADMIN_PII_VIEWED
  ADMIN_USER_ERASED
  ADMIN_EXPORT_GENERATED
}

model AuditLog {
  id        String         @id @default(uuid())
  type      AuditEventType
  // Nullable: a LOGIN_FAILURE against an email with no matching account
  // still needs to be logged (repeated failures against unknown emails are
  // themselves a security signal) but has no userId to attach to.
  userId    String?
  // Denormalized, not a join, and deliberately never cleared by the User
  // cascade below — an audit log entry must still read "someone logged in
  // as jean@example.com" after that account is deleted; that's the whole
  // point of a security log surviving the account it describes.
  actorEmail String?
  ipAddress String?
  userAgent String?
  metadata  Json?
  createdAt DateTime       @default(now())

  @@index([createdAt])
  @@index([userId])
}

// The "easiest possible" parental consent record: a staff/admin attestation
// captured once, at the moment a club adds a player under 18, not a
// parent-signed flow (see Scope). Deliberately NOT a relation with
// onDelete: Cascade to Player or User — the whole reason this table exists
// is to outlive both (RGPD data-subject erasure doesn't erase a legal
// consent proof; art. 17.3.b is the explicit carve-out for this exact case).
model ParentalConsent {
  id                  String    @id @default(uuid())
  // Nullable on purpose: once the Player or its club is deleted this stays
  // null rather than dangling or cascading. No onDelete clause at all would
  // make Prisma's default (Restrict) block player deletion entirely, which
  // is wrong — the consent record must survive deletion, not prevent it.
  playerId            String?
  player              Player?   @relation(fields: [playerId], references: [id], onDelete: SetNull)
  clubId              String
  club                Club      @relation(fields: [clubId], references: [id], onDelete: Cascade)
  // Snapshot of the minor's identity at consent time — kept even after
  // playerId goes null, since a proof of consent that no longer says whose
  // consent it was is worthless as evidence.
  playerFirstName     String
  playerLastName      String
  playerBirthDate     DateTime
  // Who attested consent was obtained, and when. Not a signature — see
  // Scope's "easiest possible" framing. Free-text name (typically the club
  // admin relaying "I have the signed paper form"), not a User relation:
  // the attester's own account may itself be deleted later, and this
  // record must still say who claimed to have obtained it.
  attestedByName      String
  attestedByUserId    String?
  attestedByUser      User?     @relation(fields: [attestedByUserId], references: [id], onDelete: SetNull)
  consentGivenAt      DateTime  @default(now())
  // Null while the player/account this documents is still active — the
  // 5-year clock is "account/player + 5 years," so it only starts ticking
  // once there's a deletion event to count 5 years from. Set by whichever
  // code path removes the Player (account-inactivity sweep, or a club
  // manually removing a player from their roster). Until then this row is
  // retained indefinitely, which is correct: consent proof for an active
  // minor's account must never expire out from under an active roster
  // entry.
  retentionExpiresAt  DateTime?

  @@index([playerId])
  @@index([retentionExpiresAt])
}

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
  // — see Back-office security.
  DATA_OFFICER
}

model PlatformAdmin {
  id           String       @id @default(uuid())
  userId       String       @unique
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  role         PlatformRole
  // TOTP secret for step-up auth on back-office login (see Back-office
  // security) — separate from the account's normal password, required
  // before this grant is usable at all.
  totpSecret   String?
  grantedByUserId String?
  createdAt    DateTime     @default(now())
}
```

`Player` gains a `parentalConsents ParentalConsent[]` back-relation (a player could in principle
be re-added after removal, hence a list, not a 1:1) and `Club` gains `parentalConsents
ParentalConsent[]`. `User` gains `platformAdmin PlatformAdmin?` and `parentalConsentsAttested
ParentalConsent[]`.

## Retention sweep (`RetentionModule`)

One BullMQ repeatable job (`retention-sweep`, nightly, mirrors the existing `scoresheet-ocr`
queue's setup in `server/src/scoresheets`), running each policy as an independent step so one
failing step doesn't block the others:

```typescript
@Injectable()
export class RetentionSweepProcessor {
  async run(dryRun = false): Promise<RetentionSweepResult> {
    const results = await Promise.allSettled([
      this.sweepInactiveAccounts(dryRun),
      this.sweepAuditLogs(dryRun),
      this.sweepExpiredParentalConsents(dryRun),
    ]);
    const summary = this.toSummary(results);
    // Persisted regardless of dryRun — a dry-run's "what would have
    // happened" is itself compliance evidence that the policy was
    // evaluated, per RGPD art. 5.2 accountability.
    await this.prisma.retentionRun.create({ data: { dryRun, summary, ranAt: new Date() } });
    return summary;
  }

  private async sweepInactiveAccounts(dryRun: boolean) {
    const cutoff = subMonths(new Date(), 12);
    const candidates = await this.prisma.user.findMany({
      where: { lastActiveAt: { lt: cutoff } },
      select: { id: true, email: true },
    });
    if (dryRun) return { count: candidates.length };
    for (const user of candidates) {
      await this.prisma.$transaction(async (tx) => {
        // Player.userId -> null happens automatically: it's a nullable FK
        // with no onDelete clause needed here since deleting User only
        // cascades tables that reference User directly (see schema above);
        // Player references User, not the other way round, so an explicit
        // updateMany is required before the delete, not a cascade.
        await tx.player.updateMany({ where: { userId: user.id }, data: { userId: null } });
        await this.setConsentRetentionClocksFor(tx, user.id);
        await tx.user.delete({ where: { id: user.id } });
        await tx.auditLog.create({
          data: { type: 'ADMIN_USER_ERASED', actorEmail: user.email, metadata: { reason: 'inactivity_12mo' } },
        });
      });
    }
    return { count: candidates.length };
  }

  private async sweepAuditLogs(dryRun: boolean) {
    const cutoff = subMonths(new Date(), 12);
    if (dryRun) return { count: await this.prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } }) };
    const { count } = await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return { count };
  }

  private async sweepExpiredParentalConsents(dryRun: boolean) {
    const now = new Date();
    if (dryRun) {
      return { count: await this.prisma.parentalConsent.count({ where: { retentionExpiresAt: { lt: now } } }) };
    }
    const { count } = await this.prisma.parentalConsent.deleteMany({ where: { retentionExpiresAt: { lt: now } } });
    return { count };
  }
}
```

`setConsentRetentionClocksFor` sets `retentionExpiresAt = now + 5y` on every `ParentalConsent`
row still pointing at a `Player` owned by this user's account (starting the clock the moment the
account — and, per the same transaction, effectively the last claim to that data — goes away).
The same helper is called from the existing player-removal path in `TeamsService`/`ClubsService`
wherever a `Player` is deleted outright, so the clock also starts on manual roster removal, not
only the automated sweep.

`lastActiveAt` is updated in one place: a lightweight interceptor on `JwtAuthGuard`-protected
routes (debounced — write at most once per hour per user, not on every request) rather than
scattering `prisma.user.update` calls through every controller.

## Back-office

### Why a back-office, scoped this tightly

The only operations a human needs to perform outside the automated sweep are: (1) handle a named
GDPR access/erasure request before the 12-month clock would otherwise fire, (2) confirm the
sweep is actually running and see what it did, (3) look up which club an inactive account
belonged to before erasing it, in case a club raises a support ticket first. That's the entire
surface — not a general admin panel. Every route below is deliberately read-mostly, with exactly
one destructive action (manual erasure), because a back-office over personal data is the single
highest-blast-radius surface in the product: it's the one place a compromised credential exposes
every club's roster at once, rather than one club's own data.

### Authorization model

`PlatformAdmin` (above) is checked by a new `PlatformAdminGuard`, structurally identical to
`ClubRolesGuard`'s shape but with no route param to key off — it reads `request.user.id`,
looks up `PlatformAdmin`, and 403s if absent, mirroring `TeamManagerGuard`'s
defense-in-depth style (guard does the coarse check, service methods still re-verify scope
before any mutation). `@PlatformRoles('DATA_OFFICER')` on top of it gates the one destructive
route (erasure) the same way `@ClubRoles('ADMIN')` already gates ownership-only actions
elsewhere.

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

### Hardening beyond auth

- **Separate rate limit**, tighter than the public API's: `/admin/login` (the TOTP step) is
  limited per-account (not just per-IP, since an admin's IP is often a fixed office/VPN address
  attackers could rotate around) to 5 attempts per 15 minutes, then locks the `PlatformAdmin`
  row until manually cleared — a locked-out admin is an acceptable cost, an unlimited TOTP
  brute-force is not.
- **IP allowlist, optional but supported**: `PlatformAdmin` gains an optional
  `allowedCidrs: String[]` (empty = unrestricted, matching how `BREVO_API_KEY`-style optional
  integrations degrade gracefully per `CLAUDE.md`'s convention) so a club-network or office-VPN
  restriction can be layered on per-admin without being mandatory for launch.
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

### API surface

| Method | Path                                  | Guard                                      | Notes                                                              |
| ------ | -------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| POST   | `/admin/login`                         | `JwtAuthGuard`                              | body `{ totpCode }`; issues `platformAccessToken`; rate-limited      |
| GET    | `/admin/retention/runs`                | `PlatformAdminGuard`                        | last N sweep results (`RetentionRun`)                                |
| POST   | `/admin/retention/dry-run`             | `PlatformAdminGuard` + `PlatformRoles('DATA_OFFICER')` | triggers an on-demand dry-run sweep                        |
| GET    | `/admin/users?status=inactive-soon`    | `PlatformAdminGuard`                        | redacted list only, per Hardening above                              |
| GET    | `/admin/users/:userId`                 | `PlatformAdminGuard` + `PlatformRoles('DATA_OFFICER')` | full profile; emits `ADMIN_PII_VIEWED`                     |
| POST   | `/admin/users/:userId/erase`           | `PlatformAdminGuard` + `PlatformRoles('DATA_OFFICER')` | body `{ reason }`; manual erasure ahead of the sweep       |
| GET    | `/admin/audit-log?userId=`             | `PlatformAdminGuard` + `PlatformRoles('DATA_OFFICER')` | for answering "who accessed this person's data"            |

### Frontend

Minimal: a login screen (email/password, already exists, reused) → TOTP prompt → a three-page
shell (`RetentionRunsPage`, `UsersNearingExpiryPage`, `UserDetailPage` with the erase action
behind a `Dialog` confirm per `CLAUDE.md`'s destructive-action modal convention). No new design
system components needed — reuses `Table`/`Dialog`/`Alert`/`Badge` as-is. Not themed as "Kluvo"
consumer product chrome (no `AppHeader`, no club switcher) — a plain internal-tool shell, since
conflating it visually with the product invites an admin to browse it like a support dashboard
rather than treat every click as an audited, justified action.

## Testing

Jest `*.spec.ts`: `RetentionSweepProcessor` (each sweep step, dry-run vs. real, the
`Player.userId → null` + `ParentalConsent.retentionExpiresAt` side effects of account erasure,
idempotency of re-running a sweep), `PlatformAdminGuard` (missing grant, missing step-up claim,
valid), `/admin/login` rate-limit lockout. Vitest/RTL for the three back-office pages and the
TOTP prompt. No new E2E harness — the `screenshot-ui` flow covers the back-office frontend once
built, same as any other UI change per `CLAUDE.md`.
