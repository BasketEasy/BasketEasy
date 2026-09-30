import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import { WHATSAPP_TEMPLATE_EXAMPLES } from '@basketeasy/types/whatsapp-reminder';
import { buildTemplateVars, diffVars, toSnapshot, type ShareEvent } from './whatsapp-template-vars';

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

describe('link handling', () => {
  it('has no link at all when there is none to carry', () => {
    expect(buildTemplateVars(match, 'T', null, null).link).toBeNull();
  });

  it('nulls the link in a snapshot, keeping everything else', () => {
    const vars = buildTemplateVars(match, 'T', null, 'https://k.test/r/abc');
    expect(toSnapshot(vars)).toEqual({ ...vars, link: null });
  });
});

describe('diffVars', () => {
  const before = WHATSAPP_TEMPLATE_EXAMPLES.MATCH;

  it('lists what moved, old value first, by label', () => {
    expect(diffVars(before, { ...before, event_time: '16:00', meeting_time: '15:00' })).toEqual([
      { label: 'Heure de début', from: '15:30', to: '16:00' },
      { label: 'Heure de RDV', from: '14:30', to: '15:00' },
    ]);
  });

  it('says « aucun » for a value that appeared or vanished', () => {
    expect(diffVars(before, { ...before, meeting_place: null, meeting_time: null })).toEqual([
      { label: 'Heure de RDV', from: '14:30', to: 'aucun' },
      { label: 'Lieu de RDV', from: 'Parking du club', to: 'aucun' },
    ]);
    expect(diffVars({}, before).length).toBeGreaterThan(0);
  });

  it('ignores the link, which is not part of what the group reads', () => {
    expect(diffVars(before, { ...before, link: 'https://other' })).toEqual([]);
  });

  it('lists a team rename, since contentKey counts it as a change', () => {
    expect(diffVars(before, { ...before, team_name: 'Autre' })).toEqual([
      { label: 'Équipe', from: before.team_name, to: 'Autre' },
    ]);
  });

  it('is empty for an identical message', () => {
    expect(diffVars(before, before)).toEqual([]);
  });
});
