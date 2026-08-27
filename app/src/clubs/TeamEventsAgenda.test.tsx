import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { TeamEvent } from '@basketeasy/types/events';
import { renderWithProviders } from '../testUtils';
import { TeamEventsAgenda } from './TeamEventsAgenda';

const trainingEvent: TeamEvent = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'TRAINING',
  startsAt: '2026-08-12T18:00:00.000Z',
  location: 'Gymnase A',
  notes: null,
  opponentName: null,
  venue: null,
  recurrenceId: null,
  createdAt: 'x',
  myRsvpStatus: null,
  isImported: false,
  timeConfirmed: true,
  myConvocation: false,
  logistics: null,
};

const matchEventSameDay: TeamEvent = {
  ...trainingEvent,
  id: 'event-2',
  type: 'MATCH',
  startsAt: '2026-08-12T20:00:00.000Z',
  opponentName: 'US Saint-Nazaire',
};

const eventNextDay: TeamEvent = {
  ...trainingEvent,
  id: 'event-3',
  startsAt: '2026-08-13T18:00:00.000Z',
};

function renderAgenda(events: TeamEvent[], canManage: boolean, isRostered = false) {
  return renderWithProviders(
    <TeamEventsAgenda
      clubId="club-1"
      teamId="team-1"
      events={events}
      canManage={canManage}
      isRostered={isRostered}
    />,
  );
}

describe('TeamEventsAgenda', () => {
  it('groups events by day, one heading per calendar day', () => {
    renderAgenda([trainingEvent, matchEventSameDay, eventNextDay], false);

    // Two distinct days across three events — one heading each, not three.
    expect(screen.getByText(/12 août/i)).toBeInTheDocument();
    expect(screen.getByText(/13 août/i)).toBeInTheDocument();
  });

  it('shows the type, time, location, and opponent for each event', () => {
    renderAgenda([trainingEvent, matchEventSameDay], false);

    // Abbreviated in the agenda card's narrow time-block column — the full
    // "Entraînement" is used everywhere else (table view, dropdowns).
    expect(screen.getByText('Entraîn.')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
    expect(screen.getAllByText('Gymnase A')[0]).toBeInTheDocument();

    expect(screen.getByText('Match')).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
    expect(screen.getByText(/vs US Saint-Nazaire/)).toBeInTheDocument();
  });

  it('links a match event to its detail page and shows the venue badge, never for a training event', () => {
    renderAgenda([trainingEvent], false);
    expect(screen.queryByRole('link', { name: /voir le match/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Domicile')).not.toBeInTheDocument();

    const homeMatch: TeamEvent = { ...matchEventSameDay, venue: 'HOME' };
    renderAgenda([homeMatch], false);
    expect(screen.getByText('Domicile')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voir le match/i })).toHaveAttribute(
      'href',
      '/clubs/club-1/teams/team-1/events/event-2',
    );
  });

  it('shows the jersey/ball mini-chips for a match with logistics, never for a training event', () => {
    renderAgenda([trainingEvent], false);
    expect(screen.queryByText(/Maillots :/)).not.toBeInTheDocument();

    const matchWithLogistics: TeamEvent = {
      ...matchEventSameDay,
      logistics: {
        jerseys: { teamPlayerId: 'tp-1', firstName: 'Léa', lastName: 'Martin' },
        balls: null,
      },
    };
    renderAgenda([matchWithLogistics], false);
    expect(screen.getByText(/Maillots : Léa M\. ✓/)).toBeInTheDocument();
    expect(screen.getByText(/Ballons : non assigné/)).toBeInTheDocument();
  });

  it('hides edit/delete actions for a viewer who cannot manage the team', () => {
    renderAgenda([trainingEvent], false);

    expect(screen.queryByRole('button', { name: /^modifier$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument();
  });

  it('shows edit/delete actions for a manager', () => {
    renderAgenda([trainingEvent], true);

    expect(screen.getByRole('button', { name: /^modifier$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^supprimer$/i })).toBeInTheDocument();
  });

  it('shows the RSVP control only when the viewer is rostered on the team, and the breakdown always', () => {
    renderAgenda([trainingEvent], false, false);

    expect(screen.queryByRole('button', { name: /présent/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voir les réponses/i })).toBeInTheDocument();
  });

  it('shows the RSVP control when the viewer is rostered on the team', () => {
    renderAgenda([trainingEvent], false, true);

    expect(screen.getByRole('button', { name: /présent/i })).toBeInTheDocument();
  });

  it('hides the convocation manage button for a viewer who cannot manage the team, and shows the breakdown always', () => {
    renderAgenda([trainingEvent], false);

    expect(screen.queryByRole('button', { name: /gérer la convocation/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voir la convocation/i })).toBeInTheDocument();
  });

  it('shows the convocation manage button for a manager', () => {
    renderAgenda([trainingEvent], true);

    expect(screen.getByRole('button', { name: /gérer la convocation/i })).toBeInTheDocument();
  });

  it('shows the "Convoqué" badge only when the viewer is rostered and convoked', () => {
    renderAgenda([trainingEvent], false, false);
    expect(screen.queryByText('Convoqué')).not.toBeInTheDocument();

    const convokedEvent: TeamEvent = { ...trainingEvent, myConvocation: true };
    renderAgenda([convokedEvent], false, true);
    expect(screen.getByText('Convoqué')).toBeInTheDocument();
  });

  it('shows an "Importé" badge for an imported event, never for a manual one', () => {
    renderAgenda([trainingEvent], false);
    expect(screen.queryByText('Importé')).not.toBeInTheDocument();

    const importedEvent: TeamEvent = { ...matchEventSameDay, isImported: true };
    renderAgenda([importedEvent], false);
    expect(screen.getByText('Importé')).toBeInTheDocument();
  });

  it('replaces the time-block numeral with "à confirmer" and shows the badge when the kickoff is unconfirmed, keeping the solid MATCH fill', () => {
    const tbdEvent: TeamEvent = { ...matchEventSameDay, isImported: true, timeConfirmed: false };
    renderAgenda([tbdEvent], false);

    expect(screen.getByText('à confirmer')).toBeInTheDocument();
    expect(screen.getByText('Heure à confirmer')).toBeInTheDocument();
    expect(screen.queryByText('20:00')).not.toBeInTheDocument();
  });
});
