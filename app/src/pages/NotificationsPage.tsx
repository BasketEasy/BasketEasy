import { Button } from '@basketeasy/ui/button';
import { PageContainer } from '@basketeasy/ui/page-container';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { NotificationList } from '../notifications/NotificationList';
import { useNotifications } from '../notifications/useNotifications';
import { useNotificationsReadAll } from '../notifications/useNotificationRead';

// The full feed. The bell's dropdown is a short window onto the same rows;
// this is the destination it links to, and the only notification surface a
// phone has (the bottom bar is fixed at four slots — see AppBottomNav).
export function NotificationsPage() {
  const { data } = useNotifications();
  const { mutate: markAllRead, isPending } = useNotificationsReadAll();

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <PageContainer size="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading count={unreadCount || undefined}>Notifications</SectionHeading>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" disabled={isPending} onClick={() => markAllRead()}>
            Tout marquer comme lu
          </Button>
        )}
      </div>
      <NotificationList />
    </PageContainer>
  );
}
