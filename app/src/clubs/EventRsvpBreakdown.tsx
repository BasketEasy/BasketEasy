import { useState } from 'react';
import type { EventRsvpStatus } from '@basketeasy/types/events';
import { EventRosterBreakdown } from './EventRosterBreakdown';
import { eventRsvpStatusLabel } from './eventRsvpLabels';
import { teamMemberRoleLabel } from './teamLabels';
import { useEventRsvps } from './useEventRsvps';
import type { StatusTone } from './statusTone';
import { useMeSuffix } from '../guardians/useActingAs';

const STATUS_TONE: Record<EventRsvpStatus, StatusTone> = {
  GOING: 'success',
  MAYBE: 'structure',
  NOT_GOING: 'danger',
};

/**
 * Roster-wide RSVP breakdown for one event — visible to anyone who can see
 * the event itself (not manager-only). Collapsed by default; the fetch is
 * lazy, only firing once opened, so N visible events never means N eager
 * requests.
 */
export function EventRsvpBreakdown({
  clubId,
  teamId,
  eventId,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: roster, isError, refetch } = useEventRsvps(clubId, teamId, eventId, isOpen);
  const meSuffix = useMeSuffix(teamId);
  const confirmedCount = roster?.filter((r) => r.status === 'GOING').length ?? 0;

  return (
    <EventRosterBreakdown
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      isError={isError}
      onRetry={() => refetch()}
      openLabel="Masquer les réponses"
      closedLabel="Voir les réponses"
      summary={roster ? `${confirmedCount}/${roster.length} confirmés` : undefined}
      meterValue={confirmedCount}
      meterMax={roster?.length ?? 0}
      meterTone="success"
      entries={
        roster?.map((entry) => ({
          id: entry.teamPlayerId,
          firstName: entry.firstName,
          lastName: entry.lastName + (entry.isMe ? meSuffix : ''),
          role: teamMemberRoleLabel(entry.role),
          statusLabel: eventRsvpStatusLabel(entry.status),
          statusTone: entry.status ? STATUS_TONE[entry.status] : 'secondary',
          filled: entry.status !== null,
        })) ?? []
      }
    />
  );
}
