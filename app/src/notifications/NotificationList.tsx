import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { List } from '@basketeasy/ui/list';
import { BellIcon } from '@basketeasy/ui/icons/bell';
import type { ListNotificationsParams } from '@basketeasy/types/notifications';
import { useNotifications } from './useNotifications';
import { useNotificationRead } from './useNotificationRead';
import { NotificationItem } from './NotificationItem';

interface NotificationListProps {
  params?: ListNotificationsParams;
  /** Closes the bell's dropdown when a row is followed. Unused on /notifications. */
  onNavigate?: () => void;
  /** The bell's panel is short; the page's list has room to breathe. */
  density?: 'compact' | 'comfortable';
}

/**
 * The feed itself, shared by the header bell's dropdown and the
 * /notifications page — one component with a density prop, not a pair, so
 * the read-on-click behaviour and the query branches exist once.
 *
 * Branches error → loading → empty → data, in that order (CLAUDE.md): a
 * failed fetch must never fall through to the empty state, which would tell
 * a player their convocations don't exist when they merely failed to load.
 */
export function NotificationList({
  params,
  onNavigate,
  density = 'comfortable',
}: NotificationListProps) {
  const { data, isLoading, isError, refetch, isRefetching } = useNotifications(params);
  const { mutate: markRead } = useNotificationRead();

  if (isError) {
    return (
      <QueryError
        title="Notifications indisponibles"
        onRetry={() => void refetch()}
        isRetrying={isRefetching}
      />
    );
  }

  if (isLoading) {
    return <SkeletonList rows={density === 'compact' ? 3 : 5} />;
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<BellIcon size="3xl" tone="structure" />}
        title="Aucune notification"
        description="Vos convocations et les annulations de séance apparaîtront ici."
      />
    );
  }

  return (
    <List>
      {items.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRead={markRead}
          onNavigate={onNavigate}
        />
      ))}
    </List>
  );
}
