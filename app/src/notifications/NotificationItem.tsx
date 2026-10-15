import { Link } from 'react-router-dom';
import type { ComponentType } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { IconBadge, type IconBadgeProps } from '@basketeasy/ui/icon-badge';
import type { IconProps } from '@basketeasy/ui/icon-variants';
import { BuildingIcon } from '@basketeasy/ui/icons/building';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { ChartBarsIcon } from '@basketeasy/ui/icons/chart-bars';
import { RouteIcon } from '@basketeasy/ui/icons/route';
import { SwapIcon } from '@basketeasy/ui/icons/swap';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import { WarningIcon } from '@basketeasy/ui/icons/warning';
import { ListItem } from '@basketeasy/ui/list';
import { Text } from '@basketeasy/ui/text';
import type { AppNotification, NotificationType } from '@basketeasy/types/notifications';
import { JerseyIcon } from '../clubs/eventLogisticsIcons';
import { formatNotificationAge } from './notificationTime';

// Which icon, and which badge tone, says what a notification is about. The
// copy is already a finished sentence; this is only the glyph at the row's head.
const TYPE_BADGE: Record<
  NotificationType,
  { Icon: ComponentType<IconProps>; tone: NonNullable<IconBadgeProps['tone']> }
> = {
  EVENT_CONVOCATION: { Icon: CalendarIcon, tone: 'structure' },
  EVENT_CANCELLED: { Icon: WarningIcon, tone: 'danger' },
  SCORESHEET_READY: { Icon: ChartBarsIcon, tone: 'structure' },
  SCORESHEET_FAILED: { Icon: WarningIcon, tone: 'danger' },
  EVENT_MEETING_FIXED: { Icon: RouteIcon, tone: 'structure' },
  EVENT_MEETING_CHANGED: { Icon: RouteIcon, tone: 'accent' },
  EVENT_VENUE_CHANGED: { Icon: BuildingIcon, tone: 'accent' },
  GUEST_INVITE_REQUESTED: { Icon: UsersIcon, tone: 'structure' },
  WHATSAPP_SHARE_REQUESTED: { Icon: UsersIcon, tone: 'structure' },
  JERSEY_DUTY_ASSIGNED: { Icon: JerseyIcon, tone: 'structure' },
  JERSEY_SWAP_REQUESTED: { Icon: SwapIcon, tone: 'structure' },
};

interface NotificationItemProps {
  notification: AppNotification;
  /** Marks it read. Fired on click, and by the standalone control on a row with no link. */
  onRead: (id: string) => void;
  /** Lets the bell's dropdown close itself when a row is followed. */
  onNavigate?: () => void;
  /** `comfortable` (the page) leads with a type icon; `compact` (the bell) stays tight. */
  density?: 'compact' | 'comfortable';
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
export function NotificationItem({
  notification,
  onRead,
  onNavigate,
  density = 'comfortable',
}: NotificationItemProps) {
  const isUnread = notification.readAt === null;

  const badge = TYPE_BADGE[notification.type];
  const comfortable = density === 'comfortable';

  const rowProps = {
    align: 'start',
    titleTone: isUnread ? 'primary' : 'secondary',
    leading: comfortable && badge && (
      <IconBadge tone={badge.tone} aria-hidden="true">
        <badge.Icon size="lg" />
      </IconBadge>
    ),
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
    // stray bullet. Read rows keep an invisible dot so the layout is stable.
    trailing: isUnread ? (
      <Text
        as="span"
        tone="brand"
        aria-hidden="true"
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-current"
      />
    ) : (
      <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 shrink-0" />
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
