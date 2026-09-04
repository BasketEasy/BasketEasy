import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { notificationsQueryKeyPrefix } from './queryKeys';

/**
 * Marks one notification read.
 *
 * Invalidates the whole prefix, not one params key: the bell's short list and
 * the /notifications page's long one are separate queries over the same rows,
 * and reading an item in one has to update the badge in the other.
 */
export function useNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      apiClient.patch<void>(`/me/notifications/${notificationId}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeyPrefix });
    },
  });
}

export function useNotificationsReadAll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<void>('/me/notifications/read-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeyPrefix });
    },
  });
}
