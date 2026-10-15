import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamAdminAddForm } from './TeamAdminAddForm';

const candidates = [
  { userId: 'user-2', email: 'a@b.com', firstName: 'Alex', lastName: 'Dupont' },
  { userId: 'user-3', email: 'nobody@example.com', firstName: null, lastName: null },
];

describe('TeamAdminAddForm', () => {
  it('lists candidates in the dropdown and submits the selected member', async () => {
    let capturedBody: unknown;
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/admins', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          userId: 'user-2',
          email: 'a@b.com',
          teamId: 'team-1',
          createdAt: '2026-01-02',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <TeamAdminAddForm clubId="club-1" teamId="team-1" candidates={candidates} />,
    );

    await user.click(screen.getByRole('combobox', { name: /membre/i }));
    await user.click(await screen.findByRole('option', { name: /alex dupont/i }));
    await user.click(screen.getByRole('button', { name: /ajouter/i }));

    await waitFor(() => expect(capturedBody).toEqual({ userId: 'user-2' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falls back to the email when the candidate has no name', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TeamAdminAddForm clubId="club-1" teamId="team-1" candidates={candidates} />,
    );

    await user.click(screen.getByRole('combobox', { name: /membre/i }));

    expect(await screen.findByRole('option', { name: 'nobody@example.com' })).toBeInTheDocument();
  });

  it('disables submission when there is no eligible candidate', () => {
    renderWithProviders(<TeamAdminAddForm clubId="club-1" teamId="team-1" candidates={[]} />);

    expect(screen.getByRole('button', { name: /ajouter/i })).toBeDisabled();
  });

  it('shows the server-provided message when already a team admin (409)', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/admins', () =>
        HttpResponse.json(
          { message: 'Cet utilisateur est déjà administrateur de cette équipe' },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <TeamAdminAddForm clubId="club-1" teamId="team-1" candidates={candidates} />,
    );

    await user.click(screen.getByRole('combobox', { name: /membre/i }));
    await user.click(await screen.findByRole('option', { name: /alex dupont/i }));
    await user.click(screen.getByRole('button', { name: /ajouter/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/déjà administrateur/i);
  });
});
