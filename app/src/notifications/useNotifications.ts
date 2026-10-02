import { useQuery } from '@tanstack/react-query';
import type { ListNotificationsParams, NotificationList } from '@basketeasy/types/notifications';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { notificationsQueryKey } from './queryKeys';

// Nothing pushes a new notification into an open tab — there is no websocket
// or SSE transport, deliberately (see docs/decisions/notifications.md): the payload is a
// handful of rows and the audience is a club volunteer with one tab open, so
// a poll is the right amount of machinery. A minute is slow enough to be
// invisible in load terms and fast enough that a convocation sent during a
// team meeting appears before the meeting ends.
//
// Web push covers the case this does not: a tab that isn't open at all.
const POLL_INTERVAL_MS = FRESHNESS.feed;

export function useNotifications(params?: ListNotificationsParams) {
  return useQuery({
    queryKey: notificationsQueryKey(params),
    queryFn: () => apiClient.get<NotificationList>('/me/notifications', params),
    // Equal to the poll interval: a mount or a focus inside it reads the cache
    // instead of racing the poller.
    staleTime: POLL_INTERVAL_MS,
    refetchInterval: POLL_INTERVAL_MS,
  });
}
