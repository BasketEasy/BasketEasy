import { useSearchParams } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
import { WhatsAppShareAction, type ConfirmShare } from './WhatsAppShareAction';
import { useConfirmCancellation, useTeamPendingCancellations } from './useTeamPendingCancellations';

/**
 * Cancellations still worth telling the group about. Cancelling an event
 * deletes it, so there is no event page to hold the share: it lives here, on
 * the team page, until the event's original kick-off.
 *
 * Rendered only when there is something to share. Its `loading` renders
 * nothing (a jump above the tabs would be worse than a card arriving late),
 * and an empty result is the normal case and renders nothing too; that is not
 * an error falling through, which gets its own compact `QueryError`.
 */
export function TeamPendingCancellations({ clubId, teamId }: { clubId: string; teamId: string }) {
  const { data, isError, refetch } = useTeamPendingCancellations(clubId, teamId);
  const { mutate: confirm, isPending: isConfirming } = useConfirmCancellation(clubId, teamId);
  const [searchParams] = useSearchParams();
  // `?partage=<shareId>` from the notification: focus that cancellation's button.
  const focusedShareId = searchParams.get('partage');

  if (isError) {
    return (
      <QueryError
        title="Annulations indisponibles"
        description="Les annulations à partager n’ont pas pu être chargées."
        onRetry={() => refetch()}
      />
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading as="h2">Annulations à partager</SectionHeading>
      {data.map((cancellation) => {
        const confirmThis: ConfirmShare = (platform, callbacks) =>
          confirm({ shareId: cancellation.shareId, platform }, callbacks);
        return (
          <Card
            key={cancellation.shareId}
            id={`partage-${cancellation.shareId}`}
            variant="inset"
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="soft"
                tone={cancellation.status.state === 'SENT' ? 'structure' : 'brand'}
              >
                {cancellation.status.state === 'SENT'
                  ? 'Annulation envoyée'
                  : 'Annulation à partager'}
              </Badge>
              <Text variant="label" size="sm">
                {cancellation.eventName}, {cancellation.eventDate}
              </Text>
            </div>
            <Text variant="meta" size="sm">
              L’événement a été supprimé alors que le groupe WhatsApp en avait été prévenu.
            </Text>
            <WhatsAppShareAction
              message={cancellation.message}
              isSent={cancellation.status.state === 'SENT'}
              confirm={confirmThis}
              isConfirming={isConfirming}
              focusOnMount={focusedShareId === cancellation.shareId}
            />
          </Card>
        );
      })}
    </section>
  );
}
