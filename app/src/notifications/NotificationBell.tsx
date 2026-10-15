import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { CountBadge } from '@basketeasy/ui/count-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@basketeasy/ui/dropdown-menu';
import { BellIcon } from '@basketeasy/ui/icons/bell';
import { TextLink } from '@basketeasy/ui/text-link';
import { useNotifications } from './useNotifications';
import { useNotificationsReadAll } from './useNotificationRead';
import { NotificationList } from './NotificationList';
import { BELL_PARAMS } from './queryKeys';

/**
 * The phone top bar's bell: a plain link to /notifications carrying the same
 * unread pip. Not the desktop dropdown — a 24rem panel hanging off a 390px
 * screen's corner would be the whole screen anyway, and the full page is one
 * tap away.
 */
export function NotificationBellLink() {
  const { data } = useNotifications(BELL_PARAMS);
  const unreadCount = data?.unreadCount ?? 0;
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={unreadCount > 0 ? `Notifications (${unreadCount} non lues)` : 'Notifications'}
    >
      <Link to="/notifications">
        <BellIcon size="lg" />
        <CountBadge count={unreadCount} className="absolute right-1 top-1" />
      </Link>
    </Button>
  );
}

/**
 * The header's notification bell — a sibling of `AccountMenu`, not an item
 * inside it: notifications are a destination of their own, and burying an
 * unread count behind an avatar defeats the point of having one.
 *
 * Desktop only: on a phone `AppHeader`'s compact top bar renders
 * `NotificationBellLink` instead.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications(BELL_PARAMS);
  const { mutate: markAllRead, isPending } = useNotificationsReadAll();

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          // The count is a graphic (CountBadge is aria-hidden), so it reaches
          // assistive tech through this name instead.
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} non lues)` : 'Notifications'}
        >
          <BellIcon size="lg" />
          <CountBadge count={unreadCount} className="absolute -right-0.5 -top-0.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-notifications max-w-menu-available">
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" disabled={isPending} onClick={() => markAllRead()}>
              Tout marquer comme lu
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {/* Not DropdownMenuItems: the rows are links and buttons with their
            own semantics, and Radix's menu roving-tabindex would fight the
            "mark as read" control inside each one. */}
        <div className="p-1">
          <NotificationList
            params={BELL_PARAMS}
            density="compact"
            onNavigate={() => setOpen(false)}
          />
        </div>
        <DropdownMenuSeparator />
        <div className="px-3 py-2">
          <TextLink asChild>
            <Link to="/notifications" onClick={() => setOpen(false)}>
              Voir toutes les notifications →
            </Link>
          </TextLink>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
