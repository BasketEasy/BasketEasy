import { useState } from 'react';
import { EventRosterBreakdown } from './EventRosterBreakdown';
import { teamMemberRoleLabel } from './teamLabels';
import { useEventConvocations } from './useEventConvocations';
import { useMeSuffix } from '../guardians/useActingAs';

/**
 * Roster-wide convocation breakdown for one event — visible to anyone who
 * can see the event itself (not manager-only), mirroring EventRsvpBreakdown.
 * Collapsed by default; the fetch is lazy, only firing once opened.
 */
export function EventConvocationBreakdown({
  clubId,
  teamId,
  eventId,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: roster, isError, refetch } = useEventConvocations(clubId, teamId, eventId, isOpen);
  const meSuffix = useMeSuffix(teamId);
  const convokedCount = roster?.filter((r) => r.convoked).length ?? 0;

  return (
    <EventRosterBreakdown
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      isError={isError}
      onRetry={() => refetch()}
      openLabel="Masquer la convocation"
      closedLabel="Voir la convocation"
      summary={roster ? `${convokedCount}/${roster.length} convoqués` : undefined}
      meterValue={convokedCount}
      meterMax={roster?.length ?? 0}
      meterTone="brand"
      entries={
        roster?.map((entry) => ({
          id: entry.teamPlayerId,
          firstName: entry.firstName,
          lastName: entry.lastName + (entry.isMe ? meSuffix : ''),
          role: teamMemberRoleLabel(entry.role),
          statusLabel: entry.convoked ? 'Convoqué' : 'Non convoqué',
          statusTone: entry.convoked ? 'brand' : 'secondary',
          filled: entry.convoked,
        })) ?? []
      }
    />
  );
}
