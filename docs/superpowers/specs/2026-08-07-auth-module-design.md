# Auth module — login / JWT / guards

Status: approved
Date: 2026-08-07

## Why

Nearly every domain entity (clubs, teams, players, scheduling, payments) is scoped to a
user's club membership. Auth — including the minimal club/membership schema needed to
scope future modules — is feature #1, not optional-first.

Stack decisions already locked in [`docs/backend-stack.md`](../../backend-stack.md#auth):
JWT (access + refresh), NestJS Guards + class-validator DTOs, argon2 for password hashing.

## Data model (Prisma)

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  memberships   ClubMembership[]
  refreshTokens RefreshToken[]
}

model Club {
  id          String   @id @default(uuid())
  name        String
  createdAt   DateTime @default(now())
  memberships ClubMembership[]
}

enum ClubRole {
  ADMIN
  MEMBER
}

model ClubMembership {
  id        String   @id @default(uuid())
  userId    String
  clubId    String
  role      ClubRole
  createdAt DateTime @default(now())
  user      User @relation(fields: [userId], references: [id])
  club      Club @relation(fields: [clubId], references: [id])

  @@unique([userId, clubId])
}

model RefreshToken {
  id         String    @id @default(uuid())
  userId     String
  familyId   String
  tokenHash  String    @unique
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())
  user       User @relation(fields: [userId], references: [id])
}
```

`Club` and `ClubMembership` are intentionally bare — no Club CRUD/invite endpoints ship in
this feature. They exist only so JWT-authenticated requests can be checked against a role
in a specific club, and so future modules (Clubs, Teams, Scheduling…) have something to
attach to instead of retrofitting club-scoping later.

`RefreshToken.familyId` groups every token descended from one login (rotation chain) —
see "Refresh token strategy" below.

**Existing `Player` model is untouched by this feature** — it has no `userId`/`clubId` yet;
wiring it up is out of scope here and belongs to the Teams/Players module.

## Why no clubId in the JWT

A user can belong to multiple clubs (CTC / multi-club support is a P1 differentiator per
[`docs/feature-set.md`](../../feature-set.md)). Club context is per-request, not
per-session, so the access token payload is only `{sub: userId, email}`. Club-scoped
authorization is done per-request by `ClubRolesGuard` checking `ClubMembership` against a
`:clubId` route param — this also means a user doesn't need to re-login when switching
clubs in the frontend's club switcher.

## Refresh token strategy

Industry-standard OAuth2 refresh token rotation with reuse detection (used by Auth0,
Google, Okta):

- The refresh token itself is an opaque random string, not a JWT. Only its SHA-256 hash is
  stored server-side (`RefreshToken.tokenHash`) — SHA-256 because it's already
  high-entropy random data, not a password; argon2/bcrypt would add cost with no security
  benefit here.
- Every refresh **rotates**: the presented token's row is marked `revokedAt`, a new token
  is issued in the same `familyId`.
- **Reuse detection:** if a token whose row is already `revokedAt` is presented again,
  that's a theft signal (both a legitimate client and an attacker had a copy). The server
  revokes every row sharing that `familyId`, forcing full re-login on all descendants of
  that login chain — not just rejecting the single reused token.
- A fresh login creates a new `familyId`.

Access token: 15 min expiry, signed with `JWT_ACCESS_SECRET`.
Refresh token: 30 day expiry, signed/random value delivered as an `httpOnly`, `Secure`,
`SameSite=Strict` cookie (`JWT_REFRESH_SECRET` used only to add an HMAC layer if needed —
otherwise a `crypto.randomBytes` opaque token is sufficient since it's DB-verified, not
self-verified like a JWT).

## Endpoints (`server/src/auth/`)

| Route | Auth | Behavior |
|---|---|---|
| `POST /api/auth/register` | none | `{email, password}` → argon2-hash password, create `User`, issue tokens (new `familyId`), set refresh cookie. `409` on duplicate email. |
| `POST /api/auth/login` | none | Validate credentials → issue tokens (new `familyId`), set refresh cookie. `401` with an identical generic message whether email or password was wrong (no user-enumeration signal). |
| `POST /api/auth/refresh` | refresh cookie | Look up `tokenHash` → if valid and unexpired, rotate (revoke old row, issue new access + refresh in same family, set new cookie). If the row is already revoked, revoke the whole family and return `401` + clear cookie. |
| `POST /api/auth/logout` | refresh cookie | Revoke the presented token's row, clear cookie. (Does not revoke the whole family — a normal logout, not a theft response.) |
| `GET /api/auth/me` | `JwtAuthGuard` | Returns `{id, email, memberships: [{clubId, role}]}`. |

## Guards & strategy

- `JwtStrategy` (passport-jwt) — extracts the Bearer access token from the `Authorization`
  header, verifies signature/expiry, attaches `req.user = {id, email}`.
- `JwtAuthGuard` — thin wrapper around `AuthGuard('jwt')`, used on any authenticated route.
- `ClubRolesGuard` + `@ClubRoles(ClubRole.ADMIN)` decorator — reads `:clubId` from route
  params, loads the caller's `ClubMembership` for that club, checks its role against the
  roles required by the decorator. No business endpoint in this feature uses it yet (no
  Club module exists), so it's exercised via unit tests and exported for future domain
  modules to consume with `@UseGuards(JwtAuthGuard, ClubRolesGuard)`.

## Shared types

`packages/@basketeasy/types/auth.ts`: `RegisterDto`, `LoginDto`, `AuthUserDto` (id, email,
memberships), `AccessTokenResponseDto`. Mirrored by NestJS class-validator DTOs in
`server/src/auth/dto/`, per the repo's "types first, then DTO, then frontend caller"
convention.

## Error handling

- Duplicate email on register → `409 ConflictException`
- Bad credentials on login → `401 UnauthorizedException`, generic message
- Missing/expired/invalid access token → `401` via `JwtAuthGuard`
- Expired, revoked, or reused refresh token → `401`, cookie cleared
- Payload validation (email format, password min length 8) via class-validator DTOs +
  the global `ValidationPipe`

## Testing

- Unit (`server/src/auth/*.spec.ts`): `AuthService` (register, login, refresh rotation,
  reuse-triggers-family-revocation, logout), `JwtStrategy.validate`, `ClubRolesGuard`
  (allow/deny per role, missing membership).
- e2e (`server/test/`): register → login → `GET /auth/me` → refresh → logout → refresh
  fails with cookie cleared; a second scenario replays a revoked refresh token and asserts
  the whole family (a second, still-valid token from the same login) is also rejected.

## Out of scope (explicit cuts)

Email verification, password reset (both need Brevo, not yet wired up), rate limiting on
login, Club CRUD/invite endpoints, richer role taxonomy (coach/président/trésorier — P2
Volunteer/Role module), linking the existing `Player` model to `User`/`Club`.
