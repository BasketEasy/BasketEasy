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
import { useIsDesktopViewport } from '../hooks/useIsDesktopViewport';
import { EventConvocationModal } from './EventConvocationModal';
import { eventRsvpStatusLabel } from './eventRsvpLabels';
import { getInitials } from './getInitials';
import { meterWidthClass } from './meterWidthClass';
import { teamMemberRoleLabel } from './teamLabels';
import { useEventConvocations } from './useEventConvocations';
import { useEventRsvps } from './useEventRsvps';

// Mirrors EventRsvpBreakdown's status→color mapping (kept local rather than
// exported/shared, since this is the same three-value convention repeated,
// not a new one).
const RSVP_STATUS_COLOR: Record<EventRsvpStatus, string> = {
  GOING: 'text-success',
  MAYBE: 'text-blue-green',
  NOT_GOING: 'text-error',
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
      <span className="text-sm font-semibold text-muted">{label}</span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-sunk">
        <div className={cn('h-full rounded-full', meterWidthClass(value, max), barClassName)} />
      </div>
      <span className="tabular text-sm font-bold text-muted">
        {value}/{max}
      </span>
    </div>
  );
}

function RosterStatusDot({
  label,
  colorClassName,
  filled,
}: {
  label: string;
  colorClassName: string;
  filled: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold', colorClassName)}>
      <span
        className={cn('h-2 w-2 rounded-full', filled ? 'bg-current' : 'border border-current')}
      />
      {label}
    </span>
  );
}

function RosterPlayerIdentity({ row }: { row: MergedRosterRow }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar className="h-7 w-7 text-xs">
        <AvatarFallback className={row.role === 'COACH' ? 'bg-orange' : undefined}>
          {getInitials(row.firstName, row.lastName)}
        </AvatarFallback>
      </Avatar>
      <span className="font-semibold text-charcoal">
        {row.firstName} {row.lastName}
        {row.isMe && ' (vous)'}
      </span>
    </div>
  );
}

function MatchRosterCard({ row }: { row: MergedRosterRow }) {
  return (
    <Card className="flex flex-col gap-2.5 bg-surface-2 p-3">
      <RosterPlayerIdentity row={row} />
      <span className="text-sm text-muted">{teamMemberRoleLabel(row.role)}</span>
      <div className="flex flex-wrap items-center gap-3">
        <RosterStatusDot
          label={row.convoked ? 'Convoqué' : 'Non convoqué'}
          colorClassName={row.convoked ? 'text-orange-text' : 'text-muted'}
          filled={row.convoked}
        />
        <RosterStatusDot
          label={eventRsvpStatusLabel(row.rsvpStatus)}
          colorClassName={row.rsvpStatus ? RSVP_STATUS_COLOR[row.rsvpStatus] : 'text-muted'}
          filled={row.rsvpStatus !== null}
        />
      </div>
    </Card>
  );
}

/**
 * Merged Effectif tab — RSVP + convocation status for the whole roster in
 * one table/card list, per the Roster mockup. No new backend: both halves
 * are the existing per-event roster-breakdown queries
 * (useEventRsvps/useEventConvocations), merged client-side by
 * teamPlayerId — the summary meters are then derived from that merged data
 * rather than a separate aggregate endpoint, matching this module's
 * established no-backend-aggregate convention.
 */
export function MatchRosterTab({
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
        icon={<UsersIcon className="h-8 w-8 text-muted" />}
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
        <Card className="overflow-hidden p-0">
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
                  <TableCell className="text-muted">{teamMemberRoleLabel(row.role)}</TableCell>
                  <TableCell>
                    <RosterStatusDot
                      label={row.convoked ? 'Convoqué' : 'Non convoqué'}
                      colorClassName={row.convoked ? 'text-orange-text' : 'text-muted'}
                      filled={row.convoked}
                    />
                  </TableCell>
                  <TableCell>
                    <RosterStatusDot
                      label={eventRsvpStatusLabel(row.rsvpStatus)}
                      colorClassName={
                        row.rsvpStatus ? RSVP_STATUS_COLOR[row.rsvpStatus] : 'text-muted'
                      }
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
            <MatchRosterCard key={row.teamPlayerId} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
