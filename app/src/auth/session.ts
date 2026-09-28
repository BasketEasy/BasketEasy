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
import type { RefreshResponse, User } from '@basketeasy/types/auth';
import { ApiError, apiClient, setAccessToken } from '../api/client';
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
      const refreshResponse = await apiClient.post<RefreshResponse>('/auth/refresh');
      setAccessToken(refreshResponse.accessToken);
      return await apiClient.get<User>('/auth/me');
    } catch (err) {
      // Only a refusal means "no session" (the normal state for a first-time
      // visitor). A network error or a 5xx (API mid-deploy, cold start) says
      // nothing about the session, so retry rather than log a signed-in user
      // out on reload.
      if (err instanceof ApiError && err.status < 500) {
        return null;
      }
      if (attempt >= RESTORE_RETRY_DELAYS_MS.length) {
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
