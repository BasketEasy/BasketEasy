import { describe, expect, it } from 'vitest';
import { eventRsvpAnswerLabel, eventRsvpStatusLabel } from './eventRsvpLabels';

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

describe('eventRsvpAnswerLabel', () => {
  it('reads the answer back in the meter’s own vocabulary', () => {
    expect(eventRsvpAnswerLabel('GOING')).toBe('Oui');
    expect(eventRsvpAnswerLabel('MAYBE')).toBe('Peut-être');
    expect(eventRsvpAnswerLabel('NOT_GOING')).toBe('Non');
  });

  it('names the absence of an answer rather than a fourth answer', () => {
    expect(eventRsvpAnswerLabel(null)).toBe('Sans réponse');
  });
});
