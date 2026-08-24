import { useState } from 'react';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Button } from '@basketeasy/ui/button';
import type { EventConvocationRosterEntry } from '@basketeasy/types/events';
import { teamMemberRoleLabel } from './teamLabels';
import { useEventConvocations } from './useEventConvocations';

function initialsOf(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function RosterRow({ entry }: { entry: EventConvocationRosterEntry }) {
  const colorClass = entry.convoked ? 'text-orange-text' : 'text-muted';

  return (
    <div className="flex items-center gap-2.5 border-t border-border p-3 first:border-t-0">
      <Avatar className="h-8 w-8 text-xs">
        <AvatarFallback>{initialsOf(entry.firstName, entry.lastName)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-charcoal">
          {entry.firstName} {entry.lastName}
          {entry.isMe ? ' (vous)' : ''}
        </span>
        <span className="text-xs text-muted">{teamMemberRoleLabel(entry.role)}</span>
      </div>
      <span
        className={`ml-auto flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold ${colorClass}`}
      >
        <span
          className={`h-2 w-2 rounded-full ${entry.convoked ? 'bg-current' : 'border border-current'}`}
        />
        {entry.convoked ? 'Convoqué' : 'Non convoqué'}
      </span>
    </div>
  );
}

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
    <div className="flex flex-col items-start gap-2.5">
      <Button variant="outline" onClick={() => setIsOpen((open) => !open)}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`mr-1.5 h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        {isOpen ? 'Masquer la convocation' : 'Voir la convocation'}
        {roster && (
          <span className="ml-1.5 font-normal text-muted">
            · {convokedCount}/{roster.length} convoqués
          </span>
        )}
      </Button>
      {isOpen && roster && (
        <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-cream shadow-sm">
          {roster.map((entry) => (
            <RosterRow key={entry.teamPlayerId} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
