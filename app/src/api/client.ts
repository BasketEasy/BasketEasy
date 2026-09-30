// Minimal API client wrapper, per docs/frontend-stack.md: a single place to
// hold the base URL, auth header injection, and 401/refresh handling.
// Everything else (TanStack Query, etc.) calls through this instead of
// using bare fetch directly.

import type { RefreshResponse } from '@basketeasy/types/auth';
import { PLATFORM_TOKEN_HEADER } from '@basketeasy/types/platform-admin';
import { IMPERSONATION_READ_ONLY_CODE } from '@basketeasy/types/platform-admin-impersonation';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    // Optional machine-readable discriminator some endpoints attach to their
    // error body (e.g. FfbbLinkErrorCode) so a caller can bind the error to a
    // specific field instead of a generic message. Undefined for every
    // endpoint that doesn't set one.
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
// The back-office step-up credential. In memory only, and never persisted:
// it lives 15 minutes, is never refreshed, and re-entering a TOTP code after
// a reload is the point — a back-office session left open on a shared
// machine has to go cold.
let platformToken: string | null = null;
// A back-office read-only impersonation token (see app/src/impersonation).
// Same memory-only rule as the step-up token: a reload ends the session.
// While set, it replaces the admin's own access token on product calls,
// never on /admin/ ones, which keep the admin's credentials so « Quitter »
// can still reach the back-office.
let impersonationToken: string | null = null;
const sessionExpiryListeners = new Set<() => void>();
const impersonationExpiryListeners = new Set<() => void>();
let refreshPromise: Promise<void> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setPlatformToken(token: string | null): void {
  platformToken = token;
}

export function setImpersonationToken(token: string | null): void {
  impersonationToken = token;
}

/** Fired when a product call's impersonation token is refused (expired, ended, revoked). */
export function subscribeToImpersonationExpiry(listener: () => void): () => void {
  impersonationExpiryListeners.add(listener);
  return () => impersonationExpiryListeners.delete(listener);
}

/** The copy every read-only refusal shows, whichever error helper renders it. */
export const IMPERSONATION_READ_ONLY_MESSAGE = 'Action impossible en lecture seule.';

export function isImpersonationReadOnly(err: unknown): boolean {
  return err instanceof ApiError && err.code === IMPERSONATION_READ_ONLY_CODE;
}

export function subscribeToSessionExpiry(listener: () => void): () => void {
  sessionExpiryListeners.add(listener);
  return () => sessionExpiryListeners.delete(listener);
}

// Path-scoped so the step-up token is attached to back-office calls and
// nothing else — it must not ride along on ordinary product requests, where
// it would be visible to any proxy those requests pass through for no
// benefit.
const PLATFORM_PATH_PREFIX = '/admin/';

function isImpersonatedPath(path: string): boolean {
  return impersonationToken !== null && !path.startsWith(PLATFORM_PATH_PREFIX);
}

function buildHeaders(path: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const bearer = isImpersonatedPath(path) ? impersonationToken : accessToken;
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }
  if (platformToken && path.startsWith(PLATFORM_PATH_PREFIX)) {
    headers[PLATFORM_TOKEN_HEADER] = platformToken;
  }
  return headers;
}

const READ_METHODS = new Set(['GET', 'HEAD']);

async function rawRequest<T>(path: string, init?: RequestInit): Promise<T> {
  // Refused here as well as on the server (ImpersonationStrategy, which is
  // the enforcement): a write never leaves the browser, and that includes
  // /auth/refresh and /auth/logout, which would rotate or revoke the admin's
  // own refresh cookie.
  if (isImpersonatedPath(path) && !READ_METHODS.has(init?.method ?? 'GET')) {
    throw new ApiError(IMPERSONATION_READ_ONLY_MESSAGE, 403, IMPERSONATION_READ_ONLY_CODE);
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: buildHeaders(path),
    ...init,
  });

  if (!res.ok) {
    let message = `Request to ${path} failed with status ${res.status}`;
    let code: string | undefined;
    try {
      const body: unknown = await res.clone().json();
      if (body && typeof body === 'object' && 'message' in body) {
        const bodyMessage = (body as { message: unknown }).message;
        if (typeof bodyMessage === 'string') {
          message = bodyMessage;
        } else if (Array.isArray(bodyMessage) && bodyMessage.every((m) => typeof m === 'string')) {
          message = bodyMessage.join(', ');
        }
      }
      if (
        body &&
        typeof body === 'object' &&
        'code' in body &&
        typeof (body as { code: unknown }).code === 'string'
      ) {
        code = (body as { code: string }).code;
      }
    } catch {
      // Response body wasn't JSON (or had no body) — fall back to the
      // generic status-based message above.
    }
    throw new ApiError(message, res.status, code);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// One refresh in flight at a time: the refresh token is single-use, so two
// concurrent callers presenting the same cookie would trip family revocation.
// Resolves once the new access token is stored; rejects with the underlying
// error, and drops the stale token, when the refresh fails.
function sharedRefresh(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = rawRequest<RefreshResponse>('/auth/refresh', { method: 'POST' })
      .then((response) => {
        setAccessToken(response.accessToken);
      })
      .catch((err: unknown) => {
        setAccessToken(null);
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function attemptRefresh(): Promise<boolean> {
  return sharedRefresh().then(
    () => true,
    () => false,
  );
}

/** Test hook: a refresh left in flight by an unmounted test must not be joined by the next. */
export function __resetRefreshForTests(): void {
  refreshPromise = null;
}

/**
 * Session restore on page load: the same refresh a 401 would trigger, sharing
 * its in-flight promise. Unlike `attemptRefresh` it keeps the failure, so the
 * caller can tell "no session" (a refusal) from "could not reach the API".
 */
export function refreshAccessToken(): Promise<void> {
  return sharedRefresh();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await rawRequest<T>(path, init);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && isImpersonatedPath(path)) {
      // Never a refresh: that would silently swap the subject's view for the
      // admin's own session. The impersonation is over; say so instead.
      impersonationExpiryListeners.forEach((listener) => listener());
      throw err;
    }
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

// Accepts any plain params object (e.g. one of the @basketeasy/types
// `ListXParams` shapes) rather than a `Record<string, ...>` — interfaces
// without an explicit index signature aren't assignable to an indexed type,
// so the param type here is intentionally just `object`.
function buildQuery(params?: object): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const apiClient = {
  get: <T>(path: string, params?: object) =>
    request<T>(`${path}${buildQuery(params)}`, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  // A body on DELETE is unusual but valid, and one endpoint needs it: a Web
  // Push endpoint is a full https URL up to 2 KB long, which does not survive
  // being a path segment. Optional, so every other caller is unchanged.
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
};
