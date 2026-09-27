import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { PageContainer } from '@basketeasy/ui/page-container';
import { SectionHeading } from '@basketeasy/ui/section-heading';
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
        {/* Stacked on a phone, side by side from sm up. Not flex-wrap: the
            heading carries flex-1 so its court-line rule fills the row, which
            means it shrinks instead of wrapping, and the button ends up
            sitting on top of the wrapped title. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {/* flex-1 so SectionHeading's court-line rule has room to fill —
              without it the heading shrinks to its text and the rule, the
              direction's structural motif, collapses to nothing. */}
          <SectionHeading count={unreadCount || undefined} className="min-w-0 flex-1">
            Notifications
          </SectionHeading>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 self-start sm:self-auto"
              disabled={isPending}
              onClick={() => markAllRead()}
            >
              Tout marquer comme lu
            </Button>
          )}
        </div>
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
