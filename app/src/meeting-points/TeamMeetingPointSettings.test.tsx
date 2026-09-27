import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamMeetingPointSettings } from './TeamMeetingPointSettings';

const inheriting = {
  meetingPoint: null,
  arrivalBufferMinutes: null,
  clubDefaults: {
    clubName: 'BC Nantes',
    meetingPoint: { name: 'Parking club', address: '1 rue du Club' },
    arrivalBufferMinutes: 45,
  },
};

describe('TeamMeetingPointSettings', () => {
  it('marks values inherited from the club', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/meeting-settings', () =>
        HttpResponse.json(inheriting),
      ),
    );
    renderWithProviders(<TeamMeetingPointSettings clubId="club-1" teamId="team-1" />);

    expect(await screen.findByText('Parking club')).toBeInTheDocument();
    expect(screen.getByText('Arrivée à la salle 45 min avant le match')).toBeInTheDocument();
    // Both values come from the club.
    expect(screen.getAllByText('du club')).toHaveLength(2);
    expect(screen.queryByText('propre à l’équipe')).not.toBeInTheDocument();
  });

  it('sends null for what stays inherited, and the team’s own value once chosen', async () => {
    let body: unknown;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/meeting-settings', () =>
        HttpResponse.json(inheriting),
      ),
      http.patch('/api/clubs/club-1/teams/team-1/meeting-settings', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(inheriting);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<TeamMeetingPointSettings clubId="club-1" teamId="team-1" />);
    await user.click(await screen.findByRole('button', { name: 'Modifier' }));

    // Both inherited: the fields they govern are hidden.
    expect(screen.getByRole('radio', { name: /Celui du club/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.queryByLabelText('Nom du lieu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Propre à l’équipe/ }));
    const buffer = screen.getByLabelText('Minutes avant le match');
    await user.clear(buffer);
    await user.type(buffer, '60');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(body).toEqual({ meetingPoint: null, arrivalBufferMinutes: 60 }));
  });
});
