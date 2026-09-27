import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Text } from '@basketeasy/ui/text';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
import type { AppNotification } from '@basketeasy/types/notifications';
import { formatNotificationAge } from './notificationTime';

interface NotificationItemProps {
  notification: AppNotification;
  /** Marks it read. Fired on click, and by the standalone control on a row with no link. */
  onRead: (id: string) => void;
  /** Lets the bell's dropdown close itself when a row is followed. */
  onNavigate?: () => void;
}

/**
 * One notification row, used identically by the header bell and the
 * /notifications page — one component, not a desktop/mobile pair, so the
 * read-on-click behaviour is written once.
 *
 * A row with a `deepLink` is a link, so it gets browser link semantics for
 * free: middle-click, "open in new tab", a visible target in the status bar.
 * A row without one has nowhere to go, so it is a button that only marks
 * itself read.
 */
export function NotificationItem({ notification, onRead, onNavigate }: NotificationItemProps) {
  const isUnread = notification.readAt === null;

  const body = (
    <>
      <span className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* « Pour qui »: set when a parent is told about a child, so a
              family's notifications can be told apart at a glance. */}
          {notification.subjectFirstName && (
            <Badge variant="soft" tone="structure" className="w-fit">
              {notification.subjectFirstName}
            </Badge>
          )}
          <Text as="span" variant="label" size="sm" tone={isUnread ? 'primary' : 'secondary'}>
            {notification.title}
          </Text>
          {notification.body && (
            <Text as="span" variant="meta">
              {notification.body}
            </Text>
          )}
          <Text as="span" variant="meta" size="xs">
            {formatNotificationAge(notification.createdAt)}
          </Text>
        </span>
        {/* The unread dot, at the row's trailing edge. aria-hidden because
            "non lue" is already in the row's own accessible name below — a
            screen reader should hear it once, as part of the row, not as a
            stray bullet. */}
        <span
          aria-hidden="true"
          className={cn(
            'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
            isUnread ? 'bg-orange' : 'bg-transparent',
          )}
        />
      </span>
    </>
  );

  const shared = cn(
    'flex w-full flex-col gap-1 p-3.5 text-left no-underline transition-colors',
    focusRing,
    'hover:bg-surface-2',
  );

  const accessibleName = `${notification.subjectFirstName ? `Pour ${notification.subjectFirstName} : ` : ''}${notification.title}${isUnread ? ' (non lue)' : ''}`;

  if (notification.deepLink) {
    return (
      <Link
        to={notification.deepLink}
        aria-label={accessibleName}
        className={shared}
        onClick={() => {
          if (isUnread) onRead(notification.id);
          onNavigate?.();
        }}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={accessibleName}
      className={shared}
      // A read notification with no link has nothing left to do — disabled
      // rather than a control that silently does nothing when pressed.
      disabled={!isUnread}
      onClick={() => onRead(notification.id)}
    >
      {body}
    </button>
  );
}
