// The session query: TanStack Query owns this piece of server state (per
// CLAUDE.md's "TanStack Query owns server state ... Context owns local UI
// state" split), so restoring the session on page load is a plain useQuery
// rather than a hand-rolled promise-memoization singleton.
//
// React Query itself dedupes concurrent fetches for the same queryKey, so
// React.StrictMode's dev-mode double-invoked mount effect (which used to
// require a manual module-level singleton, see git history) is handled for
// free: a second observer mounting mid-fetch subscribes to the in-flight
// request instead of firing a second one. That matters here because the
// refresh token is single-use/rotating — a genuine second concurrent call to
// /auth/refresh would always 401 and discard a valid session.
import { useQuery } from '@tanstack/react-query';
import type { User } from '@basketeasy/types/auth';
import { ApiError, apiClient, refreshAccessToken, setAccessToken } from '../api/client';
import { isImpersonating } from '../impersonation/impersonationSession';

export const sessionQueryKey = ['auth', 'session'] as const;

const RESTORE_RETRY_DELAYS_MS = [500, 1500, 3000, 6000];

async function fetchSession(): Promise<User | null> {
  // A back-office impersonation already carries its credential: "me" is the
  // subject, read directly. A refresh here would be refused locally anyway
  // (a write), and would mean the admin's own cookie, not the subject.
  if (isImpersonating()) {
    try {
      return await apiClient.get<User>('/auth/me');
    } catch {
      return null;
    }
  }
  for (let attempt = 0; ; attempt++) {
    try {
      // Through the shared refresh, not a raw POST: a 401-triggered refresh
      // running at the same moment must not present the same single-use token.
      await refreshAccessToken();
      return await apiClient.get<User>('/auth/me');
    } catch (err) {
      // Only a refusal of the credential means "no session" (the normal state
      // for a first-time visitor). Anything else says nothing about the
      // session: a network error, a 5xx (API mid-deploy, cold start), or a
      // proxy's 408/429. Retry, and once the budget is spent surface the
      // error rather than pretend the user is logged out.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        return null;
      }
      if (attempt >= RESTORE_RETRY_DELAYS_MS.length) {
        // A refresh that worked but whose `me` kept failing left a rotated
        // token in memory while the UI reports no user: drop it.
        setAccessToken(null);
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, RESTORE_RETRY_DELAYS_MS[attempt]));
    }
  }
}

export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSession,
    // One-shot restore-on-load: never goes stale on its own, and shouldn't
    // silently refire (e.g. on window refocus) since /auth/refresh's token
    // is single-use — a second automatic call would 401 and log the user
    // out. Login/register/logout mutations update this query's cached data
    // directly instead of triggering a refetch.
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
