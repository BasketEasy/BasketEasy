import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Card } from '@basketeasy/ui/card';
import { cn } from '@basketeasy/ui/cn';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@basketeasy/ui/table';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import type {
  EventConvocationRosterEntry,
  EventRsvpRosterEntry,
  EventRsvpStatus,
} from '@basketeasy/types/events';
import { useIsDesktopViewport } from '@basketeasy/ui/use-is-desktop-viewport';
import { EventConvocationModal } from './EventConvocationModal';
import { eventRsvpStatusLabel } from './eventRsvpLabels';
import { getInitials } from './getInitials';
import { meterWidthClass } from './meterWidthClass';
import { teamMemberRoleLabel } from './teamLabels';
import { useEventConvocations } from './useEventConvocations';
import { useEventRsvps } from './useEventRsvps';
import { Text } from '@basketeasy/ui/text';
import type { StatusTone } from './statusTone';

// Mirrors EventRsvpBreakdown's status→color mapping (kept local rather than
// exported/shared, since this is the same three-value convention repeated,
// not a new one).
const RSVP_STATUS_TONE: Record<EventRsvpStatus, StatusTone> = {
  GOING: 'success',
  MAYBE: 'structure',
  NOT_GOING: 'danger',
};

interface MergedRosterRow {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
  role: EventRsvpRosterEntry['role'];
  isMe: boolean;
  rsvpStatus: EventRsvpStatus | null;
  convoked: boolean;
}

/**
 * Both roster-breakdown endpoints are keyed off the same team roster
 * server-side, so a plain lookup from the RSVP list into a convocation Map
 * is enough — no need to union the two id sets.
 */
function mergeRoster(
  rsvps: EventRsvpRosterEntry[],
  convocations: EventConvocationRosterEntry[],
): MergedRosterRow[] {
  const convocationByPlayer = new Map(convocations.map((c) => [c.teamPlayerId, c]));
  return rsvps.map((rsvp) => ({
    teamPlayerId: rsvp.teamPlayerId,
    firstName: rsvp.firstName,
    lastName: rsvp.lastName,
    role: rsvp.role,
    isMe: rsvp.isMe,
    rsvpStatus: rsvp.status,
    convoked: convocationByPlayer.get(rsvp.teamPlayerId)?.convoked ?? false,
  }));
}

function RosterMeter({
  label,
  value,
  max,
  barClassName,
}: {
  label: string;
  value: number;
  max: number;
  barClassName: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Text as="span" variant="label" size="sm" tone="secondary">
        {label}
      </Text>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-sunk">
        <div className={cn('h-full rounded-full', meterWidthClass(value, max), barClassName)} />
      </div>
      <Text as="span" variant="label" size="sm" tone="secondary" className="tabular font-bold">
        {value}/{max}
      </Text>
    </div>
  );
}

function RosterStatusDot({
  label,
  tone,
  filled,
}: {
  label: string;
  tone: StatusTone;
  filled: boolean;
}) {
  return (
    <Text
      as="span"
      variant="label"
      size="sm"
      tone={tone}
      className="inline-flex items-center gap-1.5"
    >
      <span
        className={cn('h-2 w-2 rounded-full', filled ? 'bg-current' : 'border border-current')}
      />
      {label}
    </Text>
  );
}

function RosterPlayerIdentity({ row }: { row: MergedRosterRow }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar size="sm">
        <AvatarFallback tone={row.role === 'COACH' ? 'brand' : 'structure'}>
          {getInitials(row.firstName, row.lastName)}
        </AvatarFallback>
      </Avatar>
      <Text as="span" variant="label">
        {row.firstName} {row.lastName}
        {row.isMe && ' (vous)'}
      </Text>
    </div>
  );
}

function EventRosterCard({ row }: { row: MergedRosterRow }) {
  return (
    <Card variant="inset" className="flex flex-col gap-2.5">
      <RosterPlayerIdentity row={row} />
      <Text as="span" variant="meta">
        {teamMemberRoleLabel(row.role)}
      </Text>
      <div className="flex flex-wrap items-center gap-3">
        <RosterStatusDot
          label={row.convoked ? 'Convoqué' : 'Non convoqué'}
          tone={row.convoked ? 'brand' : 'secondary'}
          filled={row.convoked}
        />
        <RosterStatusDot
          label={eventRsvpStatusLabel(row.rsvpStatus)}
          tone={row.rsvpStatus ? RSVP_STATUS_TONE[row.rsvpStatus] : 'secondary'}
          filled={row.rsvpStatus !== null}
        />
      </div>
    </Card>
  );
}

/**
 * Merged Effectif tab — RSVP + convocation status for the whole roster in
 * one table/card list, per the Roster mockup. Shared by both event types
 * (MATCH and TRAINING) via EventDetailPage; nothing here is match-specific
 * — `eventId` is opaque to this component. No new backend: both halves are
 * the existing per-event roster-breakdown queries
 * (useEventRsvps/useEventConvocations), merged client-side by
 * teamPlayerId — the summary meters are then derived from that merged data
 * rather than a separate aggregate endpoint, matching this module's
 * established no-backend-aggregate convention.
 */
export function EventRosterTab({
  clubId,
  teamId,
  eventId,
  canManage,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
  canManage: boolean;
}) {
  const isDesktop = useIsDesktopViewport();
  const {
    data: rsvps,
    isLoading: isLoadingRsvps,
    isError: isRsvpsError,
    refetch: refetchRsvps,
  } = useEventRsvps(clubId, teamId, eventId, true);
  const {
    data: convocations,
    isLoading: isLoadingConvocations,
    isError: isConvocationsError,
    refetch: refetchConvocations,
  } = useEventConvocations(clubId, teamId, eventId, true);

  if (isRsvpsError || isConvocationsError) {
    return (
      <QueryError
        onRetry={() => {
          if (isRsvpsError) refetchRsvps();
          if (isConvocationsError) refetchConvocations();
        }}
      />
    );
  }

  if (isLoadingRsvps || isLoadingConvocations || !rsvps || !convocations) {
    return <SkeletonList rows={4} variant="card" />;
  }

  const rows = mergeRoster(rsvps, convocations);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<UsersIcon tone="secondary" className="h-8 w-8" />}
        title="Effectif vide"
        description="Cette équipe n’a pas encore de joueurs ou de staff à convoquer."
      />
    );
  }

  const convokedCount = rows.filter((row) => row.convoked).length;
  const confirmedCount = rows.filter((row) => row.rsvpStatus === 'GOING').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-6">
        <RosterMeter
          label="Convoqués"
          value={convokedCount}
          max={rows.length}
          barClassName="bg-orange"
        />
        <RosterMeter
          label="Présences confirmées"
          value={confirmedCount}
          max={rows.length}
          barClassName="bg-success"
        />
        {canManage && (
          <div className="ml-auto">
            <EventConvocationModal clubId={clubId} teamId={teamId} eventId={eventId} />
          </div>
        )}
      </div>

      {isDesktop ? (
        <Card variant="flush">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Joueur</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Convocation</TableHead>
                <TableHead>Présence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.teamPlayerId}>
                  <TableCell>
                    <RosterPlayerIdentity row={row} />
                  </TableCell>
                  <TableCell>
                    <Text as="span" variant="meta" size="md">
                      {teamMemberRoleLabel(row.role)}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <RosterStatusDot
                      label={row.convoked ? 'Convoqué' : 'Non convoqué'}
                      tone={row.convoked ? 'brand' : 'secondary'}
                      filled={row.convoked}
                    />
                  </TableCell>
                  <TableCell>
                    <RosterStatusDot
                      label={eventRsvpStatusLabel(row.rsvpStatus)}
                      tone={row.rsvpStatus ? RSVP_STATUS_TONE[row.rsvpStatus] : 'secondary'}
                      filled={row.rsvpStatus !== null}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <EventRosterCard key={row.teamPlayerId} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
