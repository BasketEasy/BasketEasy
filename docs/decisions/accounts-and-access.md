# Accounts and access

Rules live in `CLAUDE.md` (« Auth module », « Teams module », « Account security »). This is the
reasoning behind them.

## Tokens

- **No `clubId` in the JWT.** A user belongs to several clubs (CTC is a P1 differentiator), so club
  context is per request, never per session. The access token carries `{ sub, email }` only;
  `ClubRolesGuard` checks `ClubMembership` against the route's `:clubId`. Switching club never
  needs a new login.
- **Refresh tokens are opaque random strings, stored as SHA-256.** They are high-entropy, not
  passwords, so argon2 would add cost for nothing. Every refresh rotates within a `familyId`;
  presenting an already-revoked token is a theft signal and revokes the whole family. A normal
  logout revokes one row, not the family.
- **Login answers one generic 401** whether the e-mail or the password was wrong: no enumeration.
- **Client side, one refresh at a time.** `ApiClient` dedupes concurrent 401s onto one shared
  refresh promise, retries the original request once, and on a failed refresh rejects with the
  **original** 401 (the caller asked for that resource) and notifies the session-expiry listeners.
  Logout clears local state even when the network call fails: the user's intent is local.

## Account security

- E-mail verification and password reset are **two token tables**, not one with a `purpose`
  column: TTLs differ (24 h vs 1 h), only a reset revokes sessions, and the type system then
  enforces « consume a token for purpose X ». `consumedAt` instead of a delete lets the page tell a
  reused link from an expired one.
- A reset revokes every session and **does not log the visitor in**: the usual reason to reset is
  that someone else has the old password, and the success screen says sessions were closed.
- Both reset endpoints answer 204 whatever the address, and so does the copy (« Si un compte Kluvo
  existe pour cette adresse… »).
- **`EmailVerifiedGuard` gates only what hands out authority over other people's data** (create a
  club, add a club member, grant a `TeamAdmin`). The most likely unverified user is an invited
  player who mistyped their address; locking them out of their own team is worse than the risk.

## Roles

- **`TeamMemberRole` (`COACH | PLAYER`) is a label, not a permission.** Manager rights come only
  from club `ADMIN` or a `TeamAdmin` row.
- **`TeamAdmin` exists so a coach can run one team without club-wide `ADMIN`.** It never reaches
  CTC governance (delete the team, link or unlink partner clubs): those stay with the owner club's
  admins, because a team-level grant must not decide which clubs a team belongs to.
- A `TeamAdmin` must already be a member of one of the team's linked clubs: a team manager is
  never a stranger to every club running the team.
- `GET .../teams/:teamId/admins` is readable by `MEMBER` too. Restricting it was rejected: a
  `TeamAdmin` who is not a club admin has no local signal (JWT, account) telling the client they
  may fetch it. Known cost: the payload carries the admins' e-mails, which is why
  `@AllowGuardians()` does **not** open this route to parents.
- Only self-removal of the last `TeamAdmin` is blocked: a club `ADMIN` is always a fallback
  authority for a team, so a team with zero `TeamAdmin`s is a valid state.

## Lists

Offset pagination (`PaginatedResult`, default 25, max 100), not cursors: a club has hundreds of
rows, not millions, and « page 3 of 12 » is the expected admin UX. Server-side clamp behind the
DTO's own `@Max`. Pickers (member/player selects) fetch one capped page; a typeahead is the known
follow-up for clubs past 100 unlinked members.
