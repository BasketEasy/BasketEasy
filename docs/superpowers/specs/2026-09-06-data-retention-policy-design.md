# Data retention policy

Status: draft (loop 0)
Date: 2026-09-06

## Why

Launch requires a documented, enforced data retention policy (RGPD, art. 5.1.e — data kept no
longer than necessary). Nothing enforces this today: `CLAUDE.md`'s "What's deliberately not
here yet" lists no retention job and no audit-log table.

Five retention rules, as specified:

1. **Active account:** kept for the duration of use, no automatic action.
2. **Inactive account:** 12 months of inactivity → delete.
3. **Stats / scoresheets:** kept forever — **not** anonymized after 3 seasons as first proposed.
   Reasoning to record here since it reverses the initial ask: `docs/superpowers/specs/2026-09-02-team-season-stats-design.md`
   and the scoresheets module already treat `MatchPlayerStat`/`ScoresheetExtraction` as
   historical record (season-over-season comparison is the whole point of the stats screen),
   and none of it is special-category data under RGPD (art. 9) — it's game results. Anonymizing
   it would silently break a club's own multi-season history for a compliance rule that doesn't
   actually apply to this data. Only the _account_ retention rule below can still remove PII
   _about a person_ that happens to intersect this data (see Interaction section).
4. **Security logs:** 12 months (CNIL's standard recommendation for connection/security logs).
   Doesn't exist as a concept yet — this spec adds it.
5. **Backups:** 30-day rotation. This is infrastructure, not application data — see Scope.
6. **Parental consent proof:** account/player + 5 years (civil liability limitation period,
   art. 2224 Code civil). Doesn't exist as a feature yet — this spec adds the simplest possible
   version alongside its retention rule, since a retention rule for data that isn't collected
   is meaningless.

A companion spec, [`2026-09-06-backoffice-design.md`](./2026-09-06-backoffice-design.md), covers
the platform-admin surface for handling GDPR access/erasure requests and inspecting sweep runs.
It depends on the `AuditLog` table defined here but is a separate, independently reviewable
piece of work — this spec is complete and self-contained without it (the sweep runs
automatically either way).

## Scope

**In scope:**

- `User.lastActiveAt` tracking + a nightly retention sweep job that deletes accounts inactive
  12+ months.
- A minimal `ParentalConsent` feature: one checkbox at the point a club adds/invites a player
  under 18, capturing who confirmed consent and when. Retained 5 years _after_ the player/account
  it documents is removed, not 5 years from creation (see Data model — this is what "compte + 5
  ans" means: the clock doesn't start until there's something to prescribe against).
- A new `AuditLog` table capturing security-relevant events (login, login failure, password
  reset, refresh-token reuse/revocation), swept at 12 months. Also used by the companion
  back-office spec to record platform-admin actions, but exists independently of it.
- A `RetentionModule` running all sweeps as one nightly BullMQ repeatable job, each policy as
  an independent, idempotent step, with a dry-run mode and a persisted run record for compliance
  evidence ("prove the policy actually executes," which is itself part of RGPD accountability,
  art. 5.2).

**Out of scope (explicitly deferred):**

- **Backup rotation itself** — set at the infrastructure level (Postgres backup tool's own
  retention config, or an R2 bucket lifecycle rule for scoresheet-photo backups if they're
  backed up separately from the primary R2 bucket). No application code enforces this; it's
  documented here so the policy list is complete, and the actual config lives in the deploy
  runbook, not this repo's business logic.
- **A back-office UI/API** — see the companion spec; deliberately split out so this policy and
  its automated enforcement can ship and be reviewed independently of the admin surface.
- **Automated inactivity warnings** ("your account will be deleted in 30 days") — the retention
  sweep needs a notification hook eventually (reusing `server/src/notifications`), but v1 ships
  the deletion mechanism first and the warning as a fast-follow once the sweep is proven
  correct in production for one cycle. Flagged here so it isn't forgotten, not built
  speculatively.
- **Consent withdrawal / re-consent flows**, **age verification beyond `Player.birthDate`**, and
  **a parent-facing portal** — v1 is the "easiest possible" version: a staff/admin-entered
  attestation at creation time, not a signed-by-the-parent-directly flow. If a real e-signature
  or parent-account flow is wanted later, that's a follow-up spec, not a scope creep here.

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
  // Platform-admin/back-office actions reuse this table (see companion
  // back-office spec) with their own event types, so a CNIL/DPO export can
  // be filtered precisely — added by that spec, not this one.
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
```

`Player` gains a `parentalConsents ParentalConsent[]` back-relation (a player could in principle
be re-added after removal, hence a list, not a 1:1) and `Club` gains `parentalConsents
ParentalConsent[]`. `User` gains `parentalConsentsAttested ParentalConsent[]`.

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
          data: {
            type: 'LOGOUT',
            actorEmail: user.email,
            metadata: { reason: 'inactivity_12mo_erasure' },
          },
        });
      });
    }
    return { count: candidates.length };
  }

  private async sweepAuditLogs(dryRun: boolean) {
    const cutoff = subMonths(new Date(), 12);
    if (dryRun)
      return { count: await this.prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } }) };
    const { count } = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return { count };
  }

  private async sweepExpiredParentalConsents(dryRun: boolean) {
    const now = new Date();
    if (dryRun) {
      return {
        count: await this.prisma.parentalConsent.count({
          where: { retentionExpiresAt: { lt: now } },
        }),
      };
    }
    const { count } = await this.prisma.parentalConsent.deleteMany({
      where: { retentionExpiresAt: { lt: now } },
    });
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

## Testing

Jest `*.spec.ts`: `RetentionSweepProcessor` (each sweep step, dry-run vs. real, the
`Player.userId → null` + `ParentalConsent.retentionExpiresAt` side effects of account erasure,
idempotency of re-running a sweep), the `lastActiveAt`-updating interceptor. No new E2E harness.
