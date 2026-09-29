import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@basketeasy/ui/dialog';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Text } from '@basketeasy/ui/text';
import { rsvpChangeLine } from './rsvpHistoryLabels';
import { useEventRsvpHistory } from './useEventRsvpHistory';

/**
 * Every change to one player's answer for one event, newest first, from any
 * source. This is how a coach spots a teammate answering for someone through
 * the shared link: the mark on the roster says how the current answer was
 * given, this says everything that led to it.
 */
export function RsvpHistoryDialog({
  clubId,
  teamId,
  eventId,
  teamPlayerId,
  playerName,
  open,
  onOpenChange,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
  teamPlayerId: string;
  playerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isError, isLoading, refetch } = useEventRsvpHistory(
    clubId,
    teamId,
    eventId,
    teamPlayerId,
    open,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Historique · {playerName}</DialogTitle>
          <DialogDescription>
            Chaque changement de réponse, avec la façon dont il a été fait.
          </DialogDescription>
        </DialogHeader>
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <SkeletonList rows={3} />
        ) : data.length === 0 ? (
          <EmptyState title="Aucune réponse pour l'instant" />
        ) : (
          <ol className="flex flex-col gap-2">
            {data.map((change) => (
              <li key={change.createdAt + (change.status ?? 'cleared')}>
                <Text variant="label" size="sm">
                  {rsvpChangeLine(change)}
                </Text>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
