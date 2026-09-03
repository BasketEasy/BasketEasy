import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TeamEvent } from '@basketeasy/types/events';
import { EventDetailHero } from './EventDetailHero';

function baseEvent(overrides: Partial<TeamEvent> = {}): TeamEvent {
  return {
    id: 'event-1',
    teamId: 'team-1',
    type: 'MATCH',
    // Local wall-clock, so the rendered day never depends on the runner's TZ.
    startsAt: new Date(2026, 8, 5, 20, 30).toISOString(),
    location: 'Gymnase du Vigneau',
    notes: null,
    opponentName: 'ESB Rezé',
    venue: 'HOME',
    recurrenceId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    myRsvpStatus: null,
    myConvocation: false,
    isImported: false,
    timeConfirmed: true,
    logistics: { jerseys: null, balls: null },
    ...overrides,
  };
}

describe('EventDetailHero', () => {
  it('names the fixture, the venue side and the day for a MATCH', () => {
    render(<EventDetailHero event={baseEvent()} teamName="Seniors Filles 1" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Seniors Filles 1 vs ESB Rezé' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Domicile')).toBeInTheDocument();
    expect(screen.getByText('Samedi 5 septembre 2026')).toBeInTheDocument();
    expect(screen.getByText('20:30')).toBeInTheDocument();
  });

  it('drops the opponent and venue chrome for a TRAINING', () => {
    render(
      <EventDetailHero
        event={baseEvent({ type: 'TRAINING', opponentName: null, venue: null })}
        teamName="Seniors Filles 1"
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Seniors Filles 1 — Entraînement' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Domicile')).not.toBeInTheDocument();
  });

  it('never renders an unconfirmed kickoff as if it were a real time', () => {
    render(<EventDetailHero event={baseEvent({ timeConfirmed: false })} teamName="Seniors F1" />);

    expect(screen.queryByText('20:30')).not.toBeInTheDocument();
    expect(screen.getByText('à confirmer')).toBeInTheDocument();
    expect(screen.getByText('Heure à confirmer')).toBeInTheDocument();
  });
});
