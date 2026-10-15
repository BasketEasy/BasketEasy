---
name: backend-slice
description: Checklist for adding or changing a NestJS endpoint, service, Prisma model, queue job or notification in Kluvo's server - authorization shape, bounded queries, best-effort side effects, provider seams, BullMQ and migrations. Use when writing or reviewing anything under server/src or server/prisma.
---

# Backend slice checklist

The patterns every Kluvo module converged on. `CLAUDE.md` has the module-specific rules; this is
the cross-cutting part. Work through it before writing code, and again on your own diff.

## Contract

- [ ] Shared shape first: a new file in `packages/@basketeasy/types` plus its `exports` entry (no
      barrel), then the class-validator DTO, then the frontend caller.
- [ ] Error copy is French, final, written server side. A refusal the client must branch on carries
      a machine code constant exported from the types package (`EMAIL_NOT_VERIFIED`,
      `GUEST_RSVP_CLOSED`, `IMPERSONATION_READ_ONLY`).
- [ ] Mutations return the updated resource (or an array for anything that can touch several rows),
      so the client can `setQueryData` instead of refetching.

## Authorization

- [ ] Pick the guard: `ClubRolesGuard` + `@ClubRoles()` for club members, `TeamManagerGuard` for
      team management, `@AllowGuardians()` only if parents should get this read (a product decision),
      `EmailVerifiedGuard` only for handing out authority over others' data (also a product
      decision), `PlatformAdminGuard` for `/admin`.
- [ ] The guard is coarse; the service re-verifies scope before touching anything:
      `assertTeamInClub` / `assertEventInTeam` style, 404 when the row isn't under the route's ids.
- [ ] « Me » is resolved from the caller (`resolveActingTeamPlayer`), never from a body id. A
      stranger's `forPlayerId` is 403, not « not rostered ».
- [ ] Cross-field rules are re-checked in the service even when the DTO expresses them.
- [ ] A `GET` never writes user-owned state (read-only impersonation relies on it). System upkeep
      (cache fill, queued recompute) is fine.

## Queries

- [ ] Bounded: a fixed number of queries per request whatever the batch size. No per-row lookup in a
      loop; batch with `in`, `groupBy`, `_count`. Assert the query count in the spec when it matters.
- [ ] Modules read each other's tables through `PrismaService` directly; they don't inject each
      other's services. Dependencies run one way (Events → meeting-points → nothing back); when a
      lower module must tell a higher one something, use an in-process feed
      (`MeetingChangeFeed`), not an import.
- [ ] Lists: `PaginatedResult`, default 25, max 100, clamped server side.
- [ ] Derived facts (season, `isMinor`, vote window state) are computed on read, not stored.
- [ ] Zero versus unknown: a value you couldn't read is `null`, never `0`.

## Writes and side effects

- [ ] The source-of-truth write is synchronous and transactional; everything that can't roll back
      (e-mail, push, enqueue, audit via `AuditService.record`) is best-effort, after the commit,
      logged and swallowed. A provider outage never fails the user's request.
- [ ] Exception: an audit row that must exist iff the write happened (support actions, erasure,
      impersonation start) is written **inside** the same transaction.
- [ ] A full-replace endpoint that notifies diffs against the state read **before** the write.
      Recipients of a delete are gathered **before** the cascade removes them.
- [ ] A series operation sends one summary per recipient, never one per occurrence.
- [ ] Races: claim with a conditional `updateMany` (`where: { state: expected }`) or
      `SELECT … FOR UPDATE`; first writer wins and the second gets a success, not an error, when
      both did the real thing.
- [ ] Notifications: through `NotificationsService.notify`, recipients via `resolvePlayerAudience` + `groupByRecipient` (guardians included), copy in a pure `*-notification-copy.ts` function,
      dates in Europe/Paris, `deepLink` relative and through a club the reader belongs to.

## Integrations and jobs

- [ ] An external provider sits behind a DI token (`MAIL_CLIENT`, `ROUTING_CLIENT`,
      `SCORESHEET_VISION_CLIENT` pattern) with a null/log fallback when its key is unset. Its key is
      **not** in `validateEnv`: a missing integration degrades one feature, never boot.
- [ ] Provider failures are typed and fail loud in one place; a provider throw is never cached as a
      result.
- [ ] BullMQ: deterministic job ids without `:` (Redis key separator), keyed on what the job is
      about; the processor stays thin and re-reads state before acting, so a stale job is harmless;
      write the row first, then move jobs; enqueue failures are logged, never thrown at the caller.
      Repeatable jobs register with `upsertJobScheduler` inside a try/catch.
- [ ] Rate-limit anything that calls a third party from a user action (cooldown, limiter, budget).

## Schema

- [ ] Hand-written migration in Prisma's generated style, then `prisma generate`. Additive columns
      nullable or defaulted; enum growth via `ALTER TYPE … ADD VALUE`.
- [ ] Choose `onDelete` on purpose: `Cascade` for what belongs to the parent, `SetNull` for
      attribution or records that must outlive it (consent, audit, shares), never Prisma's default
      `Restrict` by accident.
- [ ] Prefer a 1–1 side table over many nullable columns that only one row type uses.
- [ ] What only the database enforces gets a `server/test/db/*.db-spec.ts` case.

## Tests and verification

- [ ] Colocated `*.spec.ts` with Prisma mocked: happy path, every refusal, and « nothing written »
      on each refusal.
- [ ] Run only what you touched: `pnpm --filter @basketeasy/server test -- <pattern>`,
      `pnpm --filter @basketeasy/server exec eslint <files>`, `pnpm exec prettier --check <files>`.
- [ ] Update `CLAUDE.md` and `docs/decisions/<domain>.md` in the same PR when a rule or decision
      changed.
