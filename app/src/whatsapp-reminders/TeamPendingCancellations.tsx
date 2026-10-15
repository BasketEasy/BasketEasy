import { useSearchParams } from 'react-router-dom';
import { FactTile } from '@basketeasy/ui/fact-tile';
import { WarningIcon } from '@basketeasy/ui/icons/warning';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
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
 *
 * Each cancellation is a `FactTile`: accent while it still has to be shared
 * (a thing only this manager can fix), neutral once it was.
 */
export function TeamPendingCancellations({ clubId, teamId }: { clubId: string; teamId: string }) {
  const { data, isError, refetch } = useTeamPendingCancellations(clubId, teamId);
  const {
    mutate: confirm,
    isPending,
    variables: confirming,
  } = useConfirmCancellation(clubId, teamId);
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
        const isSent = cancellation.status.state === 'SENT';
        return (
          // The id is the `?partage=` anchor, on a wrapper since a tile takes none.
          <div key={cancellation.shareId} id={`partage-${cancellation.shareId}`}>
            <FactTile
              tone={isSent ? 'neutral' : 'accent'}
              icon={<WarningIcon size="lg" aria-hidden="true" />}
              label={`${cancellation.eventName}, ${cancellation.eventDate}`}
              detail={
                isSent
                  ? 'Annulation envoyée'
                  : 'Supprimé alors que le groupe WhatsApp en avait été prévenu.'
              }
              actions={
                <div className="min-w-0 flex-1">
                  <WhatsAppShareAction
                    message={cancellation.message}
                    isSent={isSent}
                    confirm={confirmThis}
                    // Only the tile being confirmed shows a spinner, not every tile.
                    isConfirming={isPending && confirming?.shareId === cancellation.shareId}
                    focusOnMount={focusedShareId === cancellation.shareId}
                  />
                </div>
              }
            />
          </div>
        );
      })}
    </section>
  );
}
