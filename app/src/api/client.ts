// Minimal API client wrapper, per docs/frontend-stack.md: a single place to
// hold the base URL, auth header injection, and 401/refresh handling.
// Everything else (TanStack Query, etc.) calls through this instead of
// using bare fetch directly.

import type { RefreshResponse } from '@basketeasy/types/auth';
import { PLATFORM_TOKEN_HEADER } from '@basketeasy/types/platform-admin';

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
const sessionExpiryListeners = new Set<() => void>();
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setPlatformToken(token: string | null): void {
  platformToken = token;
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

function buildHeaders(path: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (platformToken && path.startsWith(PLATFORM_PATH_PREFIX)) {
    headers[PLATFORM_TOKEN_HEADER] = platformToken;
  }
  return headers;
}

async function rawRequest<T>(path: string, init?: RequestInit): Promise<T> {
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
