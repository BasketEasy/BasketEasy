# Frontend auth wiring — login/register/logout

Status: approved
Date: 2026-08-07

## Why

The backend Auth module (register/login/refresh/logout/me, JWT access tokens +
rotating httpOnly-cookie refresh tokens) landed in
[PR #19](https://github.com/BasketEasy/BasketEasy/pull/19). The frontend has no way to
call it yet — `apiClient` only supports unauthenticated `GET`, and there is no session
state anywhere in the app. This wires the frontend up to the existing backend, following
the decisions already recorded in
[`docs/frontend-stack.md`](../../frontend-stack.md): `ApiClient` owns auth-header
injection and 401/refresh handling, `react-hook-form` + `zod` for forms, a React Context
for auth/session state.

## Scope

- `ApiClient`: `POST` support, in-memory access token, automatic 401 → refresh → retry.
- `AuthContext`/`useAuth()`: login, register, logout, current user, mount-time silent
  session restore via the refresh cookie.
- `LoginForm` / `RegisterForm` components using the existing `@basketeasy/ui` kit.
- `App.tsx` wired to toggle between the forms (logged out) and a logged-in view.
- MSW handlers + tests for all of the above.

**Explicitly out of scope:** routing (`react-router-dom`) and a protected-route
component — no router exists in this app yet, and introducing one is a separate
decision. Password reset / email verification (not built on the backend either).
Multi-club switcher UI (no `Club` UI exists yet; the backend's `AuthUser.memberships`
field is available but unused by this feature beyond being present in the type).

## `ApiClient` changes (`app/src/api/client.ts`)

Current client only has `get<T>(path)`. This adds:

```typescript
let accessToken: string | null = null;
const sessionExpiryListeners = new Set<() => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function subscribeToSessionExpiry(listener: () => void): () => void {
  sessionExpiryListeners.add(listener);
  return () => sessionExpiryListeners.delete(listener);
}
```

`request()` attaches `Authorization: Bearer ${accessToken}` when `accessToken` is set,
and uses `credentials: 'same-origin'` explicitly (the app and API are same-origin via
the Vite proxy / nginx image, so the refresh cookie round-trips without extra config —
this is just making that assumption explicit rather than relying on the fetch spec's
default).

On a `401` response from any request *other than* the refresh call itself:
1. If a refresh is already in flight, await its shared promise instead of starting a
   second one (dedupes concurrent 401s from multiple simultaneous requests).
2. Otherwise call `POST /auth/refresh`. On success, call `setAccessToken` with the new
   token and retry the original request once.
3. On refresh failure, call `setAccessToken(null)`, notify every
   `subscribeToSessionExpiry` listener, and reject with the *original* 401 `ApiError`
   (not the refresh call's error — the caller asked for the original resource).

`apiClient.post<T>(path, body)` is added alongside the existing `get`.

## `AuthContext` (`app/src/auth/AuthContext.tsx`, new)

```typescript
interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}
```

- `AuthProvider` wraps `App` in `main.tsx`, inside `QueryClientProvider`.
- On mount: calls `apiClient.post<RefreshResponse>('/auth/refresh')`. On success, calls
  `setAccessToken` then `apiClient.get<AuthUser>('/auth/me')` to populate `user`. On
  failure (expected for a first-time visitor — no refresh cookie yet), leaves `user`
  as `null` with no error surfaced. Either way, `isLoading` becomes `false` once
  settled.
- Subscribes to `subscribeToSessionExpiry` on mount (unsubscribes on unmount) — sets
  `user` back to `null` when the `ApiClient` reports a failed refresh from a 401
  elsewhere in the app (e.g. a stale tab where the refresh token was already rotated
  away by another tab).
- `login(email, password)`: `POST /auth/login` → response is already
  `{accessToken, user}` (no extra round-trip needed) → `setAccessToken` +
  `setUser(response.user)`.
- `register(email, password)`: same shape, `POST /auth/register`.
- `logout()`: `POST /auth/logout` (best-effort — proceeds to clear local state even if
  the network call fails, since the user's intent is to be logged out locally
  regardless) → `setAccessToken(null)` + `setUser(null)`.
- `useAuth()` hook throws if called outside `AuthProvider` (matches the existing
  codebase's lack of a "safe" pattern elsewhere — fail loud on a programming error).

## Shared types (`packages/@basketeasy/types/auth.ts`, extend)

```typescript
export interface RefreshResponse {
  accessToken: string;
}
```

(`AccessTokenResponse` already covers register/login's `{accessToken, user}` shape —
this is the missing type for the refresh endpoint's `{accessToken}`-only response,
flagged as a gap in the backend PR's final review.)

## Forms (`app/src/auth/LoginForm.tsx`, `RegisterForm.tsx`, new)

Both use `react-hook-form` + `@hookform/resolvers/zod` + a local `zod` schema:

```typescript
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
```

(Mirrors the backend's `LoginDto`/`RegisterDto` validation exactly — login has no
minimum length since the backend doesn't enforce one there either, only that it's a
non-empty string.)

Layout: `Card` > `CardHeader` (`CardTitle`) > form with `Label` + `Input` pairs +
submit `Button`, using the existing UI kit — no new styling primitives. Field-level
validation errors render under each input. A submit-level error (409 on register, 401
on login) renders as an `Alert variant="destructive"` above the fields, using the
backend's own message text (`"Email already in use"` / `"Invalid credentials"`) — the
backend already avoids leaking which case failed, so the frontend doesn't need to
re-derive wording.

Both forms call `useAuth().login`/`.register` on submit; the submit button shows a
pending state (`isSubmitting` from `react-hook-form`) and is disabled while in flight.

## `App.tsx` integration

```
logged out: <LoginForm /> with a "Créer un compte" toggle link → <RegisterForm />
            (and vice versa: "J'ai déjà un compte" back to LoginForm)
logged in:  user.email + a "Se déconnecter" button
```

The toggle between login/register is local `useState` in `App.tsx` (no routing).
`HealthStatus` and the brand header (`<h1>BasketEasy</h1>` / tagline) stay exactly
where they are, above the auth block. `isLoading` from `useAuth()` shows nothing (or a
minimal placeholder) instead of flashing the login form during the mount-time silent
refresh.

Copy is French-first per the repo convention (e.g. "Se connecter", "Créer un compte",
"Se déconnecter", "Adresse e-mail", "Mot de passe").

## Testing

- `app/src/mocks/handlers.ts`: add MSW handlers for all five `/api/auth/*` endpoints
  (configurable per-test via `server.use(...)` for error cases, following the existing
  `App.test.tsx` pattern for `/api/health`).
- `AuthContext` tests: login success sets user + token; login failure (401) surfaces
  the error and leaves `user` null; register success/failure (409) same shape; logout
  clears state even when the network call fails; mount-time refresh success populates
  `user` from `/auth/me`; mount-time refresh failure leaves `user` null with no thrown
  error.
- `apiClient` tests: a 401 on a request triggers exactly one `/auth/refresh` call and
  retries the original request on success; two concurrent 401s trigger only one
  `/auth/refresh` call (dedup); a failed refresh clears the token, notifies
  `subscribeToSessionExpiry` listeners, and the original request still rejects with
  its original 401.
- `LoginForm`/`RegisterForm` tests: invalid email / short password shows a field
  error and does not call `login`/`register`; valid submission calls
  `login`/`register` with the form values; a 409/401 response renders the `Alert`.
- `App.test.tsx` (extend): logged-out renders `LoginForm`; toggle link switches to
  `RegisterForm` and back; a successful login (mocked) replaces the forms with the
  user's email and a logout button; clicking logout returns to the login form.

## Out of scope (explicit cuts)

`react-router-dom` and any protected-route component, password reset / email
verification (not on the backend), multi-club switcher UI, "remember me" /
persisted-login-state beyond the refresh cookie itself, i18n library wiring (copy is
hardcoded French strings, matching the rest of the current scaffold — no i18n library
is wired in anywhere yet per `CLAUDE.md`).
