import { useEffect, useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToSessionExpiry } from '../api/client';
import { AccountContext } from './useAccount';
import { sessionQueryKey, useSession } from './session';

// Named AccountContext (not AuthContext): it holds the current account's
// identity/loading state for the app to read, not the auth *actions*
// (login/register/logout) — those are react-query mutations called directly
// from the components that trigger them (see mutations.ts, LoginForm,
// RegisterForm). "Auth" read as if this owned the whole authentication flow;
// it only owns "who's the current account, and do we know yet".
export function AccountProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError, refetch } = useSession();

  useEffect(() => {
    // Any other API call's 401-after-refresh-failure (handled centrally in
    // api/client.ts) means the session is gone — reflect that in the query
    // cache so every useAccount() consumer sees the logged-out state.
    return subscribeToSessionExpiry(() => {
      queryClient.setQueryData(sessionQueryKey, null);
    });
  }, [queryClient]);

  const value = useMemo(
    () => ({ user: user ?? null, isLoading, isError, retry: () => void refetch() }),
    [user, isLoading, isError, refetch],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
