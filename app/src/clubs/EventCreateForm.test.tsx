import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventCreateForm } from './EventCreateForm';

describe('EventCreateForm', () => {
  it('shows validation errors and does not submit when fields are empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EventCreateForm clubId="club-1" teamId="team-1" />);

    await user.click(screen.getByRole('button', { name: /créer l'événement/i }));

    expect(await screen.findByText(/date requise/i)).toBeInTheDocument();
    expect(screen.getByText(/lieu requis/i)).toBeInTheDocument();
  });

  it('submits the event, clears the fields, and calls onSuccess', async () => {
    let createCalled = false;
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/events', async ({ request }) => {
        createCalled = true;
        const body = (await request.json()) as { startsAt: string; location: string };
        return HttpResponse.json({
          id: 'event-1',
          teamId: 'team-1',
          startsAt: body.startsAt,
          location: body.location,
          notes: null,
          createdAt: '2026-01-01',
        });
      }),
    );

    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<EventCreateForm clubId="club-1" teamId="team-1" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/date et heure/i), '2026-01-05T18:00');
    await user.type(screen.getByLabelText(/^lieu$/i), 'Gymnase A');
    await user.click(screen.getByRole('button', { name: /créer l'événement/i }));

    await waitFor(() => expect(createCalled).toBe(true));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows a submit-level error on a server failure', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/events', () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<EventCreateForm clubId="club-1" teamId="team-1" />);

    await user.type(screen.getByLabelText(/date et heure/i), '2026-01-05T18:00');
    await user.type(screen.getByLabelText(/^lieu$/i), 'Gymnase A');
    await user.click(screen.getByRole('button', { name: /créer l'événement/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/erreur est survenue/i);
  });
});
