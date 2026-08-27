import type { EventLogisticsField, EventType } from '@basketeasy/types/events';

/**
 * The "jerseys" slot is labeled differently by event type: "Maillots" for a
 * MATCH (the team's match jerseys) vs "Chasubles" for a TRAINING (the
 * scrimmage bibs/pinnies used to split practice teams into two sides — a
 * genuinely different physical item, not a cosmetic relabel). The "balls"
 * slot is identical copy for both types.
 */
export function eventLogisticsFieldLabel(field: EventLogisticsField, eventType: EventType): string {
  if (field === 'BALLS') {
    return 'Ballons';
  }
  return eventType === 'MATCH' ? 'Maillots' : 'Chasubles';
}

/** The supporting question shown under the field label — same per-type split as the label above. */
export function eventLogisticsFieldQuestion(
  field: EventLogisticsField,
  eventType: EventType,
): string {
  if (field === 'BALLS') {
    return "Qui apporte les ballons d'échauffement ?";
  }
  return eventType === 'MATCH' ? 'Qui apporte le jeu de maillots ?' : 'Qui apporte les chasubles ?';
}
