import { describe, expect, it } from 'vitest';
import { eventRsvpStatusLabel } from './eventRsvpLabels';

describe('eventRsvpStatusLabel', () => {
  it('labels each known status in French', () => {
    expect(eventRsvpStatusLabel('GOING')).toBe('Présent');
    expect(eventRsvpStatusLabel('MAYBE')).toBe('Incertain');
    expect(eventRsvpStatusLabel('NOT_GOING')).toBe('Absent');
  });

  it('reads a null status as no response yet', () => {
    expect(eventRsvpStatusLabel(null)).toBe('En attente');
  });
});
