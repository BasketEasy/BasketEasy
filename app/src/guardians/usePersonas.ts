import { queryOptions, useQuery } from '@tanstack/react-query';
import type { MyPersonas } from '@basketeasy/types/guardians';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { personasQueryKey } from './queryKeys';

const personasQuery = queryOptions({
  queryKey: personasQueryKey,
  // Always mounted (`ActingAsProvider`), so never discarded: a finite tier.
  staleTime: FRESHNESS.slow,
  queryFn: ({ signal }) => apiClient.get<MyPersonas>('/me/personas', undefined, { signal }),
});

/** Who the caller can act as: « Moi » (if anything) and each child they follow. */
export function usePersonas() {
  return useQuery(personasQuery);
}

/**
 * Refreshes the persona list once when a team or an event page opens. The
 * child may have joined this team since the list loaded, and a list that does
 * not know it would have a parent who also plays here answer as themself.
 * Called by the two pages and not by every team-scoped hook, which used to
 * refetch the list each time a dialog mounted one.
 */
export function useRefreshPersonasOnEntry() {
  useQuery({ ...personasQuery, refetchOnMount: 'always' });
}
