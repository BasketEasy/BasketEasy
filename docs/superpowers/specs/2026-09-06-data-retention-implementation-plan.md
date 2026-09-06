# Data retention — implementation plan

Status: plan (implements [`2026-09-06-data-retention-policy-design.md`](./2026-09-06-data-retention-policy-design.md))
Date: 2026-09-06

The design doc says _what_ the policy is and _why_. This plan says what actually gets built,
in what order, and resolves the eight questions the design doc left open (marked **Q1–Q8**
below). Anything the design doc put out of scope stays out of scope here — in particular the
back-office surface, backup rotation, inactivity warning e-mails, and any consent-withdrawal
or parent-facing flow.

## What ships

Five slices, each independently reviewable, landing in this order because each depends on the
one before it:

1. **Schema + migration** — `User.lastActiveAt`, `AuditLog`, `ParentalConsent`, `RetentionRun`.
2. **Audit module** — `AuditService` plus the auth call sites that emit events.
3. **Activity tracking** — `LastActiveInterceptor` (debounced) plus the login/refresh writes.
4. **Retention module** — the nightly BullMQ repeatable job and its three sweeps.
5. **Parental consent** — capture at player creation, a record-later endpoint for imported
   players, and the roster UI that surfaces a missing consent.

## Resolved questions

**Q1 — `RetentionRun` is used by the design doc's pseudocode but never defined.** Defined here:

```prisma
// Compliance evidence that the policy actually executed (RGPD art. 5.2,
// accountability): a row per sweep, dry-run or not, holding the per-step
// counts. Deliberately not a log line — a log is rotated and unqueryable,
// and "prove your retention policy runs" is a question asked months later.
model RetentionRun {
  id        String   @id @default(uuid())
  ranAt     DateTime @default(now())
  dryRun    Boolean  @default(false)
  // { inactiveAccounts: { status, count, error? }, auditLogs: {...},
  //   parentalConsents: {...} } — one entry per independent step, so a
  //   step that threw is visible as a failure next to the steps that
  //   succeeded rather than losing the whole run.
  summary   Json
  @@index([ranAt])
}
```

These rows are themselves never swept: a handful of rows a year, and a retention record that
expires defeats its own purpose.

**Q2 — does `AuditLog.userId` get a real FK?** Yes, `onDelete: SetNull`. The design doc's
requirement is that the _entry survives_ the account it describes, which `actorEmail` (a
denormalised snapshot) satisfies; a dangling `userId` string with no FK would buy nothing and
lose referential integrity. `User` gains an `auditLogs AuditLog[]` back-relation.

**Q3 — where does the `AuditLog` write live?** A new `server/src/audit` module exporting
`AuditService`, not a helper inside `RetentionModule`. The table is swept by retention but
written by auth, and `RetentionModule` importing `AuthModule` (which is what an audit helper
living there would force) inverts the dependency. `AuditService.record()` is fire-and-forget
(`catch` + `logger.warn`), the same contract as `MailService.sendAndForget`: an audit write
failing must never turn a successful login into a 500, and there is nothing the caller could
do about it anyway.

**Q4 — how does `lastActiveAt` get written without a `prisma.user.update` on every request?**
A global `APP_INTERCEPTOR` (`LastActiveInterceptor`) that no-ops unless `request.user` is set,
so it costs one property read on public routes. Debounced through an in-process `Map<userId,
timestampMs>`: at most one write per user per hour per server instance. The map is bounded by
evicting entries older than the window on each pass, so a long-running instance doesn't grow
it without limit. Two instances can each write once an hour — accepted: the value only ever
has to be accurate to within a day for a 12-month cutoff, and a shared Redis counter would
make an activity ping depend on the queue being up. `login` and `refresh` write it directly
(both already write to the user's row's neighbourhood, and a refresh is the one activity
signal that arrives without passing `JwtAuthGuard`).

**Q5 — what starts the consent 5-year clock, exactly?** Two call sites, whichever fires first:
`ClubsService.deletePlayer` (manual roster removal) and the inactive-account sweep (for every
`ParentalConsent` whose `Player` is linked to the deleted account). The design doc's own
wording — "compte/joueur + 5 ans" — is what makes both a trigger. Note the asymmetry it
creates and that we are accepting deliberately: an account deletion starts the clock while the
`Player` row itself survives (stats are kept forever, per rule 3), so a consent proof can
expire while its roster entry still exists. That is the specified rule; the alternative
(clock only on player deletion) would leave consent proofs for abandoned accounts alive
forever, which is the failure mode the retention policy exists to prevent. Re-recording
consent for a player clears `retentionExpiresAt` back to null, so a re-linked player is not
left with a ticking clock.

**Q6 — is parental consent mandatory?** On the interactive create path, yes; on bulk import,
no. `POST /clubs/:clubId/players` rejects with `400 PARENTAL_CONSENT_REQUIRED` when the
supplied `birthDate` makes the player a minor and no `parentalConsent` block is present —
that is the one moment a human is looking at the form, which is the whole "staff-attested"
premise. `POST /clubs/:clubId/players/import` and the FFBB import path stay unblocked: they
create tens of rows from federation data with no human on any individual one, and failing an
import because row 34 is 16 years old would make the feature unusable. Those players surface
in the roster as _consentement manquant_ and are resolved with the record-later endpoint. A
"consents manquants" club-level worklist is the fast-follow, not this slice.

**Q7 — how does the UI know a player needs consent?** `ClubsService.listPlayers` gains one
bounded extra query: for the minors on the current page only, fetch their `ParentalConsent`
ids. `Player` (the API type) gains `isMinor: boolean` and `parentalConsentGivenAt: string |
null`. Both are derived, not stored — `isMinor` from `birthDate` against the request date,
because a stored flag is wrong the day after the player's 18th birthday.

**Q8 — how is the nightly job registered, given there is no repeatable job in the repo yet?**
`RetentionModule` implements `OnModuleInit` and calls `queue.upsertJobScheduler` (idempotent
by scheduler id, so a redeploy or a second instance re-registers the same schedule rather than
duplicating it). Wrapped in try/catch that logs and continues: an unreachable Redis must not
stop the server booting, the same policy as `QueueModule`'s non-boot-validated `REDIS_URL`.
`RETENTION_SWEEP_ENABLED` (default `true`) and `RETENTION_SWEEP_DRY_RUN` (default `false`)
control it; `RETENTION_SWEEP_DRY_RUN=true` is how a deployment runs a cycle in observation
mode before letting it delete anything, which the design doc asks for but never wires up.

## Slice 1 — schema + migration

`server/prisma/schema.prisma`:

- `User.lastActiveAt DateTime @default(now())` + `auditLogs`, `parentalConsentsAttested`
  back-relations.
- `Player.parentalConsents ParentalConsent[]`, `Club.parentalConsents ParentalConsent[]`.
- `enum AuditEventType`, `model AuditLog`, `model ParentalConsent`, `model RetentionRun`
  exactly as the design doc defines them, plus Q1/Q2's resolutions.

Hand-written migration at `server/prisma/migrations/20260906000000_add_data_retention/`
(no live Postgres in the sandbox — CLAUDE.md's documented path), then
`prisma generate` so the rest of the build type-checks.

Backfill: `lastActiveAt` defaults to `now()` for existing rows, which is the safe direction —
every existing account gets a fresh 12-month clock rather than being swept on the first night
because the column was null.

## Slice 2 — audit module

`server/src/audit/{audit.module.ts,audit.service.ts,audit.service.spec.ts}`.

```typescript
record(event: {
  type: AuditEventType;
  userId?: string | null;
  actorEmail?: string | null;
  context?: AuditRequestContext;   // { ipAddress, userAgent }
  metadata?: Prisma.InputJsonValue;
}): void   // fire-and-forget, never awaited by callers
```

`AuditRequestContext` is extracted once by a small `auditContextFrom(req)` helper rather than
each controller reaching into `req.ip`/headers itself. Emission points, all in
`AuthService`/`AccountSecurityService`, with the controller passing the request context down:

| Event                                                   | Site                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOGIN_SUCCESS`                                         | `AuthService.login`, after `argon2.verify`                                                                                                                                                                                             |
| `LOGIN_FAILURE`                                         | `AuthService.login`, both the unknown-email and bad-password branches — same event, `userId` null in the first case (an unknown address still has to be logged; repeated failures against unknown addresses are themselves the signal) |
| `LOGOUT`                                                | `AuthService.logout`, only when a token row was found                                                                                                                                                                                  |
| `REFRESH_TOKEN_REUSE_DETECTED`                          | `AuthService.refresh`, the family-revocation branch — _not_ the grace-window branch, which is a legitimate client race                                                                                                                 |
| `PASSWORD_RESET_REQUESTED` / `PASSWORD_RESET_COMPLETED` | `AccountSecurityService`                                                                                                                                                                                                               |
| `EMAIL_VERIFIED`                                        | `AccountSecurityService.confirmEmail`                                                                                                                                                                                                  |

The password-reset request event is recorded whether or not the address matches an account,
with `userId` null in the second case — and this does **not** leak the enumeration the
endpoint deliberately hides, because nothing about the response changes.

## Slice 3 — activity tracking

`server/src/auth/last-active.interceptor.ts` + spec, registered as `APP_INTERCEPTOR` in
`AuthModule`. `LAST_ACTIVE_WRITE_INTERVAL_MS = 60 * 60 * 1000`. Direct writes in
`AuthService.login`/`refresh`. The interceptor swallows its own write failure — an activity
ping is not worth failing a request that already succeeded.

## Slice 4 — retention module

`server/src/retention/`: `retention.module.ts`, `retention.service.ts` (the three sweeps and
the `RetentionRun` write), `retention-sweep.processor.ts` (`@Processor(RETENTION_SWEEP_QUEUE)`,
thin — it delegates to the service), `retention.constants.ts`, plus specs.
`RETENTION_SWEEP_QUEUE = 'retention-sweep'` joins `SCORESHEET_OCR_QUEUE` in
`server/src/queue/queue.module.ts`.

Cutoffs are computed by a local `subMonths` helper in `retention.constants.ts` — `date-fns`
is not a server dependency and one 4-line UTC-safe helper is not worth adding it.

Steps run through `Promise.allSettled` so one failure doesn't cancel the others, exactly as
the design doc's pseudocode has it; each settles to `{ status: 'ok' | 'error', count, error? }`
and the whole shape is persisted as the `RetentionRun.summary`.

Account erasure runs one transaction per user (`player.updateMany → userId: null`, consent
clocks, `user.delete`, an `AuditLog` row) rather than one big transaction, so a single bad row
doesn't roll back the whole night's work. `MAX_ACCOUNTS_PER_SWEEP = 500` caps one run: a first
production run after a long dry-run period could otherwise delete an unbounded number of
accounts in one transaction storm, and the remainder is simply picked up the next night.

The `AuditLog` row written for an erasure gets `type: LOGOUT` with
`metadata: { reason: 'inactivity_12mo_erasure' }`, per the design doc — deliberately not a new
enum value, since the back-office spec owns extending `AuditEventType` and a retention erasure
is, from the security log's point of view, the account's last session ending.

## Slice 5 — parental consent

**Types** (`packages/@basketeasy/types/parental-consent.ts`, new subpath export):
`ParentalConsent`, `RecordParentalConsentRequest { attestedByName }`,
`PARENTAL_CONSENT_REQUIRED_CODE`, and `MINOR_AGE_YEARS = 18`.
`players.ts` gains `parentalConsent?: RecordParentalConsentRequest` on `CreatePlayerRequest`
and `isMinor` / `parentalConsentGivenAt` on `Player`.

**API** (`ClubsController`, `@ClubRoles('ADMIN')` like the rest of the player routes):

- `POST /clubs/:clubId/players` — optional `parentalConsent`, required for a minor (Q6).
- `POST /clubs/:clubId/players/:playerId/parental-consent` — record/replace for an existing
  player; clears `retentionExpiresAt`.
- `GET /clubs/:clubId/players/:playerId/parental-consent` — the single-player read.

The consent row snapshots `playerFirstName`/`playerLastName`/`playerBirthDate` at write time,
per the design doc: a proof that no longer says whose consent it was is not evidence.
`attestedByUserId` is the calling admin; `attestedByName` is free text defaulting (client-side)
to that admin's own name, because the person attesting is usually but not always the person
typing.

**Frontend** (`app/src/clubs/`):

- `PlayerCreateForm` grows a consent block that appears only once `birthDate` resolves to a
  minor: a required checkbox ("J'atteste avoir recueilli l'autorisation parentale écrite")
  plus the attester's name, prefilled from the session. Inline `FieldError` on the checkbox,
  not a toast — it is field validation, per CLAUDE.md's feedback rule.
- The players table shows a `Badge` (`tone="danger"`, `variant="soft"`) reading
  _Autorisation manquante_ on a minor with no consent, and an _Autorisation parentale_ action
  opening a `Dialog` with the same two fields. A modal, not inline: it is a multi-field,
  infrequent, legally-loaded record — CLAUDE.md's own criterion for the blessed `Dialog`.
- `useRecordParentalConsent` mutation invalidates the club players query; success is a
  `toast()` (the dialog closes, so there is nowhere inline left to render it).

Screenshots of both surfaces before the task is called done, via `pnpm mock-api` + Playwright,
extending `scripts/fixtures/authenticated-admin-session.json`.

## Tests

Server (Jest, colocated): `AuditService` (records, swallows a write failure), each auth
emission point, `LastActiveInterceptor` (writes once, debounces the second call inside the
window, ignores unauthenticated requests, swallows failures), `RetentionService` (each sweep
in dry-run and real mode, the `Player.userId → null` and consent-clock side effects, the
per-user cap, one step failing while the others still record, idempotent re-run),
`ClubsService` (minor without consent rejected, minor with consent creates both rows, adult
unaffected, import path unaffected, `deletePlayer` starts the clock, re-record clears it).

Frontend (Vitest): `PlayerCreateForm` (consent block appears for a minor birth date, blocks
submit unchecked, sends the block), the roster consent dialog (records, shows the toast,
error path).

## Docs

`CLAUDE.md` gains a **Retention & audit** section and loses the "no retention job / no audit
log" line from _What's deliberately not here yet_; `.env.example` documents the two new vars.
