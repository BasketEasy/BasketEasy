import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { FactTile } from '@basketeasy/ui/fact-tile';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { ChartBarsIcon } from '@basketeasy/ui/icons/chart-bars';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import { TextLink } from '@basketeasy/ui/text-link';
import type { ActionItem, ActionItemKind } from '@basketeasy/types/my-dashboard';
import { EventConvocationModal } from './EventConvocationModal';

/**
 * The kinds that only this reader can fix (the call-up, the scoresheet) are
 * accent tiles with a filled action; the two that wait on someone else
 * (answers, accounts) stay neutral.
 */
const ACCENT_KINDS: ReadonlySet<ActionItemKind> = new Set([
  'MATCH_WITHOUT_CONVOCATIONS',
  'MATCH_WITHOUT_CONFIRMED_SCORESHEET',
]);

function ActionItemIcon({ kind }: { kind: ActionItemKind }) {
  const props = { 'aria-hidden': true, className: 'h-5 w-5' } as const;
  switch (kind) {
    case 'EVENT_PENDING_RSVPS':
      return <CalendarIcon {...props} />;
    case 'MATCH_WITHOUT_CONFIRMED_SCORESHEET':
      return <ChartBarsIcon {...props} />;
    default:
      return <UsersIcon {...props} />;
  }
}

/**
 * One row of the manager's « À traiter » band: a `FactTile` over an existing
 * flow, deliberately not a new `@basketeasy/ui` component
 * (`docs/ux-audit/player-first-implementation-plan.md` §1.1). Every action
 * reuses an existing flow; this adds no new mutation.
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
  const isAccent = ACCENT_KINDS.has(item.kind);

  let action = null;
  if (item.kind === 'MATCH_WITHOUT_CONVOCATIONS' && item.teamId && item.eventId) {
    action = (
      <EventConvocationModal
        clubId={item.clubId}
        teamId={item.teamId}
        eventId={item.eventId}
        triggerLabel="Convoquer le groupe"
      />
    );
  } else if (item.kind === 'EVENT_PENDING_RSVPS' && eventHref) {
    action = (
      <TextLink asChild tone="brand" className="shrink-0">
        <Link to={eventHref}>Voir les réponses →</Link>
      </TextLink>
    );
  } else if (item.kind === 'MATCH_WITHOUT_CONFIRMED_SCORESHEET' && eventHref) {
    action = (
      <Button asChild>
        <Link to={eventHref}>Importer la feuille de match →</Link>
      </Button>
    );
  } else if (item.kind === 'PLAYERS_WITHOUT_ACCOUNT') {
    action = (
      <TextLink asChild tone="brand" className="shrink-0">
        <Link to={`/clubs/${item.clubId}/members?tab=players`}>Voir les joueurs →</Link>
      </TextLink>
    );
  }

  return (
    <FactTile
      tone={isAccent ? 'accent' : 'neutral'}
      icon={<ActionItemIcon kind={item.kind} />}
      label={item.message}
      actions={action}
    />
  );
}
