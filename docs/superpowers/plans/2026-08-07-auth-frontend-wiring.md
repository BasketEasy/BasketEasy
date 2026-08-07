# Frontend auth wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the React frontend up to the backend Auth module (PR #19): `ApiClient` gets auth-header injection + automatic 401-refresh-retry, a new `AuthContext` owns login/register/logout/session-restore, two `react-hook-form` + `zod` forms, and `App.tsx` toggles between them and a logged-in view.

**Architecture:** `apiClient` (existing singleton, extended) is the only thing that talks to `fetch` and owns the in-memory access token + 401 handling. `AuthContext` sits above it as the React-facing session API, calling `apiClient` and holding `user`/`isLoading` state. Forms are dumb — they call `useAuth()` and render its errors. No routing; `App.tsx` toggles views with local `useState`.

**Tech Stack:** React 18, `react-hook-form`, `zod`, `@hookform/resolvers/zod` (all new to `app/`), MSW for test mocking (already present), Vitest + React Testing Library (already present), `@basketeasy/ui` components (already present: `Card`, `Input`, `Label`, `Button`, `Alert`).

**Spec:** [`docs/superpowers/specs/2026-08-07-auth-frontend-wiring-design.md`](../specs/2026-08-07-auth-frontend-wiring-design.md)

## Global Constraints

- TypeScript strict mode, matches `app/tsconfig.json` (`strict: true`, `noUnusedLocals`, `noUnusedParameters`).
- Prettier formatting — run `pnpm format` if unsure before committing.
- ESLint per `app/.eslintrc.cjs` (`react-hooks/recommended`, `react-refresh/only-export-components` as a warning — a file exporting both a component and a non-component value, like `AuthContext.tsx` exporting `AuthProvider` + `useAuth`, will warn but not fail lint; that's expected and pre-existing behavior in this config, not a defect to fix).
- Vitest + React Testing Library, colocated `*.test.tsx` — per root `CLAUDE.md`.
- **MSW is global and strict**: `app/src/setupTests.ts` calls `server.listen({ onUnhandledRequest: 'error' })`. Any test whose component tree mounts `AuthProvider` will trigger a `POST /api/auth/refresh` call on mount — every such test needs that request handled (either by the default handler added in Task 4, or a `server.use()` override), or the test fails with an MSW "unhandled request" error, not a normal assertion failure.
- Shared shapes go in `packages/@basketeasy/types` first, mirrored by (in this case, consumed directly by) the frontend — per root `CLAUDE.md`.
- Copy is French-first (`"Se connecter"`, `"Créer un compte"`, `"Se déconnecter"`, `"Adresse e-mail"`, `"Mot de passe"`) — per root `CLAUDE.md`'s locale convention.
- No `react-router-dom`, no protected-route component, no password reset/email verification, no multi-club switcher UI — explicitly out of scope per the spec.
- The app and API are same-origin (Vite dev proxy / nginx image) — `fetch` calls use `credentials: 'same-origin'` explicitly; no CORS config changes needed.

---

## File Structure

```
packages/@basketeasy/types/
  auth.ts                          # modify — add RefreshResponse

app/src/
  api/
    client.ts                      # modify — post(), access token, 401 refresh-retry
    client.test.ts                 # new
  auth/
    AuthContext.tsx                # new — AuthProvider, useAuth()
    AuthContext.test.tsx           # new
    LoginForm.tsx                  # new
    LoginForm.test.tsx             # new
    RegisterForm.tsx               # new
    RegisterForm.test.tsx          # new
  mocks/
    handlers.ts                    # modify — add /api/auth/* handlers
  main.tsx                         # modify — wrap App in AuthProvider
  App.tsx                          # modify — toggle forms / logged-in view
  App.test.tsx                     # modify — extend for the toggle
```

---

## Task 1: Add frontend dependencies

**Files:**
- Modify: `app/package.json`

**Interfaces:**
- Produces: `react-hook-form`, `zod`, `@hookform/resolvers` importable in later tasks (`useForm` from `react-hook-form`, `z` from `zod`, `zodResolver` from `@hookform/resolvers/zod`).

- [ ] **Step 1: Add dependencies**

Run from repo root:

```bash
pnpm --filter @basketeasy/app add react-hook-form zod @hookform/resolvers
```

- [ ] **Step 2: Verify install**

Run: `pnpm --filter @basketeasy/app exec node -e "require('zod'); require('react-hook-form'); console.log('ok')"`
Expected: prints `ok` with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/package.json pnpm-lock.yaml
git commit -m "chore(app): add react-hook-form, zod, @hookform/resolvers"
```

---

## Task 2: Shared `RefreshResponse` type

**Files:**
- Modify: `packages/@basketeasy/types/auth.ts`

**Interfaces:**
- Produces: `interface RefreshResponse { accessToken: string; }`
- Consumed by: `app/src/api/client.ts` (Task 3).

- [ ] **Step 1: Add the interface**

Append to `packages/@basketeasy/types/auth.ts` (after the existing `AccessTokenResponse` interface):

```typescript
export interface RefreshResponse {
  accessToken: string;
}
```

- [ ] **Step 2: Verify the package still builds**

Run: `pnpm --filter @basketeasy/types build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/@basketeasy/types/auth.ts
git commit -m "feat(types): add RefreshResponse for the /auth/refresh endpoint"
```

---

## Task 3: `ApiClient` — auth header, POST, 401 refresh-retry

**Files:**
- Modify: `app/src/api/client.ts`
- Create: `app/src/api/client.test.ts`

**Interfaces:**
- Consumes: `RefreshResponse` from `@basketeasy/types/auth` (Task 2).
- Produces:
  - `export function setAccessToken(token: string | null): void`
  - `export function subscribeToSessionExpiry(listener: () => void): () => void` (returns an unsubscribe function)
  - `apiClient.get<T>(path: string): Promise<T>` (existing, unchanged signature)
  - `apiClient.post<T>(path: string, body?: unknown): Promise<T>` (new)
  - `ApiError` (existing, unchanged)
- Consumed by: `AuthContext` (Task 5).

This is the current content of `app/src/api/client.ts` before this task (for reference — you'll be replacing the whole file):

```typescript
// Minimal API client wrapper, per docs/frontend-stack.md: a single place to
// hold the base URL and, later, auth header injection / 401-refresh / error
// normalization. Everything else (TanStack Query, etc.) will call through
// this instead of using bare fetch directly.

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!res.ok) {
    throw new ApiError(`Request to ${path} failed with status ${res.status}`, res.status);
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
};
```

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/api/client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { apiClient, ApiError, setAccessToken, subscribeToSessionExpiry } from './client';

describe('apiClient', () => {
  afterEach(() => {
    setAccessToken(null);
  });

  it('attaches the Authorization header when an access token is set', async () => {
    let receivedAuth: string | null = null;
    server.use(
      http.get('/api/whoami', ({ request }) => {
        receivedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ ok: true });
      }),
    );

    setAccessToken('token-123');
    await apiClient.get('/whoami');

    expect(receivedAuth).toBe('Bearer token-123');
  });

  it('does not attach an Authorization header when no token is set', async () => {
    let receivedAuth: string | null | undefined = undefined;
    server.use(
      http.get('/api/whoami', ({ request }) => {
        receivedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ ok: true });
      }),
    );

    await apiClient.get('/whoami');

    expect(receivedAuth).toBeNull();
  });

  it('post() sends a JSON body and returns the parsed response', async () => {
    let receivedBody: unknown;
    server.use(
      http.post('/api/echo', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ received: true });
      }),
    );

    const result = await apiClient.post<{ received: boolean }>('/echo', { foo: 'bar' });

    expect(receivedBody).toEqual({ foo: 'bar' });
    expect(result).toEqual({ received: true });
  });

  it('on a 401, refreshes once and retries the original request', async () => {
    let whoamiCallCount = 0;
    server.use(
      http.get('/api/whoami', () => {
        whoamiCallCount += 1;
        if (whoamiCallCount === 1) {
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'new-token' })),
    );

    const result = await apiClient.get<{ ok: boolean }>('/whoami');

    expect(result).toEqual({ ok: true });
    expect(whoamiCallCount).toBe(2);
  });

  it('dedupes concurrent 401s into a single refresh call', async () => {
    let refreshCallCount = 0;
    let whoamiCallCount = 0;
    server.use(
      http.get('/api/whoami', () => {
        whoamiCallCount += 1;
        if (whoamiCallCount <= 2) {
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/auth/refresh', () => {
        refreshCallCount += 1;
        return HttpResponse.json({ accessToken: 'new-token' });
      }),
    );

    await Promise.all([apiClient.get('/whoami'), apiClient.get('/whoami')]);

    expect(refreshCallCount).toBe(1);
  });

  it('on a failed refresh, clears the token, notifies subscribers, and rejects with the original 401', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSessionExpiry(listener);

    server.use(
      http.get('/api/whoami', () => HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })),
      http.post('/api/auth/refresh', () => HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })),
    );

    setAccessToken('stale-token');
    let caught: unknown;
    try {
      await apiClient.get('/whoami');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(401);
    expect(listener).toHaveBeenCalledTimes(1);

    let receivedAuth: string | null | undefined;
    server.use(
      http.get('/api/whoami2', ({ request }) => {
        receivedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ ok: true });
      }),
    );
    await apiClient.get('/whoami2');
    expect(receivedAuth).toBeNull();

    unsubscribe();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/app test -- client.test.ts`
Expected: FAIL — `setAccessToken`/`subscribeToSessionExpiry`/`apiClient.post` are not exported yet.

- [ ] **Step 3: Rewrite `app/src/api/client.ts`**

```typescript
// Minimal API client wrapper, per docs/frontend-stack.md: a single place to
// hold the base URL, auth header injection, and 401/refresh handling.
// Everything else (TanStack Query, etc.) calls through this instead of
// using bare fetch directly.

import type { RefreshResponse } from '@basketeasy/types/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
const sessionExpiryListeners = new Set<() => void>();
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function subscribeToSessionExpiry(listener: () => void): () => void {
  sessionExpiryListeners.add(listener);
  return () => sessionExpiryListeners.delete(listener);
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

async function rawRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'same-origin',
    headers: buildHeaders(),
    ...init,
  });

  if (!res.ok) {
    throw new ApiError(`Request to ${path} failed with status ${res.status}`, res.status);
  }

  return res.json() as Promise<T>;
}

function attemptRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = rawRequest<RefreshResponse>('/auth/refresh', { method: 'POST' })
      .then((response) => {
        setAccessToken(response.accessToken);
        return true;
      })
      .catch(() => {
        setAccessToken(null);
        return false;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await rawRequest<T>(path, init);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && path !== '/auth/refresh') {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        return rawRequest<T>(path, init);
      }
      sessionExpiryListeners.forEach((listener) => listener());
    }
    throw err;
  }
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test -- client.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Run the full app test suite to check for regressions**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS — `App.test.tsx` and `HealthStatus`-related tests still pass unchanged (they don't touch auth, and `App.tsx` doesn't mount `AuthProvider` yet — that's Task 8).

- [ ] **Step 6: Commit**

```bash
git add app/src/api/client.ts app/src/api/client.test.ts
git commit -m "feat(app): ApiClient auth header injection, POST, 401 refresh-retry"
```

---

## Task 4: MSW handlers for `/api/auth/*`

**Files:**
- Modify: `app/src/mocks/handlers.ts`

**Interfaces:**
- Produces: default (happy-path-agnostic) handlers for all five auth endpoints, overridable per test via `server.use(...)`.
- Consumed by: `AuthContext.test.tsx` (Task 5), `LoginForm.test.tsx` (Task 6), `RegisterForm.test.tsx` (Task 7), `App.test.tsx` (Task 9), and implicitly by every test that mounts `AuthProvider` once Task 8 wires it into `main.tsx` (though `App.test.tsx` renders `<App />` directly wrapped in its own providers, not through `main.tsx` — see Task 9's existing `renderApp()` helper).

This is the current content of `app/src/mocks/handlers.ts`:

```typescript
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/health', () =>
    HttpResponse.json({
      status: 'ok',
      info: { database: { status: 'up' } },
      details: { database: { status: 'up' } },
    }),
  ),
];
```

- [ ] **Step 1: Add default auth handlers**

Replace the file with:

```typescript
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/health', () =>
    HttpResponse.json({
      status: 'ok',
      info: { database: { status: 'up' } },
      details: { database: { status: 'up' } },
    }),
  ),

  // Default: no session (no refresh cookie) — matches a fresh visitor.
  // Individual tests override this with server.use(...) to simulate a
  // restorable session.
  http.post('/api/auth/refresh', () =>
    HttpResponse.json({ message: 'Missing refresh token' }, { status: 401 }),
  ),

  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 200 })),
];
```

Note: no default handlers for `POST /api/auth/register`, `POST /api/auth/login`, or `GET /api/auth/me` — those have no sensible "default" response (every test that exercises them needs to control the exact response), so each test adds its own via `server.use(...)`. `refresh` and `logout` DO get defaults because `AuthProvider`'s mount effect (Task 5) always calls `/auth/refresh`, and it would be repetitive for every single test file to override it just to express "not logged in yet" — that's the common case.

- [ ] **Step 2: Verify the existing test suite still passes**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS — this only adds handlers, doesn't change any existing behavior.

- [ ] **Step 3: Commit**

```bash
git add app/src/mocks/handlers.ts
git commit -m "test(app): add default MSW handlers for /api/auth/*"
```

---

## Task 5: `AuthContext`

**Files:**
- Create: `app/src/auth/AuthContext.tsx`
- Create: `app/src/auth/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `apiClient`, `setAccessToken`, `subscribeToSessionExpiry` from `../api/client` (Task 3); `AuthUser`, `AccessTokenResponse`, `RefreshResponse` from `@basketeasy/types/auth`.
- Produces:
  - `export function AuthProvider({ children }: { children: ReactNode }): JSX.Element`
  - `export function useAuth(): { user: AuthUser | null; isLoading: boolean; login(email: string, password: string): Promise<void>; register(email: string, password: string): Promise<void>; logout(): Promise<void>; }` — throws an `Error` if called outside `AuthProvider`.
- Consumed by: `LoginForm`/`RegisterForm` (Tasks 6-7), `main.tsx` (Task 8), `App.tsx` (Task 9).

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/auth/AuthContext.test.tsx
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { AuthProvider, useAuth } from './AuthContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow();
  });

  it('starts with isLoading true, then settles to a logged-out state when there is no session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('restores a session on mount when the refresh cookie is valid', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships: [] }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual({ id: 'user-1', email: 'a@b.com', memberships: [] });
  });

  it('login sets the user on success', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'a@b.com', memberships: [] },
        }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login('a@b.com', 'password123');
    });

    expect(result.current.user).toEqual({ id: 'user-1', email: 'a@b.com', memberships: [] });
  });

  it('login throws and leaves the user null on failure', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('a@b.com', 'wrong');
      }),
    ).rejects.toThrow();

    expect(result.current.user).toBeNull();
  });

  it('register sets the user on success', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'new@b.com', memberships: [] },
        }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.register('new@b.com', 'password123');
    });

    expect(result.current.user).toEqual({ id: 'user-1', email: 'new@b.com', memberships: [] });
  });

  it('register throws and leaves the user null on a duplicate email', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({ message: 'Email already in use' }, { status: 409 }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.register('a@b.com', 'password123');
      }),
    ).rejects.toThrow();

    expect(result.current.user).toBeNull();
  });

  it('logout clears the user even when the network call fails', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'a@b.com', memberships: [] },
        }),
      ),
      http.post('/api/auth/logout', () => HttpResponse.json({ message: 'error' }, { status: 500 })),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.login('a@b.com', 'password123');
    });
    expect(result.current.user).not.toBeNull();

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/app test -- AuthContext.test.tsx`
Expected: FAIL — `Cannot find module './AuthContext'`.

- [ ] **Step 3: Write `app/src/auth/AuthContext.tsx`**

```typescript
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { AccessTokenResponse, AuthUser, RefreshResponse } from '@basketeasy/types/auth';
import { apiClient, setAccessToken, subscribeToSessionExpiry } from '../api/client';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const refreshResponse = await apiClient.post<RefreshResponse>('/auth/refresh');
        setAccessToken(refreshResponse.accessToken);
        const me = await apiClient.get<AuthUser>('/auth/me');
        if (!cancelled) {
          setUser(me);
        }
      } catch {
        // No valid session to restore — this is the normal state for a
        // first-time visitor, not an error to surface.
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void restoreSession();

    const unsubscribe = subscribeToSessionExpiry(() => {
      if (!cancelled) {
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiClient.post<AccessTokenResponse>('/auth/login', { email, password });
    setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const response = await apiClient.post<AccessTokenResponse>('/auth/register', {
      email,
      password,
    });
    setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return value;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test -- AuthContext.test.tsx`
Expected: PASS, all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/src/auth/AuthContext.tsx app/src/auth/AuthContext.test.tsx
git commit -m "feat(app): AuthContext with login/register/logout/session-restore"
```

---

## Task 6: `LoginForm`

**Files:**
- Create: `app/src/auth/LoginForm.tsx`
- Create: `app/src/auth/LoginForm.test.tsx`

**Interfaces:**
- Consumes: `useAuth` from `./AuthContext` (Task 5); `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@basketeasy/ui/card`; `Label` from `@basketeasy/ui/label`; `Input` from `@basketeasy/ui/input`; `Button` from `@basketeasy/ui/button`; `Alert`, `AlertDescription` from `@basketeasy/ui/alert`; `useForm` from `react-hook-form`; `zodResolver` from `@hookform/resolvers/zod`; `z` from `zod`.
- Produces: `export function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }): JSX.Element`
- Consumed by: `App.tsx` (Task 9).

First, check `@basketeasy/ui/card`'s exports — `Card.tsx` exports `Card`, `CardHeader`, `CardTitle`, and (per the file you'll find there) likely `CardContent`/`CardDescription`/`CardFooter` too. Read `packages/@basketeasy/ui/src/components/Card.tsx` before writing this task's JSX so you use the exact names it exports — this brief does not enumerate them all.

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/auth/LoginForm.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { AuthProvider } from './AuthContext';
import { LoginForm } from './LoginForm';

function renderLoginForm(onSwitchToRegister = vi.fn()) {
  return render(
    <AuthProvider>
      <LoginForm onSwitchToRegister={onSwitchToRegister} />
    </AuthProvider>,
  );
}

describe('LoginForm', () => {
  it('shows a validation error and does not submit for an invalid email', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'not-an-email');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(await screen.findByText(/email/i)).toBeInTheDocument();
  });

  it('submits valid credentials and does not show an error on success', async () => {
    let loginCalled = false;
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        loginCalled = true;
        const body = (await request.json()) as { email: string; password: string };
        expect(body).toEqual({ email: 'a@b.com', password: 'password123' });
        return HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'a@b.com', memberships: [] },
        });
      }),
    );

    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'a@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(loginCalled).toBe(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a submit-level error on a 401', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 }),
      ),
    );

    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'a@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid credentials/i);
  });

  it('calls onSwitchToRegister when the toggle link is clicked', async () => {
    const onSwitchToRegister = vi.fn();
    const user = userEvent.setup();
    renderLoginForm(onSwitchToRegister);

    await user.click(screen.getByRole('button', { name: /créer un compte/i }));

    expect(onSwitchToRegister).toHaveBeenCalledTimes(1);
  });
});
```

Note: `@testing-library/user-event` is not currently a listed dependency in `app/package.json` — check `app/package.json` and `pnpm-lock.yaml` first; if it's missing, add it in this task (`pnpm --filter @basketeasy/app add -D @testing-library/user-event`) before writing the test, since every test above depends on it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/app test -- LoginForm.test.tsx`
Expected: FAIL — `Cannot find module './LoginForm'`.

- [ ] **Step 3: Write `app/src/auth/LoginForm.tsx`**

```typescript
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { Label } from '@basketeasy/ui/label';
import { Input } from '@basketeasy/ui/input';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { ApiError } from '../api/client';
import { useAuth } from './AuthContext';

const loginSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { login } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(null);
    try {
      await login(values.email, values.password);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Se connecter</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="login-email">Adresse e-mail</Label>
            <Input id="login-email" type="email" {...register('email')} />
            {errors.email && (
              <p style={{ color: 'var(--be-error, #B23A2E)', fontSize: 13 }}>
                {errors.email.message}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="login-password">Mot de passe</Label>
            <Input id="login-password" type="password" {...register('password')} />
            {errors.password && (
              <p style={{ color: 'var(--be-error, #B23A2E)', fontSize: 13 }}>
                {errors.password.message}
              </p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting}>
            Se connecter
          </Button>

          <Button type="button" variant="ghost" onClick={onSwitchToRegister}>
            Créer un compte
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

Note on the `Label htmlFor` / `Input id` pairing: this makes `getByLabelText` in the tests work correctly, since the `@basketeasy/ui` `Label` component renders a plain `<label>` and `Input` a plain `<input>` — the `htmlFor`/`id` link is what associates them for accessibility and for testing-library's query. Double-check `Label`'s props actually forward `htmlFor` (it should, since it spreads `...props` onto a native `<label>` per the component you read in earlier tasks) before assuming this works as written.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test -- LoginForm.test.tsx`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/src/auth/LoginForm.tsx app/src/auth/LoginForm.test.tsx app/package.json pnpm-lock.yaml
git commit -m "feat(app): LoginForm with react-hook-form + zod validation"
```

---

## Task 7: `RegisterForm`

**Files:**
- Create: `app/src/auth/RegisterForm.tsx`
- Create: `app/src/auth/RegisterForm.test.tsx`

**Interfaces:**
- Consumes: same as `LoginForm` (Task 6), plus `useAuth().register` instead of `.login`.
- Produces: `export function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }): JSX.Element`
- Consumed by: `App.tsx` (Task 9).

This task is structurally identical to Task 6 — same pattern, different schema (password minimum length) and different submit handler.

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/auth/RegisterForm.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { AuthProvider } from './AuthContext';
import { RegisterForm } from './RegisterForm';

function renderRegisterForm(onSwitchToLogin = vi.fn()) {
  return render(
    <AuthProvider>
      <RegisterForm onSwitchToLogin={onSwitchToLogin} />
    </AuthProvider>,
  );
}

describe('RegisterForm', () => {
  it('shows a validation error for a password under 8 characters', async () => {
    const user = userEvent.setup();
    renderRegisterForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'new@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'short');
    await user.click(screen.getByRole('button', { name: /créer un compte/i }));

    expect(await screen.findByText(/8/)).toBeInTheDocument();
  });

  it('submits valid data and does not show an error on success', async () => {
    let registerCalled = false;
    server.use(
      http.post('/api/auth/register', async ({ request }) => {
        registerCalled = true;
        const body = (await request.json()) as { email: string; password: string };
        expect(body).toEqual({ email: 'new@b.com', password: 'password123' });
        return HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'new@b.com', memberships: [] },
        });
      }),
    );

    const user = userEvent.setup();
    renderRegisterForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'new@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /créer un compte/i }));

    await waitFor(() => expect(registerCalled).toBe(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a submit-level error on a 409 (duplicate email)', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({ message: 'Email already in use' }, { status: 409 }),
      ),
    );

    const user = userEvent.setup();
    renderRegisterForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'a@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /créer un compte/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already in use/i);
  });

  it('calls onSwitchToLogin when the toggle link is clicked', async () => {
    const onSwitchToLogin = vi.fn();
    const user = userEvent.setup();
    renderRegisterForm(onSwitchToLogin);

    await user.click(screen.getByRole('button', { name: /j'ai déjà un compte/i }));

    expect(onSwitchToLogin).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/app test -- RegisterForm.test.tsx`
Expected: FAIL — `Cannot find module './RegisterForm'`.

- [ ] **Step 3: Write `app/src/auth/RegisterForm.tsx`**

```typescript
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { Label } from '@basketeasy/ui/label';
import { Input } from '@basketeasy/ui/input';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { ApiError } from '../api/client';
import { useAuth } from './AuthContext';

const registerSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { register: registerUser } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterFormValues) => {
    setSubmitError(null);
    try {
      await registerUser(values.email, values.password);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer un compte</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="register-email">Adresse e-mail</Label>
            <Input id="register-email" type="email" {...register('email')} />
            {errors.email && (
              <p style={{ color: 'var(--be-error, #B23A2E)', fontSize: 13 }}>
                {errors.email.message}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="register-password">Mot de passe</Label>
            <Input id="register-password" type="password" {...register('password')} />
            {errors.password && (
              <p style={{ color: 'var(--be-error, #B23A2E)', fontSize: 13 }}>
                {errors.password.message}
              </p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting}>
            Créer un compte
          </Button>

          <Button type="button" variant="ghost" onClick={onSwitchToLogin}>
            J&apos;ai déjà un compte
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test -- RegisterForm.test.tsx`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/src/auth/RegisterForm.tsx app/src/auth/RegisterForm.test.tsx
git commit -m "feat(app): RegisterForm with react-hook-form + zod validation"
```

---

## Task 8: Wire `AuthProvider` into `main.tsx`

**Files:**
- Modify: `app/src/main.tsx`

**Interfaces:**
- Consumes: `AuthProvider` from `./auth/AuthContext` (Task 5).

Current content of `app/src/main.tsx`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 1: Add `AuthProvider` inside `QueryClientProvider`**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import App from './App';
import './index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

(`AuthProvider` nests inside `QueryClientProvider` rather than the other way around — it doesn't depend on TanStack Query today, but future auth-dependent queries elsewhere in the app will want to read `useAuth()` from inside components that also use `useQuery`, and this ordering keeps both providers available together without it mattering which is "outer.")

- [ ] **Step 2: Verify the app builds**

Run: `pnpm --filter @basketeasy/app exec tsc -b`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/src/main.tsx
git commit -m "feat(app): wire AuthProvider into the app root"
```

---

## Task 9: `App.tsx` — login/register ↔ logged-in toggle

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/App.test.tsx`

**Interfaces:**
- Consumes: `useAuth` from `./auth/AuthContext` (Task 5); `LoginForm` (Task 6); `RegisterForm` (Task 7).

Current content of `app/src/App.tsx`:

```typescript
import { Button } from '@basketeasy/ui/button';
import { HealthStatus } from './components/HealthStatus';

export default function App() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '64px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 40 }}>BasketEasy</h1>
        <p style={{ color: 'var(--be-muted)', margin: '6px 0 0' }}>
          La gestion d'équipe, simplifiée.
        </p>
      </div>

      <HealthStatus />

      <div>
        <Button>Rejoindre un club</Button>
      </div>
    </main>
  );
}
```

Current content of `app/src/App.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import App from './App';

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it('renders the brand tagline', () => {
    renderApp();
    expect(screen.getByText("La gestion d'équipe, simplifiée.")).toBeInTheDocument();
  });

  it('renders the API health status once the fetch resolves', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText(/database: up/)).toBeInTheDocument());
  });

  it('renders an error state when the health check fails', async () => {
    server.use(http.get('/api/health', () => HttpResponse.json(null, { status: 500 })));

    renderApp();
    await waitFor(() => expect(screen.getByText(/unreachable/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 1: Write the new/changed `App.test.tsx` cases first**

Replace `app/src/App.test.tsx` with (this wraps `renderApp()` in `AuthProvider` too, which every existing test now implicitly depends on because `App` will call `useAuth()`):

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { server } from './mocks/server';
import { AuthProvider } from './auth/AuthContext';
import App from './App';

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it('renders the brand tagline', () => {
    renderApp();
    expect(screen.getByText("La gestion d'équipe, simplifiée.")).toBeInTheDocument();
  });

  it('renders the API health status once the fetch resolves', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText(/database: up/)).toBeInTheDocument());
  });

  it('renders an error state when the health check fails', async () => {
    server.use(http.get('/api/health', () => HttpResponse.json(null, { status: 500 })));

    renderApp();
    await waitFor(() => expect(screen.getByText(/unreachable/)).toBeInTheDocument());
  });

  it('shows the login form when logged out, and can switch to the register form and back', async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { name: /se connecter/i })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /créer un compte/i }));
    expect(screen.getByRole('heading', { name: /créer un compte/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /j'ai déjà un compte/i }));
    expect(screen.getByRole('heading', { name: /se connecter/i })).toBeInTheDocument();
  });

  it('shows the logged-in view after a successful login, and can log out back to the login form', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'a@b.com', memberships: [] },
        }),
      ),
    );

    const user = userEvent.setup();
    renderApp();

    await waitFor(() => expect(screen.getByRole('heading', { name: /se connecter/i })).toBeInTheDocument());

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'a@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /se déconnecter/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /se déconnecter/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /se connecter/i })).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter @basketeasy/app test -- App.test.tsx`
Expected: FAIL — the two new tests fail because `App.tsx` doesn't render `LoginForm`/`RegisterForm`/a logged-in view yet. (The three pre-existing tests should still pass, since `App` mounted inside `AuthProvider` doesn't change the health-status behavior — but they now depend on the `/api/auth/refresh` default handler from Task 4 to avoid an MSW "unhandled request" error.)

- [ ] **Step 3: Rewrite `app/src/App.tsx`**

```typescript
import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { HealthStatus } from './components/HealthStatus';
import { useAuth } from './auth/AuthContext';
import { LoginForm } from './auth/LoginForm';
import { RegisterForm } from './auth/RegisterForm';

export default function App() {
  const { user, isLoading, logout } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '64px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 40 }}>BasketEasy</h1>
        <p style={{ color: 'var(--be-muted)', margin: '6px 0 0' }}>
          La gestion d'équipe, simplifiée.
        </p>
      </div>

      <HealthStatus />

      {!isLoading && !user && authView === 'login' && (
        <LoginForm onSwitchToRegister={() => setAuthView('register')} />
      )}
      {!isLoading && !user && authView === 'register' && (
        <RegisterForm onSwitchToLogin={() => setAuthView('login')} />
      )}
      {!isLoading && user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>{user.email}</span>
          <Button variant="outline" onClick={() => void logout()}>
            Se déconnecter
          </Button>
        </div>
      )}
    </main>
  );
}
```

Note: the pre-existing `<Button>Rejoindre un club</Button>` block is removed — it had no wired behavior before this task (it didn't do anything) and its role is superseded by the login/register flow this task adds. If you believe it should be kept alongside the auth UI, stop and flag this as a concern rather than guessing — it's a product-copy decision, not a technical one.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test -- App.test.tsx`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Run the full app test suite**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS, every suite green (client, AuthContext, LoginForm, RegisterForm, App, HealthStatus-related, cn/UI-kit tests untouched).

- [ ] **Step 6: Run the full app build**

Run: `pnpm --filter @basketeasy/app exec tsc -b`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add app/src/App.tsx app/src/App.test.tsx
git commit -m "feat(app): wire login/register/logout into App.tsx"
```

---

## Task 10: Manual verification against the running backend

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Start Postgres and the backend**

```bash
docker compose up -d postgres
DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" JWT_ACCESS_SECRET="dev-secret" pnpm --filter @basketeasy/server exec prisma migrate deploy
DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" JWT_ACCESS_SECRET="dev-secret" NODE_ENV=development pnpm --filter @basketeasy/server start &
```

- [ ] **Step 2: Start the frontend dev server**

```bash
pnpm --filter @basketeasy/app dev
```

- [ ] **Step 3: Verify in a browser**

Open `http://localhost:5173`. Confirm:
- The login form renders by default (no console errors about `AuthProvider`/`useAuth`).
- Clicking "Créer un compte" switches to the register form; "J'ai déjà un compte" switches back.
- Registering a new account (a fresh email) logs you in immediately — the page switches to showing your email + "Se déconnecter", with no page reload.
- Reloading the page (`Cmd+R`/`F5`) keeps you logged in (the silent refresh-on-mount restores the session from the httpOnly cookie) — you should NOT see the login form flash before the logged-in view appears, though a very brief blank state during `isLoading` is expected and fine.
- Clicking "Se déconnecter" returns you to the login form, and reloading the page after that stays logged out.
- Opening browser dev tools → Network tab, confirm `POST /api/auth/login` (or `/register`) sets a `Set-Cookie: refresh_token=...` and the subsequent `GET /api/auth/me` (during session restore on the next reload) succeeds with a `200`.
- Entering a wrong password shows an inline error message above the login form (not a browser alert, not a console-only error).

- [ ] **Step 4: Stop both servers**, note the result of manual verification in the PR description (no commit for this task — verification only).

---

## Self-Review Notes

- **Spec coverage:** `ApiClient` auth header + POST + 401 refresh-retry (Task 3), `AuthContext` with login/register/logout/session-restore (Task 5), `LoginForm`/`RegisterForm` with `react-hook-form` + `zod` (Tasks 6-7), `App.tsx` toggle integration (Task 9), `RefreshResponse` shared type (Task 2), MSW handlers (Task 4), manual browser verification (Task 10) matching the spec's testing section. Out-of-scope items (routing, password reset, multi-club UI, i18n library) are not touched by any task, consistent with the spec's explicit cuts.
- **Type consistency:** `AuthUser`, `AccessTokenResponse`, `RefreshResponse` (Task 2, pre-existing) are used identically across `client.ts` (Task 3), `AuthContext.tsx` (Task 5), and are implicitly relied on by the forms (Tasks 6-7) via `useAuth()`'s return type — no renamed fields across tasks. `setAccessToken`/`subscribeToSessionExpiry` (Task 3) are consumed with matching signatures in `AuthContext.tsx` (Task 5).
- **No placeholders:** every step has literal code; the one deliberately open item (whether to keep the old "Rejoindre un club" button) is flagged as a decision point for the implementer to raise, not silently resolved — this is intentional, not a missed requirement.
- **MSW strictness carried through every task:** Tasks 5-9 all account for the `onUnhandledRequest: 'error'` setting from `app/src/setupTests.ts`, either via the Task 4 default handlers or explicit `server.use()` overrides in each test.
