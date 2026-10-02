import { useQuery } from '@tanstack/react-query';
import type { GetDashboardParams, MyDashboardSummary } from '@basketeasy/types/my-dashboard';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { myDashboardQueryKey } from './queryKeys';
import { useActingAs } from '../guardians/useActingAs';

/**
 * The persona's agenda — the user's own, or their child's when acting for one.
 *
 * `freshness` is the caller's to pick: an upcoming window is the screen people
 * answer from (RSVPs, convocations, logistics change under it), so it defaults
 * to `feed`; a window that looks back at played matches only moves when a
 * result is confirmed or a vote lands, so its callers pass `slow`.
 */
export function useMyAgenda(
  params?: GetDashboardParams,
  options?: { enabled?: boolean; freshness?: number },
) {
  const { forPlayerId, isReady } = useActingAs();
  const scoped = forPlayerId ? { ...params, forPlayerId } : params;
  return useQuery({
    queryKey: myDashboardQueryKey(scoped),
    queryFn: () => apiClient.get<MyDashboardSummary>('/me/dashboard', scoped),
    staleTime: options?.freshness ?? FRESHNESS.feed,
    enabled: isReady && (options?.enabled ?? true),
  });
}
