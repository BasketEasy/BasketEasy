import { useState } from 'react';
import { EventRosterBreakdown } from './EventRosterBreakdown';
import { teamMemberRoleLabel } from './teamLabels';
import { useEventConvocations } from './useEventConvocations';

/**
 * Roster-wide convocation breakdown for one event — visible to anyone who
 * can see the event itself (not manager-only), mirroring EventRsvpBreakdown.
 * Collapsed by default; the fetch is lazy, only firing once opened.
 */
export function EventConvocationBreakdown({
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
  const { data: roster } = useEventConvocations(clubId, teamId, eventId, isOpen);
  const convokedCount = roster?.filter((r) => r.convoked).length ?? 0;

  return (
    <EventRosterBreakdown
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      openLabel="Masquer la convocation"
      closedLabel="Voir la convocation"
      summary={roster ? `${convokedCount}/${roster.length} convoqués` : undefined}
      meterValue={convokedCount}
      meterMax={roster?.length ?? 0}
      meterClassName="bg-orange"
      entries={
        roster?.map((entry) => ({
          id: entry.teamPlayerId,
          firstName: entry.firstName,
          lastName: entry.lastName + (entry.isMe ? ' (vous)' : ''),
          role: teamMemberRoleLabel(entry.role),
          statusLabel: entry.convoked ? 'Convoqué' : 'Non convoqué',
          statusClassName: entry.convoked ? 'text-orange-text' : 'text-muted',
          filled: entry.convoked,
        })) ?? []
      }
    />
  );
}
