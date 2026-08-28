import { Badge } from '@basketeasy/ui/badge';
import type {
  EventLogisticsAssignee,
  EventLogisticsField,
  EventType,
  TeamEvent,
} from '@basketeasy/types/events';
import { BallIcon, JerseyIcon } from './eventLogisticsIcons';
import { eventLogisticsFieldLabel } from './eventLogisticsLabels';

const FIELD_ICON: Record<EventLogisticsField, typeof JerseyIcon> = {
  JERSEYS: JerseyIcon,
  BALLS: BallIcon,
};

function shortAssigneeName(assignee: EventLogisticsAssignee): string {
  return `${assignee.firstName} ${assignee.lastName.charAt(0)}.`;
}

function LogisticsMiniChip({
  field,
  eventType,
  assignee,
}: {
  field: EventLogisticsField;
  eventType: EventType;
  assignee: EventLogisticsAssignee | null;
}) {
  const Icon = FIELD_ICON[field];
  return (
    <Badge variant="soft" tone={assignee ? 'neutral' : 'muted'} className="gap-1.5">
      <Icon size={12} tone={assignee ? 'structure' : 'secondary'} className="shrink-0" />
      {eventLogisticsFieldLabel(field, eventType)} :{' '}
      {assignee ? `${shortAssigneeName(assignee)} ✓` : 'non assigné'}
    </Badge>
  );
}

/**
 * The agenda card's jersey/ball mini-chip pair (`AgendaCard.dc.html:77-86`)
 * — shared between the table row (EventRow) and card (TeamEventsAgenda)
 * views of the agenda so the assigned/unassigned copy and icon branching
 * lives in one place, matching EventLogisticsSection's conventions
 * ("Non assigné", the check mark on an assigned slot) rather than
 * re-deriving them per call site. Renders for both event types — `eventType`
 * only changes the jersey-slot label ("Maillots" vs "Chasubles"), the
 * assigned/unassigned rendering is identical for both.
 */
export function EventLogisticsMiniChips({
  eventType,
  logistics,
}: {
  eventType: EventType;
  logistics: TeamEvent['logistics'];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <LogisticsMiniChip field="JERSEYS" eventType={eventType} assignee={logistics.jerseys} />
      <LogisticsMiniChip field="BALLS" eventType={eventType} assignee={logistics.balls} />
    </div>
  );
}
