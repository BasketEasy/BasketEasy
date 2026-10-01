import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { Check } from '@basketeasy/ui/icons/check';
import { PageContainer } from '@basketeasy/ui/page-container';
import { PageHeader } from '@basketeasy/ui/page-header';
import { NotificationList } from '../notifications/NotificationList';
import { useNotifications } from '../notifications/useNotifications';
import { useNotificationsReadAll } from '../notifications/useNotificationRead';

// The full feed. The bell's dropdown is a short window onto the same rows;
// this is the destination it links to, and the only notification surface a
// phone has (its top bar's bell is a plain link here — see AppHeader).
export function NotificationsPage() {
  const { data } = useNotifications();
  const { mutate: markAllRead, isPending } = useNotificationsReadAll();

  const unreadCount = data?.unreadCount ?? 0;

  return (
    // size="lg" plus a caller-side max-width, rather than size="md": md is
    // max-w-md (448px), which is a form's width, and a feed of full-sentence
    // rows set that narrow wraps every title onto three lines. Width is
    // composition, so it stays at the call site.
    <PageContainer size="lg">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <PageHeader
          title="Notifications"
          meta={
            unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Tout est lu'
          }
          actions={
            unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => markAllRead()}
              >
                <Check aria-hidden="true" size="md" />
                Tout marquer comme lu
              </Button>
            )
          }
        />
        {/* The rows need a surface of their own: on the page they would
            otherwise sit straight on `ground` and read as floating text,
            where in the bell they have the dropdown's `surface` behind
            them. */}
        <Card variant="flush">
          <NotificationList />
        </Card>
      </div>
    </PageContainer>
  );
}
