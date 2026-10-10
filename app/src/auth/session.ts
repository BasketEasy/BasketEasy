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
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { User } from '@basketeasy/types/auth';
import { ApiError, apiClient, refreshAccessToken, setAccessToken } from '../api/client';
import { isImpersonating } from '../impersonation/impersonationSession';

export const sessionQueryKey = ['auth', 'session'] as const;

// Every flow that changes who is logged in (login, register, logout, expiry,
// accepting an invite) goes through here. Product query keys are written for
// "me" (`['me', 'teams']`, `['me', 'dashboard', {}]`) and are identical for
// every user, so a cache that outlived the switch would show the previous
// person's teams and notifications to the next one on the same tab.
//
// Every query but the session is *removed*, not invalidated: an invalidated
// entry would still render its old data while it refetches. The session query
// is kept: it holds the new user. When a user takes over, the protected tree
// is not mounted (login and invite pages are public), so the removal is
// immediate. When the session ends, the tree is still mounted, and removing
// the entries of mounted queries would make the next re-render of any of them
// (the logout button's own mutation state re-renders its siblings) rebuild
// the entry and refetch it as nobody. So the session is only set to null here,
// and `AccountProvider` removes the entries once `ProtectedRoute` has
// unmounted the tree (`useDropUserQueriesOnSessionEnd`).
export function replaceSession(queryClient: QueryClient, user: User | null): void {
  queryClient.setQueryData(sessionQueryKey, user);
  if (user) dropUserQueries(queryClient);
}

function dropUserQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionQueryKey[0] });
}

// Runs in an effect, i.e. after the render that saw the session end has
// committed and unmounted the protected tree. Only a user going to null counts:
// a first visit that resolves to "no session" has nothing of a user's to drop,
// and removing what a public page (guest RSVP, invite preview) just fetched
// would refetch it.
export function useDropUserQueriesOnSessionEnd(user: User | null): void {
  const queryClient = useQueryClient();
  const previous = useRef<User | null>(null);
  useEffect(() => {
    if (previous.current && !user) dropUserQueries(queryClient);
    previous.current = user;
  }, [user, queryClient]);
}

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
