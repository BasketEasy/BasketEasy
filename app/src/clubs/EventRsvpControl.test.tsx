import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { TeamEvent } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventRsvpControl } from './EventRsvpControl';

const baseEvent: TeamEvent = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'TRAINING',
  startsAt: '2026-01-05T18:00:00.000Z',
  location: 'Gymnase A',
  notes: null,
  opponentName: null,
  recurrenceId: null,
  createdAt: 'x',
  myRsvpStatus: null,
  myConvocation: false,
};

describe('EventRsvpControl', () => {
  it('exposes the selected response to assistive tech, not just by colour', () => {
    renderWithProviders(
      <EventRsvpControl
        clubId="club-1"
        teamId="team-1"
        event={{ ...baseEvent, myRsvpStatus: 'GOING' }}
      />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Ma réponse' });
    expect(within(group).getByRole('radio', { name: 'Présent' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Absent' })).not.toBeChecked();
  });

  it('highlights the current status as pressed', () => {
    renderWithProviders(
      <EventRsvpControl
        clubId="club-1"
        teamId="team-1"
        event={{ ...baseEvent, myRsvpStatus: 'GOING' }}
      />,
    );

    expect(screen.getByRole('radio', { name: /présent/i })).toHaveClass('bg-success');
    expect(screen.getByRole('radio', { name: /absent/i })).not.toHaveClass('bg-error');
  });

  it('sets a new status when a different option is clicked', async () => {
    let requestBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/rsvp', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ ...baseEvent, myRsvpStatus: 'GOING' });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<EventRsvpControl clubId="club-1" teamId="team-1" event={baseEvent} />);

    await user.click(screen.getByRole('radio', { name: /présent/i }));

    await waitFor(() => expect(requestBody).toEqual({ status: 'GOING' }));
  });

  it('clears the status when the already-active option is clicked again', async () => {
    let cleared = false;
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/events/event-1/rsvp', () => {
        cleared = true;
        return HttpResponse.json({ ...baseEvent, myRsvpStatus: null });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <EventRsvpControl
        clubId="club-1"
        teamId="team-1"
        event={{ ...baseEvent, myRsvpStatus: 'MAYBE' }}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /incertain/i }));

    await waitFor(() => expect(cleared).toBe(true));
  });

  it('shows an error message when the request fails', async () => {
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/rsvp', () =>
        HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<EventRsvpControl clubId="club-1" teamId="team-1" event={baseEvent} />);

    await user.click(screen.getByRole('radio', { name: /absent/i }));

    expect(await screen.findByText(/une erreur est survenue/i)).toBeInTheDocument();
  });
});
