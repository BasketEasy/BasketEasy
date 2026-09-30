import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { TeamEvent } from '@basketeasy/types/events';
import { renderWithProviders } from '../testUtils';
import { EventDetailHero } from './EventDetailHero';

function renderHero(event: TeamEvent, { canManage = false, teamName = 'Seniors Filles 1' } = {}) {
  return renderWithProviders(
    <EventDetailHero
      clubId="club-1"
      teamId="team-1"
      event={event}
      teamName={teamName}
      canManage={canManage}
    />,
  );
}

function baseEvent(overrides: Partial<TeamEvent> = {}): TeamEvent {
  return {
    id: 'event-1',
    teamId: 'team-1',
    type: 'MATCH',
    // Local wall-clock, so the rendered day never depends on the runner's TZ.
    startsAt: new Date(2026, 8, 5, 20, 30).toISOString(),
    location: 'Gymnase du Vigneau',
    locationName: null,
    notes: null,
    opponentName: 'ESB Rezé',
    venue: 'HOME',
    recurrenceId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    myRsvpStatus: null,
    myRsvpRespondedBy: null,
    myRsvpRespondedAt: null,
    myConvocation: false,
    rsvpSummary: {
      rosterSize: 0,
      convoked: 0,
      answering: 0,
      going: 0,
      maybe: 0,
      notGoing: 0,
      pending: 0,
      isConvocationScoped: false,
    },
    isImported: false,
    timeConfirmed: true,
    logistics: { jerseys: null, balls: null },
    result: null,
    myMatchStats: null,
    meetingPlan: null,
    whatsAppShare: null,
    whatsAppSettings: null,
    myTravelMode: null,
    ...overrides,
  };
}

describe('EventDetailHero', () => {
  it('names the fixture, the venue side and the day for a MATCH', () => {
    renderHero(baseEvent());

    expect(screen.getByRole('heading', { level: 1, name: 'vs ESB Rezé' })).toBeInTheDocument();
    expect(screen.getByText('Seniors Filles 1')).toBeInTheDocument();
    expect(screen.getByText('Domicile')).toBeInTheDocument();
    expect(screen.getByText('Samedi 5 septembre 2026 · 20:30')).toBeInTheDocument();
    expect(screen.queryByText('Importé')).not.toBeInTheDocument();
  });

  it('drops the opponent and venue chrome for a TRAINING', () => {
    renderHero(baseEvent({ type: 'TRAINING', opponentName: null, venue: null }));

    expect(screen.getByRole('heading', { level: 1, name: 'Entraînement' })).toBeInTheDocument();
    expect(screen.queryByText('Domicile')).not.toBeInTheDocument();
  });

  it('never renders an unconfirmed kickoff as if it were a real time', () => {
    renderHero(baseEvent({ timeConfirmed: false }), { teamName: 'Seniors F1' });

    expect(screen.queryByText(/20:30|00:00/)).not.toBeInTheDocument();
    expect(screen.getByText(/· heure à confirmer$/)).toBeInTheDocument();
    expect(screen.getByText('Heure à confirmer')).toBeInTheDocument();
  });

  it('flags an imported event', () => {
    renderHero(baseEvent({ isImported: true }));
    expect(screen.getByText('Importé')).toBeInTheDocument();
  });

  describe('venue', () => {
    it('reads as the gym name over its address, with directions', () => {
      renderHero(
        baseEvent({ location: '12 rue du Vigneau, Rezé', locationName: 'Gymnase du Vigneau' }),
      );

      expect(screen.getByText('Gymnase du Vigneau')).toBeInTheDocument();
      expect(screen.getByText('12 rue du Vigneau, Rezé')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /itinéraire/i })).toHaveAttribute(
        'href',
        expect.stringContaining(encodeURIComponent('12 rue du Vigneau, Rezé')),
      );
    });

    it('falls back to the address when no name was given', () => {
      renderHero(baseEvent());
      expect(screen.getByText('Gymnase du Vigneau')).toBeInTheDocument();
    });

    it('offers a manager « Modifier le lieu » on a known venue', () => {
      renderHero(baseEvent(), { canManage: true });
      expect(screen.getByRole('button', { name: 'Modifier le lieu' })).toBeInTheDocument();
    });

    it('offers a manager « Ajouter le lieu » when the venue is unknown, with no directions', () => {
      renderHero(baseEvent({ location: 'Lieu non communiqué' }), { canManage: true });

      expect(screen.getByText('Lieu non communiqué')).toBeInTheDocument();
      expect(screen.getByText('Les joueurs ne savent pas encore où aller.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ajouter le lieu' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /itinéraire/i })).not.toBeInTheDocument();
    });

    it('shows a player the venue without an edit button', () => {
      renderHero(baseEvent({ location: 'Lieu non communiqué' }));

      expect(screen.getByText('Lieu non communiqué')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /lieu/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /itinéraire/i })).not.toBeInTheDocument();
    });

    it('keeps editing a training in the edit modal, not here', () => {
      renderHero(baseEvent({ type: 'TRAINING', opponentName: null, venue: null }), {
        canManage: true,
      });
      expect(screen.queryByRole('button', { name: /lieu/i })).not.toBeInTheDocument();
    });
  });
});
