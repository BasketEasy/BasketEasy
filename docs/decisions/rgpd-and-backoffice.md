# RGPD, retention and the back-office

Rules live in `CLAUDE.md` (« Retention, audit & parental consent », « Platform back-office »).
This is the policy, its legal basis, and the reasoning behind the back-office's shape.

## The retention policy

| #   | Data                      | Rule                                                         | Basis / reason                                                                                                                                              |
| --- | ------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Active account            | kept while in use                                            | RGPD art. 5.1.e                                                                                                                                             |
| 2   | Inactive account          | erased after 12 months without activity                      | art. 5.1.e                                                                                                                                                  |
| 3   | Stats and scoresheets     | **kept forever**                                             | reverses the first ask (anonymise after 3 seasons): they are game results, not art. 9 data, and season-over-season history is the point of the stats screen |
| 4   | Security log (`AuditLog`) | 12 months                                                    | CNIL recommendation for connection logs                                                                                                                     |
| 5   | Backups                   | 30-day rotation                                              | infrastructure (Postgres backup tool, R2 lifecycle); no application code, belongs in the deploy runbook                                                     |
| 6   | Parental consent proof    | 5 years **after** the player/account it documents is removed | civil liability limitation (Code civil art. 2224); survives erasure under art. 17.3.b                                                                       |

How the rules interact:

- **Erasing an account must not erase the club's history (rule 3).** Erasure detaches the
  account (`Player.userId = null`, the state of an unclaimed roster entry) and lets what hangs off
  `User` cascade. « Jean Dupont, 14 points » stays on the club's stats page.
- The consent clock starts at deletion, whichever comes first: the player removed from a roster, or
  the linked account erased. That means a consent proof can expire while its roster entry survives
  an account erasure; accepted, because the alternative keeps proofs for abandoned accounts
  forever. Re-recording consent stops the clock.
- `lastActiveAt` defaulted to the migration's `now()`, so every existing account started a fresh
  12-month clock instead of being swept on night one.
- `isMinor` is derived from the birth date at request time, never stored (a stored flag is wrong
  the day after an 18th birthday).
- Parental consent is required on the interactive create path and **not** on bulk imports: failing
  an 80-row import because row 34 is sixteen would make imports unusable; those players surface as
  « autorisation manquante ».
- Finished `EventShare` rows (SENT, EXPIRED, VOID) are deleted 12 months after their last change,
  unless still tied to an event not yet played: a CANCELLATION row keeps an `eventSnapshot` (event
  name, opponent, venue) and `sentByUserId`, and « every table has a retention rule » is the policy.
- Every sweep run, dry-run included, writes a `RetentionRun` row: « prove the policy executes » is
  itself accountability (art. 5.2), asked months later, and a log line is neither durable nor
  queryable. Those rows are never swept. `RETENTION_SWEEP_DRY_RUN=true` lets a deployment observe a
  cycle before anything is deleted.
- An automated erasure is logged as `LOGOUT` with `metadata.reason: 'inactivity_12mo_erasure'`:
  from the security log's point of view, the account's last session ended.

## The RGPD export (art. 15 and 20)

One JSON document a `DATA_OFFICER` generates for a named request, with a mandatory reason, as a
`POST` (it materialises a full copy for handover, a larger disclosure than viewing a profile, and
« generated » is a verb). Generate it **before** an erasure: erasure detaches roster entries, and
afterwards nothing links them back to the person.

**Art. 15(4)**, the right of access must not adversely affect others, is the whole design problem.
Three omissions, each named in the bundle's French `notice` block so they read as decisions:

1. a vote's **nominee** (peer voting is anonymous; it is a statement about another player);
2. the **acting admin's identity** on rows about something done to the subject;
3. a push subscription's **endpoint and keys** (a live capability to push to that browser).

Everything else the schema knows about the person is included, because an incomplete DSAR answer is
a compliance failure. Delivery is a `fetch` through `apiClient` into a `Blob`: a plain link can't
carry the `X-Platform-Token` header.

## The back-office

### Why it is shaped this way

It is the single highest-blast-radius surface in the product: one compromised credential exposes
every club's roster at once. Hence:

- **Two credentials on every request**: the normal session, plus a 15-minute step-up token minted
  against a TOTP code, signed with its own secret, sent in its own header (`Authorization` already
  carries the access token; a cookie would need CSRF handling). Never refreshed: a tab left open on
  a shared machine goes cold.
- **Off unless configured** (`PLATFORM_JWT_SECRET`, `PLATFORM_TOTP_ENCRYPTION_KEY`), answering 503.
- **Grants only out-of-band** (CLI), so there is no in-app TOTP enrollment screen to protect: an
  enrollment screen would be a self-service path to arming a grant.
- 403 codes tell the client what to do: `PLATFORM_STEP_UP_REQUIRED` (re-enter a code),
  `PLATFORM_ADMIN_LOCKED`; anything else is a plain 403 so a non-admin learns nothing. CIDR
  allowlists use `node:net`'s `BlockList` (IPv4 and IPv6, no dependency).
- No product chrome, lazy-loaded: browsing it like a support dashboard is the failure mode.

### Roles and redaction

- `SUPPORT` sees initials and the e-mail domain; `DATA_OFFICER` sees names and addresses. Redaction
  happens **once, on the server** (`redaction.ts`), because a field hidden by the client is still in
  the network tab. A spec asserts no `SUPPORT` body contains a fixture's name or e-mail local part.
- Field by field: birth date becomes `isMinor` for `SUPPORT`; licence and national id are
  `DATA_OFFICER` only; club, team, location and opponent names are organisations and visible to
  both; scoresheet `parsedData` holds handwritten names and is `DATA_OFFICER` only; the
  server-composed `failureReason` is visible to both.
- **Search is a read.** `DATA_OFFICER` gets substring search; `SUPPORT` gets an exact e-mail only
  (someone on the phone gives their address), because a substring search lets names be rebuilt one
  letter at a time from result counts. A `SUPPORT` name query returns empty, not 403. A pasted UUID
  is looked up in every table at once. Events are found by id only.
- `SUPPORT` lists are ordered by date, not name, so the order can't rebuild what initials hide.

### Support actions

- **Named routes, never a field editor**: clubs own their data. Each takes a 10–500 character
  reason and writes one `ADMIN_SUPPORT_ACTION` row **in the same transaction**, so a refused or
  failed action leaves no trace. Disclosures (PII view, export, impersonation) get their own audit
  types so a DPO can filter « who looked at this person »; writes are one family with
  `metadata.action`, so adding an action needs no migration.
- Domain rules are reused through shared write helpers (`server/src/clubs/club-writes.ts`), not
  re-implemented, so a support fix can't produce a state the product refuses. Side effects that
  can't roll back (an e-mail) run after the commit.
- Staff adding a `TeamAdmin` skip `EmailVerifiedGuard` (they checked the person out of band);
  removing the last `TeamAdmin` is allowed (staff are the fallback); demoting or removing the last
  club `ADMIN` is refused under `SELECT … FOR UPDATE`.
- A staff consent record is `PLATFORM_STAFF`, attested « <admin> (Kluvo) — <given by>, <method> »,
  never passed off as the club's own attestation.
- Staff can create a club with an **existing** account as first admin, never create a person.

### Stats

- Weekly series are ISO weeks in Europe/Paris for every range. A CTC team counts in each of its
  clubs, so per-club figures intentionally don't sum to the global ones.
- No weekly « active users » series: `lastActiveAt` is overwritten and `AuditLog` doesn't record
  refreshes, so a user who stays logged in would never count. That needs an activity table.
- The RSVP response rate uses the current roster (no roster history), and says so.
- A ratio with a zero denominator is null and renders `—`; every « (link) » tile opens the
  filtered list behind its number. The brand teal fails the dataviz chroma floor as a categorical
  colour, so matches and trainings are two charts rather than one two-colour chart.
- Not built: arbitrary field edits, security stats, a geographic breakdown (`Club` has no city),
  search indexes (`ILIKE` is fine until roughly 50k users).

## Read-only impersonation: threat model

`DATA_OFFICER` only, with a reason, 15 minutes, never refreshed, one live session per admin, any
subject except oneself and staff accounts.

| #   | Threat                                                  | Mitigation                                                                                                                             |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | a write slips through an unannotated route              | read-only is enforced **in the passport strategy** every authenticated route runs; there is no per-route opt-in to forget              |
| T2  | a `GET` handler changes the subject's data              | CLAUDE.md rule « a GET never writes user-owned state »; `LastActiveInterceptor` skips (staff viewing must not reset the erasure clock) |
| T3  | escalation into the back-office                         | `PlatformAdminGuard` refuses any impersonated request first; staff can't be subjects                                                   |
| T4  | step-up and impersonation tokens confused (same secret) | the `scope` claim separates them, each accepted by exactly one strategy, `HS256` pinned, crossings tested                              |
| T5  | leaked token                                            | ≤ 15 min, read-only, bound to a live session row re-checked per request, memory only (never URL, cookie or storage)                    |
| T6  | session outlives the admin's authority                  | the per-request check joins the actor's grant, lock and allowed CIDRs                                                                  |
| T7  | insider browsing without cause                          | reason required, start and end audited with the subject, findable through `?userId=` on the audit log                                  |
| T8  | the admin's own session corrupted                       | client never refreshes in this mode, refuses every non-`GET` locally (logout included), never touches persona storage                  |
| T9  | two identities mixed on screen                          | query cache cleared on enter and exit; a permanent banner names the subject                                                            |
| T10 | staff learn the subject's secret vote                   | `myVote` masked (`myVoteHidden`)                                                                                                       |
| T11 | leaked `PLATFORM_JWT_SECRET`                            | a forged token still needs a matching live session row; rotating the secret ends every session                                         |

Out of model: an attacker with database write access.

Choices worth knowing: the check lives in the strategy because global guards run before
`request.user` exists; a refused write is 403 `IMPERSONATION_READ_ONLY`, not 401, so the client
doesn't treat it as expiry; controls stay visible (the admin must see the screen as it is); a
reload ends the session (memory only). Resolved with the product owner: no per-session notice to
the subject (the privacy notice covers it; revisit if sessions appear without a support request),
no per-read audit rows (the session is the disclosure), no second approver for minors in v1.
