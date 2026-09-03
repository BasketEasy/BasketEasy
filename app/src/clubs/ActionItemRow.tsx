import { Link } from 'react-router-dom';
import { Card } from '@basketeasy/ui/card';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import type { ActionItem } from '@basketeasy/types/my-dashboard';
import { EventConvocationModal } from './EventConvocationModal';

/**
 * One row of the manager's « À traiter » band — domain composition over
 * `Card` + `Text` + `Button`/`TextLink`, deliberately not a new `@basketeasy/ui`
 * component (`docs/ux-audit/player-first-implementation-plan.md` §1.1). Every
 * action reuses an existing flow; this phase adds no new mutation.
 *
 * `message` is a fully-formed French sentence built server-side
 * (`DashboardService`) — this component renders it verbatim, never
 * assembling copy from the item's raw fields itself.
 */
export function ActionItemRow({ item }: { item: ActionItem }) {
  const eventHref =
    item.teamId && item.eventId
      ? `/clubs/${item.clubId}/teams/${item.teamId}/events/${item.eventId}`
      : null;

  return (
    <Card
      variant="inset"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <Text as="span" variant="body" size="sm" className="min-w-0 sm:flex-1">
        {item.message}
      </Text>
      {item.kind === 'MATCH_WITHOUT_CONVOCATIONS' && item.teamId && item.eventId && (
        <EventConvocationModal
          clubId={item.clubId}
          teamId={item.teamId}
          eventId={item.eventId}
          triggerLabel="Convoquer le groupe"
          triggerVariant="outline"
        />
      )}
      {item.kind === 'EVENT_PENDING_RSVPS' && eventHref && (
        <TextLink asChild tone="brand" className="shrink-0">
          <Link to={eventHref}>Voir les réponses →</Link>
        </TextLink>
      )}
      {item.kind === 'MATCH_WITHOUT_CONFIRMED_SCORESHEET' && eventHref && (
        <TextLink asChild tone="brand" className="shrink-0">
          <Link to={eventHref}>Importer la feuille de match →</Link>
        </TextLink>
      )}
      {item.kind === 'PLAYERS_WITHOUT_ACCOUNT' && (
        <TextLink asChild tone="brand" className="shrink-0">
          <Link to={`/clubs/${item.clubId}/members?tab=players`}>Voir les joueurs →</Link>
        </TextLink>
      )}
    </Card>
  );
}
