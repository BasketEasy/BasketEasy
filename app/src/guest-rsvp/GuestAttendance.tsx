import { useState } from 'react';
import type { EventRsvpStatus } from '@basketeasy/types/events';
import type { GuestEvent, GuestRosterMember } from '@basketeasy/types/guest-links';
import { EventRosterBreakdown } from '../clubs/EventRosterBreakdown';
import { eventRsvpStatusLabel } from '../clubs/eventRsvpLabels';
import { teamMemberRoleLabel } from '../clubs/teamLabels';
import { countEventRoster } from '../clubs/useEventRoster';
import type { StatusTone } from '../clubs/statusTone';

const STATUS_TONE: Record<EventRsvpStatus, StatusTone> = {
  GOING: 'success',
  MAYBE: 'structure',
  NOT_GOING: 'danger',
};

/**
 * « Qui vient ? » — the counts, then who answered what and who is called up.
 * Everything is already in the page payload, so opening it fetches nothing.
 */
export function GuestAttendance({
  event,
  roster,
}: {
  event: GuestEvent;
  roster: GuestRosterMember[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const counts = countEventRoster(
    event.attendance.map((a) => ({
      convoked: a.convoked,
      rsvpStatus: a.status,
      travelMode: a.travelMode,
    })),
  );
  const byPlayer = new Map(event.attendance.map((a) => [a.teamPlayerId, a]));

  return (
    <EventRosterBreakdown
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      openLabel="Masquer qui vient"
      closedLabel="Qui vient ?"
      summary={`${counts.going}/${counts.answering} présents`}
      meterValue={counts.going}
      meterMax={counts.answering}
      meterClassName="bg-success"
      entries={roster.map((member) => {
        const entry = byPlayer.get(member.teamPlayerId);
        const status = entry?.status ?? null;
        return {
          id: member.teamPlayerId,
          firstName: member.firstName,
          // The avatar takes the first letter of this: the initial is enough.
          lastName: member.lastInitial ? `${member.lastInitial}.` : '',
          role: entry?.convoked ? 'Convoqué·e' : teamMemberRoleLabel(member.role),
          statusLabel: eventRsvpStatusLabel(status),
          statusTone: status ? STATUS_TONE[status] : 'secondary',
          filled: status !== null,
        };
      })}
    />
  );
}
