import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import type { TeamEvent } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventDeleteModal } from './EventDeleteModal';

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
  logistics: { jerseys: null, balls: null },
  result: null,
  myMatchStats: null,
};

const recurringEvent: TeamEvent = {
  ...trainingEvent,
  id: 'event-3',
  recurrenceId: 'series-1',
};

function renderModal(event: TeamEvent) {
  return renderWithProviders(
    <>
      <EventDeleteModal clubId="club-1" teamId="team-1" event={event} />
      <Toaster />
    </>,
  );
}

describe('EventDeleteModal', () => {
  it('confirms deletion of a non-recurring event with no scope selector', async () => {
    let requestedUrl: string | undefined;
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/events/event-1', ({ request }) => {
        requestedUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderModal(trainingEvent);

    await user.click(screen.getByRole('button', { name: /^supprimer$/i }));
    expect(
      await screen.findByRole('heading', { name: /supprimer l.événement/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Appliquer à')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirmer la suppression/i }));

    await waitFor(() => expect(requestedUrl).toBeDefined());
    expect(requestedUrl).not.toContain('scope=');
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /supprimer l.événement/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it('cancels without calling the API', async () => {
    let called = false;
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/events/event-1', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderModal(trainingEvent);

    await user.click(screen.getByRole('button', { name: /^supprimer$/i }));
    await user.click(screen.getByRole('button', { name: /^annuler$/i }));

    expect(
      screen.queryByRole('heading', { name: /supprimer l.événement/i }),
    ).not.toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('shows a scope selector for a recurring event and includes it in the delete request', async () => {
    let requestedUrl: string | undefined;
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/events/event-3', ({ request }) => {
        requestedUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderModal(recurringEvent);

    await user.click(screen.getByRole('button', { name: /^supprimer$/i }));
    await user.click(screen.getByRole('combobox', { name: /appliquer à/i }));
    await user.click(await screen.findByRole('option', { name: /cet événement et les suivants/i }));
    await user.click(screen.getByRole('button', { name: /confirmer la suppression/i }));

    await waitFor(() => expect(requestedUrl).toContain('?scope=THIS_AND_FUTURE'));
  });

  it('shows an error and keeps the modal open when the delete fails', async () => {
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/events/event-1', () =>
        HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderModal(trainingEvent);

    await user.click(screen.getByRole('button', { name: /^supprimer$/i }));
    await user.click(screen.getByRole('button', { name: /confirmer la suppression/i }));

    expect(await screen.findByText(/une erreur est survenue/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /supprimer l.événement/i })).toBeInTheDocument();
  });
});
