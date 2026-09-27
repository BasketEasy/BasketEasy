import { Badge } from '@basketeasy/ui/badge';
import type { EventTravelMode } from '@basketeasy/types/meeting-points';

const LABEL: Record<EventTravelMode, string> = {
  MEETING_POINT: 'RDV',
  DIRECT: 'Direct',
};

/** How a GOING member gets to the match — renders nothing for anyone else. */
export function TravelModeBadge({ travelMode }: { travelMode: EventTravelMode | null }) {
  if (travelMode === null) return null;
  return (
    <Badge variant="outline" tone="neutral">
      {LABEL[travelMode]}
    </Badge>
  );
}
