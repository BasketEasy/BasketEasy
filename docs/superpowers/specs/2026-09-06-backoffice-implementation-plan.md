# Platform back-office — implementation plan

Status: implementing
Date: 2026-09-06
Design record: [`2026-09-06-backoffice-design.md`](./2026-09-06-backoffice-design.md)

This is the build plan for that design. It records the decisions the design left open, the
places where implementation had to deviate from it, and — most importantly — exactly which of
the companion [`2026-09-06-data-retention-policy-design.md`](./2026-09-06-data-retention-policy-design.md)
this change does and does not build.

## The dependency problem, and how it is resolved

The back-office design says it "depends conceptually on the `AuditLog` table from the retention
spec". In practice that dependency is not conceptual at all: four of its seven routes cannot
exist without tables the retention spec defines and neither spec has built yet.

| Back-office route                       | Needs                              |
| --------------------------------------- | ---------------------------------- |
| `POST /admin/login`                     | —                                  |
| `GET /admin/retention/runs`             | `RetentionRun`                     |
| `POST /admin/retention/dry-run`         | `RetentionRun` + sweep counting    |
| `GET /admin/users?status=inactive-soon` | `User.lastActiveAt`                |
| `GET /admin/users/:userId`              | `AuditLog` (`ADMIN_PII_VIEWED`)    |
| `POST /admin/users/:userId/erase`       | `AuditLog` + the erasure primitive |
| `GET /admin/audit-log`                  | `AuditLog`                         |

So this change builds the retention spec's **data model and its erasure primitive**, and nothing
else of it. Concretely:

**Built here** (defined byte-for-byte as the retention spec specifies them, so that spec's sweep
drops straight onto them):

- `AuditEventType` enum — both the auth values from the retention spec and the five `ADMIN_*`
  values from the back-office spec, in one enum. Splitting them across two migrations would mean
  the back-office shipping an enum the retention spec then has to `ALTER TYPE`; the enum is one
  shared vocabulary, so it lands whole.
- `AuditLog` model + an `AuditModule`/`AuditService` seam. Only the `ADMIN_*` events are emitted
  by this change; the auth events (`LOGIN_SUCCESS`, `REFRESH_TOKEN_REUSE_DETECTED`, …) are the
  retention spec's emitters to wire, and `AuditService.record()` is the seam they wire into.
- `RetentionRun` model, and a `RetentionModule` whose `RetentionService` owns (a) the dry-run
  counting sweep behind `POST /admin/retention/dry-run` and (b) `eraseUserAccount()`, the
  `Player.userId → null` + `User.delete` primitive that the back-office's manual erasure and the
  retention spec's nightly sweep both need. One implementation, two callers.
- `User.lastActiveAt`, updated on login and on refresh.

**Not built here, still the retention spec's:** `ParentalConsent` and its 5-year clock; the
nightly BullMQ repeatable job and the _destructive_ sweep steps; the auth-event `AuditLog`
emitters; the `lastActiveAt` interceptor; inactivity warning notifications.

`lastActiveAt` on login/refresh rather than the spec's debounced interceptor is deliberate for
this cut and is not a stopgap that produces wrong data: the refresh token rotates on a 15-minute
access-token expiry for the whole 30-day life of a session, so any account in actual use writes
`lastActiveAt` continuously. The interceptor closes a gap measured in minutes, on a signal read
with a 12-month cutoff.

## Decisions the design left open

### 1. TOTP: hand-rolled RFC 6238, no new dependency

`server/src/platform-admin/totp.util.ts` implements HOTP/TOTP over `node:crypto` (~60 lines:
base32 decode, HMAC-SHA1, dynamic truncation) rather than pulling in `otplib`/`speakeasy`. The
algorithm is fully specified and has published test vectors, so correctness is provable rather
than trusted — `totp.util.spec.ts` runs RFC 4226 Appendix D and RFC 6238 Appendix B verbatim.
This matches the repo's existing posture on single-purpose dependencies (see `AppModule`'s
hand-rolled `validateEnv`, deliberately not Joi/zod).

A ±1 step (±30s) verification window absorbs clock skew, which is the standard tolerance and
the minimum that makes a real authenticator app usable.

### 2. Enrollment is out-of-band, so there is no QR screen

The design mentions "a QR-code enrollment screen", but its own Hardening section says grants are
provisioned out-of-band with no self-service path. Those two pull in opposite directions, and
the Hardening rule wins: an in-app enrollment screen is a self-service path to arming a grant.

`server/scripts/platform-admin.ts` is the ops tool — `grant`, `revoke`, `unlock`, `list`. `grant`
generates the TOTP secret and prints the `otpauth://totp/...` URI, which every authenticator app
accepts pasted or rendered as a QR by the operator's own terminal. No QR dependency reaches the
client bundle, and the frontend never has an enrollment route to protect.

### 3. The step-up token gets its own secret, and the back-office is off by default

The design specifies a second JWT distinguished by a `scope: 'platform-admin'` claim. It is
signed with its own `PLATFORM_JWT_SECRET`, not `JWT_ACCESS_SECRET`: sharing the secret would mean
a leaked access-token secret mints platform tokens too, which is precisely the blast radius the
step-up exists to contain.

`PLATFORM_JWT_SECRET` is **not** added to `AppModule.validateEnv` — same policy as
`REDIS_URL`/`R2_*`/`GEMINI_API_KEY` per `CLAUDE.md`. With it unset, every `/admin/*` route
answers `503` and the back-office simply does not exist for that deployment. That is the correct
default for the highest-blast-radius surface in the product: it is opt-in per deploy, not
merely unreachable-in-practice.

The token travels in its own `X-Platform-Token` header. It cannot ride `Authorization`, which
already carries the normal access token — the design requires _both_ credentials on every
`/admin/*` request, and a cookie would need CSRF handling the header does not.

### 4. Lockout state is read from the audit log, not a counter column

The design's `PlatformAdmin` model has `lockedUntil` but no attempt counter, while its Hardening
section requires "5 attempts per 15 minutes" per account. Rather than adding counter columns, the
window is counted from the `ADMIN_LOGIN_FAILURE` rows the design already requires be written for
every failed attempt. Those rows are durable across restarts and shared across server instances,
which an in-memory counter is not, and they are the record a DPO would read anyway.

"Until manually cleared" is implemented literally: the 5th failure writes a far-future
`lockedUntil` (`LOCK_UNTIL_CLEARED`, +100 years) and only `platform-admin.ts unlock` clears it.
A short auto-expiring lock would turn the lockout into a rate limit an attacker waits out.

### 5. `GET /admin/audit-log?userId=` matches subject _or_ actor

An `ADMIN_PII_VIEWED` row's `userId`/`actorEmail` is the **admin who looked**; the data subject
they looked at is in `metadata.subjectUserId` (the design: "with which subject, in `metadata`").
But the route exists to answer "who accessed _this person's_ data", which is a query by subject.
So the filter is `userId = :userId OR metadata.subjectUserId = :userId` — it returns both what
that account did and what was done to it, which is also what a DSAR response needs.

`AuditLog.userId` is a plain column with no FK relation, per the retention spec: an audit row
must outlive the account it describes, so erasing a user leaves its audit trail intact.

### 6. Redaction shape for the list view

`GET /admin/users?status=inactive-soon` returns `{ id, emailDomain, lastActiveAt,
daysUntilErasure, clubCount }` — no local-part, no name, no club names. `emailDomain` is there
because it is the one field that distinguishes "a real club volunteer" from "an obvious test
account" without identifying anybody, and `clubCount` because zero-club accounts are the safe
bulk of the list. Opening one specific record is the `ADMIN_PII_VIEWED` moment.

"Inactive-soon" is `lastActiveAt < now − 11 months`, i.e. the last month before the 12-month
cutoff _plus_ anything already past it — an account the sweep should have taken but hasn't
belongs on the same screen, not hidden by an upper bound.

### 7. `PlatformRoles` and the guard's failure codes

`PlatformAdminGuard` mirrors `ClubRolesGuard`'s shape (reflector + Prisma, fails closed) and
`@PlatformRoles('DATA_OFFICER')` mirrors `@ClubRoles`. Its 403s carry machine-readable codes so
the client can distinguish "re-enter your TOTP code" from "you may not do this", the same
pattern `EmailVerifiedGuard`'s `EMAIL_NOT_VERIFIED` established:

- `PLATFORM_STEP_UP_REQUIRED` — no/expired/invalid `X-Platform-Token`. The admin shell drops its
  token and re-prompts for a code.
- `PLATFORM_ADMIN_LOCKED` — grant exists but is locked out.
- everything else — a plain 403 with no code, so a non-admin learns nothing.

IP allowlist matching uses `node:net`'s built-in `BlockList` (`addSubnet`/`check`), which handles
IPv4 and IPv6 — no CIDR dependency.

## File plan

```
packages/@basketeasy/types/platform-admin.ts    shared shapes + error codes (+ exports entry)

server/prisma/schema.prisma                     PlatformAdmin, PlatformRole, AuditLog,
                                                AuditEventType, RetentionRun, User.lastActiveAt
server/prisma/migrations/20260906000000_add_platform_admin_and_audit_log/migration.sql

server/src/audit/audit.module.ts
server/src/audit/audit.service.ts               AuditService.record() — the seam #151 wires into
server/src/retention/retention.module.ts
server/src/retention/retention.service.ts       dryRun() + eraseUserAccount()
server/src/platform-admin/platform-admin.module.ts
server/src/platform-admin/platform-admin.controller.ts   the seven routes, at /admin
server/src/platform-admin/platform-admin.service.ts
server/src/platform-admin/platform-admin.constants.ts
server/src/platform-admin/totp.util.ts
server/src/platform-admin/client-ip.util.ts     trusted-proxy-aware IP + BlockList matching
server/src/auth/guards/platform-admin.guard.ts
server/src/auth/decorators/platform-roles.decorator.ts
server/scripts/platform-admin.ts                grant / revoke / unlock / list

app/src/api/client.ts                           setPlatformToken() + X-Platform-Token injection
app/src/admin/                                  AdminRoute, AdminShell, TOTP prompt, 3 pages,
                                                query hooks, platformSession
app/src/App.tsx                                 lazy-loaded /admin/* subtree
```

The admin subtree is `React.lazy`-loaded — the design's "never renders, fetches, or bundles
admin-only code for the 99.9% of users who aren't platform staff" is a bundling claim, and only
a split point makes it true.

## Testing

- `totp.util.spec.ts` — RFC 4226 App. D + RFC 6238 App. B vectors, skew window, base32 rejection.
- `platform-admin.guard.spec.ts` — no grant, no step-up header, wrong `scope`, token minted for a
  different `sub`, expired token, locked grant, CIDR miss/hit, role gate, secret unset → 503.
- `platform-admin.service.spec.ts` — TOTP verification, the 5-failure lockout window, redaction of
  the list view, `ADMIN_PII_VIEWED` on detail, erasure's `Player.userId → null` + reason
  requirement, the audit-log subject-or-actor filter.
- `retention.service.spec.ts` — dry-run counts, `eraseUserAccount` transaction.
- `client-ip.util.spec.ts` — allowlist empty = unrestricted, IPv4/IPv6 subnets.
- Vitest/RTL: the TOTP prompt (`AdminLoginForm`), the three pages' `error → loading → empty →
data` ladders, the erase `Dialog` requiring a reason.
- `screenshot-ui` for the three back-office screens, per `CLAUDE.md`.
