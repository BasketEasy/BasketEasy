import { describe, expect, it } from 'vitest';
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
  recurrenceId: null,
  createdAt: 'x',
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

function renderRow(event: TeamEvent, canManage: boolean) {
  return renderWithProviders(
    <Table>
      <TableBody>
        <EventRow clubId="club-1" teamId="team-1" event={event} canManage={canManage} />
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

  it('does not show a scope select for a non-recurring event', () => {
    renderRow(trainingEvent, true);

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

    await user.click(screen.getByRole('combobox', { name: /appliquer à/i }));
    await user.click(
      await screen.findByRole('option', { name: /tous les événements de la série/i }),
    );
    await user.click(screen.getByRole('button', { name: /^supprimer$/i }));

    await waitFor(() => expect(requestedUrl).toContain('?scope=ALL'));
  });

  it('disables the date input when the edit scope is not THIS', async () => {
    const user = userEvent.setup();
    renderRow(recurringEvent, true);

    await user.click(screen.getByRole('button', { name: /^modifier$/i }));
    await user.click(screen.getByRole('combobox', { name: /appliquer à/i }));
    await user.click(await screen.findByRole('option', { name: /cet événement et les suivants/i }));

    expect(screen.getByLabelText(/date et heure/i)).toBeDisabled();
    expect(
      screen.getByText(/la date ne peut être modifiée que pour cet événement seul/i),
    ).toBeInTheDocument();
  });

  it('submits an edit with the selected scope', async () => {
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
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody).toMatchObject({ type: 'TRAINING', scope: 'THIS' });
  });
});
