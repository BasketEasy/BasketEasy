import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import { buildTemplateVars, type ShareEvent } from './whatsapp-template-vars';

const match: ShareEvent = {
  type: 'MATCH',
  // 15:30 in Paris (CEST, UTC+2)
  startsAt: new Date('2026-10-04T13:30:00Z'),
  timeConfirmed: true,
  location: 'Gymnase de la Durantière',
  opponentName: 'ES Vertou',
};

function plan(overrides: Partial<EventMeetingPlan> = {}): EventMeetingPlan {
  return {
    arrivalAt: '2026-10-04T12:45:00Z',
    arrivalBufferMinutes: 45,
    meetingPoint: { name: 'Parking du club', address: '1 rue X' },
    meetingPointSource: 'TEAM',
    defaultMeetingPoint: null,
    defaultMeetingPointSource: null,
    travelMinutes: 30,
    travelMinutesSource: 'COMPUTED',
    meetsAt: '2026-10-04T12:15:00Z',
    meetsAtSource: 'COMPUTED',
    ...overrides,
  };
}

describe('buildTemplateVars', () => {
  it('formats a match with a known RDV in Europe/Paris', () => {
    expect(buildTemplateVars(match, 'U15 F1', plan(), 'https://k.test/r/abc')).toEqual({
      event_name: 'Match contre ES Vertou',
      opponent: 'ES Vertou',
      event_date: expect.stringContaining('oct.'),
      meeting_time: '14:15',
      meeting_place: 'Parking du club',
      event_time: '15:30',
      location: 'Gymnase de la Durantière',
      team_name: 'U15 F1',
      link: 'https://k.test/r/abc?src=wa',
    });
  });

  it('formats in winter time across the DST change', () => {
    const vars = buildTemplateVars(
      { ...match, startsAt: new Date('2026-11-07T14:30:00Z') },
      'U15 F1',
      null,
      'u',
    );
    expect(vars.event_time).toBe('15:30');
  });

  it('says « horaire à confirmer » for an unconfirmed kick-off, never 00:00', () => {
    const vars = buildTemplateVars(
      { ...match, startsAt: new Date('2026-10-03T22:00:00Z'), timeConfirmed: false },
      'T',
      null,
      'u',
    );
    expect(vars.event_time).toBe('horaire à confirmer');
  });

  it('keeps the RDV line when the place is known and the time is not', () => {
    const vars = buildTemplateVars(match, 'T', plan({ meetsAt: null }), 'u');
    expect(vars.meeting_place).toBe('Parking du club');
    expect(vars.meeting_time).toBe('heure à confirmer');
  });

  it('falls back to the address when the place has no name', () => {
    const vars = buildTemplateVars(
      match,
      'T',
      plan({ meetingPoint: { name: '', address: '1 rue X' } }),
      'u',
    );
    expect(vars.meeting_place).toBe('1 rue X');
  });

  it('leaves the RDV empty with no place resolved', () => {
    const vars = buildTemplateVars(match, 'T', plan({ meetingPoint: null }), 'u');
    expect(vars.meeting_place).toBeNull();
    expect(vars.meeting_time).toBeNull();
  });

  it('has no opponent and no RDV for a training', () => {
    const vars = buildTemplateVars(
      { ...match, type: 'TRAINING', opponentName: null },
      'T',
      null,
      'u',
    );
    expect(vars).toMatchObject({
      event_name: 'Entraînement',
      opponent: null,
      meeting_time: null,
      meeting_place: null,
    });
  });
});
