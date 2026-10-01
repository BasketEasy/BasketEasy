import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { ListItem } from '@basketeasy/ui/list';
import { cn } from '@basketeasy/ui/cn';
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

  const rowProps = {
    align: 'start',
    titleTone: isUnread ? 'primary' : 'secondary',
    // « Pour qui »: set when a parent is told about a child, so a family's
    // notifications can be told apart at a glance.
    eyebrow: notification.subjectFirstName && (
      <Badge variant="soft" tone="structure" className="w-fit">
        {notification.subjectFirstName}
      </Badge>
    ),
    meta: [notification.body, formatNotificationAge(notification.createdAt)],
    // The unread dot, at the row's trailing edge. aria-hidden because
    // "non lue" is already in the row's own accessible name below — a
    // screen reader should hear it once, as part of the row, not as a
    // stray bullet.
    trailing: (
      <span
        aria-hidden="true"
        className={cn(
          'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
          isUnread ? 'bg-orange' : 'bg-transparent',
        )}
      />
    ),
  } as const;

  const accessibleName = `${notification.subjectFirstName ? `Pour ${notification.subjectFirstName} : ` : ''}${notification.title}${isUnread ? ' (non lue)' : ''}`;

  if (notification.deepLink) {
    return (
      <ListItem asChild {...rowProps}>
        <Link
          to={notification.deepLink}
          aria-label={accessibleName}
          onClick={() => {
            if (isUnread) onRead(notification.id);
            onNavigate?.();
          }}
        >
          {notification.title}
        </Link>
      </ListItem>
    );
  }

  return (
    <ListItem asChild {...rowProps}>
      <button
        type="button"
        aria-label={accessibleName}
        // A read notification with no link has nothing left to do — disabled
        // rather than a control that silently does nothing when pressed.
        disabled={!isUnread}
        onClick={() => onRead(notification.id)}
      >
        {notification.title}
      </button>
    </ListItem>
  );
}
