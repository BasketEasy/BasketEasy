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

    expect(await screen.findByText('Parking club · 1 rue du Club (club)')).toBeInTheDocument();
    expect(screen.getByText('Arrivée 45 min avant le match (club)')).toBeInTheDocument();
  });

  it('sends null for what stays inherited, and the fields once unchecked', async () => {
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
    expect(screen.queryByLabelText('Nom du lieu')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/Utiliser le délai du club/));
    const buffer = screen.getByLabelText('Arrivée avant le match (minutes)');
    await user.clear(buffer);
    await user.type(buffer, '60');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(body).toEqual({ meetingPoint: null, arrivalBufferMinutes: 60 }));
  });
});
