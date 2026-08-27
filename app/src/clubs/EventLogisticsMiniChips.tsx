import { Badge } from '@basketeasy/ui/badge';
import { cn } from '@basketeasy/ui/cn';
import type {
  EventLogisticsAssignee,
  EventLogisticsField,
  TeamEvent,
} from '@basketeasy/types/events';
import { BallIcon, JerseyIcon } from './eventLogisticsIcons';
import { EVENT_LOGISTICS_FIELD_LABEL } from './eventLogisticsLabels';

const FIELD_ICON: Record<EventLogisticsField, typeof JerseyIcon> = {
  JERSEYS: JerseyIcon,
  BALLS: BallIcon,
};

function shortAssigneeName(assignee: EventLogisticsAssignee): string {
  return `${assignee.firstName} ${assignee.lastName.charAt(0)}.`;
}

function LogisticsMiniChip({
  field,
  assignee,
}: {
  field: EventLogisticsField;
  assignee: EventLogisticsAssignee | null;
}) {
  const Icon = FIELD_ICON[field];
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 bg-surface-2 font-semibold',
        assignee ? 'border-border-strong text-charcoal' : 'border-border text-muted',
      )}
    >
      <Icon size={12} className={cn('shrink-0', assignee ? 'text-blue-green' : 'text-muted')} />
      {EVENT_LOGISTICS_FIELD_LABEL[field]} :{' '}
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
 * re-deriving them per call site.
 */
export function EventLogisticsMiniChips({ logistics }: { logistics: TeamEvent['logistics'] }) {
  if (!logistics) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <LogisticsMiniChip field="JERSEYS" assignee={logistics.jerseys} />
      <LogisticsMiniChip field="BALLS" assignee={logistics.balls} />
    </div>
  );
}
