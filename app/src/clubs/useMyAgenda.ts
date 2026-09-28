import { useQuery } from '@tanstack/react-query';
import type { GetDashboardParams, MyDashboardSummary } from '@basketeasy/types/my-dashboard';
import { apiClient } from '../api/client';
import { myDashboardQueryKey } from './queryKeys';
import { useActingAs } from '../guardians/useActingAs';

/** The persona's agenda — the user's own, or their child's when acting for one. */
export function useMyAgenda(params?: GetDashboardParams, options?: { enabled?: boolean }) {
  const { forPlayerId, isReady } = useActingAs();
  const scoped = forPlayerId ? { ...params, forPlayerId } : params;
  return useQuery({
    queryKey: myDashboardQueryKey(scoped),
    queryFn: () => apiClient.get<MyDashboardSummary>('/me/dashboard', scoped),
    enabled: isReady && (options?.enabled ?? true),
  });
}
