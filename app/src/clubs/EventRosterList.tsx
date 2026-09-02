import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Badge, type BadgeProps } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { ResponsiveTable, useTableLayout } from '@basketeasy/ui/responsive-table';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import type { EventRsvpStatus } from '@basketeasy/types/events';
import { ConvocationIcon } from './eventDetailIcons';
import { eventRsvpStatusLabel } from './eventRsvpLabels';
import { getInitials } from './getInitials';
import { teamMemberRoleLabel } from './teamLabels';
import { useEventRoster, type EventRosterRow } from './useEventRoster';

// Meaning, not hue: the same three-value convention the RSVP breakdowns use,
// expressed on Badge's own tone axis.
const RSVP_TONE: Record<EventRsvpStatus, NonNullable<BadgeProps['tone']>> = {
  GOING: 'success',
  MAYBE: 'structure',
  NOT_GOING: 'danger',
};

function RsvpBadge({ status }: { status: EventRsvpStatus | null }) {
  if (status === null) {
    return (
      <Badge variant="outline" tone="muted">
        Sans réponse
      </Badge>
    );
  }
  return (
    <Badge variant="soft" tone={RSVP_TONE[status]}>
      {eventRsvpStatusLabel(status)}
    </Badge>
  );
}

function ConvocationMark({ convoked }: { convoked: boolean }) {
  if (!convoked) {
    return (
      <Badge variant="outline" tone="muted">
        Non convoqué·e
      </Badge>
    );
  }
  return (
    <Badge variant="soft" tone="brand" className="gap-1.5">
      <ConvocationIcon size={12} className="shrink-0" />
      Convoqué·e
    </Badge>
  );
}

function RosterIdentity({ row }: { row: EventRosterRow }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar size="sm" className="shrink-0">
        <AvatarFallback tone={row.convoked ? 'structure' : 'muted'}>
          {getInitials(row.firstName, row.lastName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <Text as="span" variant="label" size="sm" className="break-words">
          {row.firstName} {row.lastName}
          {row.isMe && ' (vous)'}
        </Text>
        <Text as="span" variant="meta" size="xs">
          {teamMemberRoleLabel(row.role)}
        </Text>
      </div>
    </div>
  );
}

/**
 * One roster member on the manager's match roster — written once, rendering
 * either a table row or a card depending on the layout the surrounding
 * `ResponsiveTable` is in (`CLAUDE.md`'s "one component per record"). It
 * replaces the `EventRosterCard` / inline-`TableRow` pair the Effectif tab
 * carried.
 */
function EventRosterMemberRow({ row }: { row: EventRosterRow }) {
  if (useTableLayout() === 'row') {
    return (
      <TableRow>
        <TableCell>
          <RosterIdentity row={row} />
        </TableCell>
        <TableCell>
          <ConvocationMark convoked={row.convoked} />
        </TableCell>
        <TableCell>
          <RsvpBadge status={row.rsvpStatus} />
        </TableCell>
      </TableRow>
    );
  }
  return (
    <Card variant="inset" className="flex flex-wrap items-center gap-2.5">
      <RosterIdentity row={row} />
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <ConvocationMark convoked={row.convoked} />
        <RsvpBadge status={row.rsvpStatus} />
      </div>
    </Card>
  );
}

/**
 * The match roster with both answers per line: who the coach called up, and
 * what each of them replied.
 *
 * The counts and the « Modifier la convocation » action that used to sit on
 * top of this list now live on the pilot band above it, where a manager
 * reads them first — this block is the detail behind that summary, not a
 * second copy of it.
 */
export function EventRosterList({
  clubId,
  teamId,
  eventId,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
}) {
  const { rows, isError, isLoading, retry } = useEventRoster(clubId, teamId, eventId);

  if (isError) {
    return <QueryError onRetry={retry} />;
  }

  if (isLoading || !rows) {
    return <SkeletonList rows={4} variant="card" />;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<UsersIcon tone="secondary" className="h-8 w-8" />}
        title="Effectif vide"
        description="Cette équipe n’a pas encore de joueurs ou de staff à convoquer."
      />
    );
  }

  return (
    <ResponsiveTable columns={['Joueur', 'Convocation', 'Présence']}>
      {rows.map((row) => (
        <EventRosterMemberRow key={row.teamPlayerId} row={row} />
      ))}
    </ResponsiveTable>
  );
}
