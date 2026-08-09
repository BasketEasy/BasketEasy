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
    credentials: 'include',
    headers: buildHeaders(),
    ...init,
  });

  if (!res.ok) {
    let message = `Request to ${path} failed with status ${res.status}`;
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
    } catch {
      // Response body wasn't JSON (or had no body) — fall back to the
      // generic status-based message above.
    }
    throw new ApiError(message, res.status);
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

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
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
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
