import { useQuery } from '@tanstack/react-query';
import type { GetDashboardParams, MyDashboardSummary } from '@basketeasy/types/my-dashboard';
import { apiClient } from '../api/client';
import { myDashboardQueryKey } from './queryKeys';

export function useMyAgenda(params?: GetDashboardParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: myDashboardQueryKey(params),
    queryFn: () => apiClient.get<MyDashboardSummary>('/me/dashboard', params),
    enabled: options?.enabled,
  });
}
