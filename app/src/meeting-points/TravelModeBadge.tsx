import { Badge } from '@basketeasy/ui/badge';
import type { EventTravelMode } from '@basketeasy/types/meeting-points';

const LABEL: Record<EventTravelMode, string> = {
  MEETING_POINT: 'RDV',
  DIRECT: 'Direct',
};

/**
 * How a GOING member gets to the match — renders nothing for anyone else.
 * The meeting point is the group's default, so it carries the structure
 * tint; « Direct » is the exception and stays an outline. `time` appends
 * the hour that person is expected (« RDV 19:15 »), for the manager's table.
 */
export function TravelModeBadge({
  travelMode,
  time,
}: {
  travelMode: EventTravelMode | null;
  time?: string | null;
}) {
  if (travelMode === null) return null;
  const label = time ? `${LABEL[travelMode]} ${time}` : LABEL[travelMode];
  return travelMode === 'MEETING_POINT' ? (
    <Badge variant="soft" tone="structure" className="tabular">
      {label}
    </Badge>
  ) : (
    <Badge variant="outline" tone="neutral" className="tabular">
      {label}
    </Badge>
  );
}
