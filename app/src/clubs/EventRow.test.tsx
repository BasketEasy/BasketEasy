import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Table, TableBody } from '@basketeasy/ui/table';
import type { TeamEvent } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventRow } from './EventRow';

const trainingEvent: TeamEvent = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'TRAINING',
  startsAt: '2026-01-05T18:00:00.000Z',
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
  logistics: { jerseys: null, balls: null },
};

const matchEvent: TeamEvent = {
  ...trainingEvent,
  id: 'event-2',
  type: 'MATCH',
  opponentName: 'US Saint-Nazaire',
};

const recurringEvent: TeamEvent = {
  ...trainingEvent,
  id: 'event-3',
  recurrenceId: 'series-1',
};

function renderRow(event: TeamEvent, canManage: boolean, isRostered = false) {
  return renderWithProviders(
    <Table>
      <TableBody>
        <EventRow
          clubId="club-1"
          teamId="team-1"
          event={event}
          canManage={canManage}
          isRostered={isRostered}
        />
      </TableBody>
    </Table>,
  );
}

describe('EventRow', () => {
  it('shows the type label and no opponent for a training event', () => {
    renderRow(trainingEvent, false);

    expect(screen.getByText('Entraînement')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument();
  });

  it('shows the opponent for a match event', () => {
    renderRow(matchEvent, false);

    expect(screen.getByText('Match')).toBeInTheDocument();
    expect(screen.getByText('vs US Saint-Nazaire')).toBeInTheDocument();
  });

  it('links a match event to its detail page and shows the venue badge, never for a training event', () => {
    renderRow(trainingEvent, false);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Domicile')).not.toBeInTheDocument();

    const homeMatch: TeamEvent = { ...matchEvent, venue: 'HOME' };
    renderRow(homeMatch, false);
    expect(screen.getByText('Domicile')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /vs US Saint-Nazaire/i })).toHaveAttribute(
      'href',
      '/clubs/club-1/teams/team-1/events/event-2',
    );
  });

  it('shows the jersey/ball mini-chips for both event types, with a type-aware jersey-slot label', () => {
    const trainingWithLogistics: TeamEvent = {
      ...trainingEvent,
      logistics: {
        jerseys: { teamPlayerId: 'tp-1', firstName: 'Léa', lastName: 'Martin' },
        balls: null,
      },
    };
    renderRow(trainingWithLogistics, false);
    expect(screen.getByText(/Chasubles : Léa M\. ✓/)).toBeInTheDocument();
    expect(screen.getByText(/Ballons : non assigné/)).toBeInTheDocument();

    const matchWithLogistics: TeamEvent = {
      ...matchEvent,
      logistics: {
        jerseys: { teamPlayerId: 'tp-1', firstName: 'Léa', lastName: 'Martin' },
        balls: null,
      },
    };
    renderRow(matchWithLogistics, false);
    expect(screen.getByText(/Maillots : Léa M\. ✓/)).toBeInTheDocument();
  });

  describe('the "Votes ouverts" badge', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-08T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows for a past match still inside the vote window, never for a training event', () => {
      renderRow(matchEvent, false);
      expect(screen.getByText(/votes ouverts/i)).toBeInTheDocument();

      renderRow(trainingEvent, false);
      expect(screen.queryAllByText(/votes ouverts/i)).toHaveLength(1);
    });
  });

  it('does not show a scope select in the delete confirmation for a non-recurring event', async () => {
    const user = userEvent.setup();
    renderRow(trainingEvent, true);

    await user.click(screen.getByRole('button', { name: /^supprimer$/i }));

    expect(
      await screen.findByRole('heading', { name: /supprimer l.événement/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Appliquer à')).not.toBeInTheDocument();
  });

  it('shows a delete scope select for a recurring event and passes it through', async () => {
    let requestedUrl: string | undefined;
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/events/event-3', ({ request }) => {
        requestedUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderRow(recurringEvent, true);

    await user.click(screen.getByRole('button', { name: /^supprimer$/i }));
    await user.click(screen.getByRole('combobox', { name: /appliquer à/i }));
    await user.click(
      await screen.findByRole('option', { name: /tous les événements de la série/i }),
    );
    await user.click(screen.getByRole('button', { name: /confirmer la suppression/i }));

    await waitFor(() => expect(requestedUrl).toContain('?scope=ALL'));
  });

  it('opens the edit modal and submits the default (THIS) scope', async () => {
    let capturedBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-3', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json([{ ...recurringEvent, location: 'Gymnase B' }]);
      }),
    );

    const user = userEvent.setup();
    renderRow(recurringEvent, true);

    await user.click(screen.getByRole('button', { name: /^modifier$/i }));
    expect(
      await screen.findByRole('heading', { name: /modifier l.événement/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody).toMatchObject({ type: 'TRAINING', scope: 'THIS' });
  });

  it('shows the RSVP control only when the viewer is rostered on the team, and the breakdown always', () => {
    renderRow(trainingEvent, false, false);

    expect(screen.queryByRole('button', { name: /présent/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voir les réponses/i })).toBeInTheDocument();
  });

  it('shows the RSVP control when the viewer is rostered on the team', () => {
    renderRow(trainingEvent, false, true);

    expect(screen.getByRole('button', { name: /présent/i })).toBeInTheDocument();
  });

  it('hides the convocation manage button for a viewer who cannot manage the team, and shows the breakdown always', () => {
    renderRow(trainingEvent, false);

    expect(screen.queryByRole('button', { name: /gérer la convocation/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voir la convocation/i })).toBeInTheDocument();
  });

  it('shows the convocation manage button for a manager', () => {
    renderRow(trainingEvent, true);

    expect(screen.getByRole('button', { name: /gérer la convocation/i })).toBeInTheDocument();
  });

  it('shows the "Convoqué par le coach" badge only when the viewer is rostered and convoked', () => {
    renderRow(trainingEvent, false, false);
    expect(screen.queryByText('Convoqué par le coach')).not.toBeInTheDocument();

    const convokedEvent: TeamEvent = { ...trainingEvent, myConvocation: true };
    renderRow(convokedEvent, false, true);
    expect(screen.getByText('Convoqué par le coach')).toBeInTheDocument();
  });

  it('shows an "Importé" badge next to the type for an imported event, never for a manual one', () => {
    renderRow(trainingEvent, false);
    expect(screen.queryByText('Importé')).not.toBeInTheDocument();

    const importedEvent: TeamEvent = { ...matchEvent, isImported: true };
    renderRow(importedEvent, false);
    expect(screen.getByText('Importé')).toBeInTheDocument();
  });

  it('shows the date only plus a "Heure à confirmer" badge, never the raw time, when the kickoff is unconfirmed', () => {
    const tbdEvent: TeamEvent = { ...matchEvent, isImported: true, timeConfirmed: false };
    renderRow(tbdEvent, false);

    expect(screen.getByText('Heure à confirmer')).toBeInTheDocument();
    expect(screen.queryByText('00:00')).not.toBeInTheDocument();
  });
});
