import { Badge } from '@basketeasy/ui/badge';
import type { EventVenue } from '@basketeasy/types/events';
import { eventVenueLabel } from './eventLabels';

/**
 * Domicile/Extérieur badge for a MATCH event — shared by the match detail
 * hero and the agenda card so both surfaces render the identical tint/icon
 * treatment (per docs/superpowers/specs/assets/2026-08-27-match-interface/
 * AgendaCard.dc.html and Main.dc.html) instead of re-deriving it per call site.
 */
export function EventVenueBadge({ venue }: { venue: EventVenue }) {
  if (venue === 'HOME') {
    return (
      <Badge variant="soft" tone="structure" className="gap-1">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3 shrink-0"
        >
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M6 10v9h12v-9" />
        </svg>
        {eventVenueLabel('HOME')}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" tone="neutral">
      {eventVenueLabel('AWAY')}
    </Badge>
  );
}
