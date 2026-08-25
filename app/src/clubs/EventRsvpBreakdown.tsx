import { useState } from 'react';
import type { EventRsvpStatus } from '@basketeasy/types/events';
import { EventRosterBreakdown } from './EventRosterBreakdown';
import { eventRsvpStatusLabel } from './eventRsvpLabels';
import { teamMemberRoleLabel } from './teamLabels';
import { useEventRsvps } from './useEventRsvps';

const STATUS_COLOR: Record<EventRsvpStatus, string> = {
  GOING: 'text-success',
  MAYBE: 'text-blue-green',
  NOT_GOING: 'text-error',
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
  defaultOpen = false,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { data: roster } = useEventRsvps(clubId, teamId, eventId, isOpen);
  const confirmedCount = roster?.filter((r) => r.status === 'GOING').length ?? 0;

  return (
    <EventRosterBreakdown
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      openLabel="Masquer les réponses"
      closedLabel="Voir les réponses"
      summary={roster ? `${confirmedCount}/${roster.length} confirmés` : undefined}
      meterValue={confirmedCount}
      meterMax={roster?.length ?? 0}
      meterClassName="bg-success"
      entries={
        roster?.map((entry) => ({
          id: entry.teamPlayerId,
          firstName: entry.firstName,
          lastName: entry.lastName + (entry.isMe ? ' (vous)' : ''),
          role: teamMemberRoleLabel(entry.role),
          statusLabel: eventRsvpStatusLabel(entry.status),
          statusClassName: entry.status ? STATUS_COLOR[entry.status] : 'text-muted',
          filled: entry.status !== null,
        })) ?? []
      }
    />
  );
}
