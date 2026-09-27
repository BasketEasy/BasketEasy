import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { TeamEvent } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventEditModal } from './EventEditModal';

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
  meetingPlan: null,
};

const recurringEvent: TeamEvent = {
  ...trainingEvent,
  id: 'event-3',
  recurrenceId: 'series-1',
};

function EventEditModalHarness({ event }: { event: TeamEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <EventEditModal
      clubId="club-1"
      teamId="team-1"
      event={event}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

function renderModal(event: TeamEvent) {
  return renderWithProviders(<EventEditModalHarness event={event} />);
}

describe('EventEditModal', () => {
  it('shows the pre-filled form when opened', async () => {
    const user = userEvent.setup();
    renderModal(trainingEvent);

    await user.click(screen.getByRole('button', { name: /^modifier$/i }));

    expect(
      await screen.findByRole('heading', { name: /modifier l.événement/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/date et heure/i)).toHaveValue('2026-01-05T18:00');
    expect(screen.getByLabelText(/^lieu$/i)).toHaveValue('Gymnase A');
    expect(screen.queryByText('Appliquer à')).not.toBeInTheDocument();
  });

  it('edits startsAt on a non-recurring event and closes on success', async () => {
    let capturedBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json([{ ...trainingEvent, location: 'Gymnase B' }]);
      }),
    );

    const user = userEvent.setup();
    renderModal(trainingEvent);

    await user.click(screen.getByRole('button', { name: /^modifier$/i }));
    await user.clear(screen.getByLabelText(/date et heure/i));
    await user.type(screen.getByLabelText(/date et heure/i), '2026-02-10T19:30');
    await user.clear(screen.getByLabelText(/^lieu$/i));
    await user.type(screen.getByLabelText(/^lieu$/i), 'Gymnase B');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody).toMatchObject({
      type: 'TRAINING',
      location: 'Gymnase B',
      scope: 'THIS',
      startsAt: '2026-02-10T19:30:00.000Z',
    });

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /modifier l.événement/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it('blocks submit when type is switched to MATCH without an opponent name', async () => {
    const user = userEvent.setup();
    renderModal(trainingEvent);

    await user.click(screen.getByRole('button', { name: /^modifier$/i }));
    await user.click(screen.getByRole('combobox', { name: /^type$/i }));
    await user.click(await screen.findByRole('option', { name: /^match$/i }));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByText(/nom de l'adversaire requis/i)).toBeInTheDocument();
  });

  it('recurring event: swaps to a time field for THIS_AND_FUTURE and submits both PATCH requests', async () => {
    let regularBody: unknown;
    let timeBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-3', async ({ request }) => {
        regularBody = await request.json();
        return HttpResponse.json([{ ...recurringEvent, location: 'Gymnase B' }]);
      }),
      http.patch('/api/clubs/club-1/teams/team-1/events/event-3/time', async ({ request }) => {
        timeBody = await request.json();
        return HttpResponse.json([{ ...recurringEvent, location: 'Gymnase B' }]);
      }),
    );

    const user = userEvent.setup();
    renderModal(recurringEvent);

    await user.click(screen.getByRole('button', { name: /^modifier$/i }));
    await user.click(screen.getByRole('combobox', { name: /appliquer à/i }));
    await user.click(await screen.findByRole('option', { name: /cet événement et les suivants/i }));

    // The datetime-local field is swapped for a time-only field.
    expect(screen.queryByLabelText(/date et heure/i)).not.toBeInTheDocument();
    const timeInput = screen.getByLabelText(/^heure$/i);
    expect(timeInput).toHaveValue('18:00');

    await user.clear(timeInput);
    await user.type(timeInput, '20:15');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(regularBody).toBeDefined());
    expect(regularBody).toMatchObject({ type: 'TRAINING', scope: 'THIS_AND_FUTURE' });
    expect(regularBody).not.toHaveProperty('startsAt');

    await waitFor(() => expect(timeBody).toBeDefined());
    expect(timeBody).toMatchObject({ scope: 'THIS_AND_FUTURE', hour: 20, minute: 15 });
  });
});
