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

// The bell shows the most recent handful; the full run lives on
// /notifications. Small enough that the panel never needs its own scrollbar
// on a laptop screen.
const BELL_PARAMS = { limit: 6 } as const;

/**
 * The header's notification bell — a sibling of `AccountMenu`, not an item
 * inside it: notifications are a destination of their own, and burying an
 * unread count behind an avatar defeats the point of having one.
 *
 * Desktop only, because `AppHeader` is: on a phone the bottom bar is
 * structurally fixed at four slots, so /notifications is reached from
 * `AccountPage` instead.
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
          <BellIcon className="h-5 w-5" />
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
