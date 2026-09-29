import { useState } from 'react';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { Badge, type BadgeProps } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { ResponsiveTable, useTableLayout } from '@basketeasy/ui/responsive-table';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { respondentName } from '../guardians/respondentLabel';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import type { EventRsvpStatus } from '@basketeasy/types/events';
import { ConvocationIcon } from './eventDetailIcons';
import { eventRsvpAnswerLabel } from './eventRsvpLabels';
import { getInitials } from './getInitials';
import { teamMemberRoleLabel } from './teamLabels';
import { useEventRoster, type EventRosterRow } from './useEventRoster';
import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import { TravelModeBadge } from '../meeting-points/TravelModeBadge';
import { formatEventTime } from './eventDateFormat';
import { RsvpHistoryDialog } from '../guest-rsvp/RsvpHistoryDialog';

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
        {eventRsvpAnswerLabel(null)}
      </Badge>
    );
  }
  return (
    <Badge variant="soft" tone={RSVP_TONE[status]}>
      {eventRsvpAnswerLabel(status)}
    </Badge>
  );
}

/**
 * The answer, and — when a parent or the shared link gave it — who: « Sophie
 * M. · parent », « via lien ». A coach chasing answers needs to know a
 * child's « oui » came from home, and that one came from the link. The badge
 * opens the answer's history.
 */
function RsvpCell({
  row,
  clubId,
  teamId,
  eventId,
}: {
  row: EventRosterRow;
  clubId: string;
  teamId: string;
  eventId: string;
}) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const playerName = `${row.firstName} ${row.lastName}`;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-label={`Historique des réponses de ${playerName}`}
          onClick={() => setIsHistoryOpen(true)}
          className={cn('rounded-md', focusRing)}
        >
          <RsvpBadge status={row.rsvpStatus} />
        </button>
        {row.rsvpStatus !== null && row.viaLink && (
          <Badge variant="soft" tone="neutral">
            via lien
          </Badge>
        )}
      </div>
      {row.rsvpStatus !== null && row.respondedByGuardian && row.respondedBy && (
        <Text as="span" variant="meta" size="xs">
          {respondentName(row.respondedBy)} · parent
        </Text>
      )}
      <RsvpHistoryDialog
        clubId={clubId}
        teamId={teamId}
        eventId={eventId}
        teamPlayerId={row.teamPlayerId}
        playerName={playerName}
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
      />
    </div>
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
/** The hour each travel mode is expected — « RDV 19:15 », « Direct 19:45 ». */
interface TravelTimes {
  meetingPoint: string | null;
  direct: string;
}

function TravelCell({ row, times }: { row: EventRosterRow; times: TravelTimes }) {
  if (row.travelMode === null) {
    return (
      <Text as="span" variant="meta">
        —
      </Text>
    );
  }
  return (
    <TravelModeBadge
      travelMode={row.travelMode}
      time={row.travelMode === 'DIRECT' ? times.direct : times.meetingPoint}
    />
  );
}

function EventRosterMemberRow({
  row,
  travel,
  clubId,
  teamId,
  eventId,
}: {
  row: EventRosterRow;
  travel: TravelTimes | null;
  clubId: string;
  teamId: string;
  eventId: string;
}) {
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
          <RsvpCell row={row} clubId={clubId} teamId={teamId} eventId={eventId} />
        </TableCell>
        {travel && (
          <TableCell>
            <TravelCell row={row} times={travel} />
          </TableCell>
        )}
      </TableRow>
    );
  }
  return (
    <Card variant="inset" className="flex flex-wrap items-center gap-2.5">
      <RosterIdentity row={row} />
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <ConvocationMark convoked={row.convoked} />
        <RsvpCell row={row} clubId={clubId} teamId={teamId} eventId={eventId} />
        {travel && row.travelMode !== null && <TravelCell row={row} times={travel} />}
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
  meetingPlan = null,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
  /** A match with a meeting point gets a « Déplacement » column: RDV or direct, with the hour. */
  meetingPlan?: EventMeetingPlan | null;
}) {
  const travel: TravelTimes | null = meetingPlan?.meetingPoint
    ? {
        meetingPoint: meetingPlan.meetsAt ? formatEventTime(meetingPlan.meetsAt) : null,
        direct: formatEventTime(meetingPlan.arrivalAt),
      }
    : null;
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
    <ResponsiveTable
      columns={
        travel
          ? ['Joueur', 'Convocation', 'Présence', 'Déplacement']
          : ['Joueur', 'Convocation', 'Présence']
      }
    >
      {rows.map((row) => (
        <EventRosterMemberRow
          key={row.teamPlayerId}
          row={row}
          travel={travel}
          clubId={clubId}
          teamId={teamId}
          eventId={eventId}
        />
      ))}
    </ResponsiveTable>
  );
}
