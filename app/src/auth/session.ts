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
import { apiClient, setAccessToken } from '../api/client';

export const sessionQueryKey = ['auth', 'session'] as const;

async function fetchSession(): Promise<User | null> {
  try {
    const refreshResponse = await apiClient.post<RefreshResponse>('/auth/refresh');
    setAccessToken(refreshResponse.accessToken);
    return await apiClient.get<User>('/auth/me');
  } catch {
    // No valid session to restore — this is the normal state for a
    // first-time visitor, not an error to surface.
    return null;
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
