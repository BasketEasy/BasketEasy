import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamAdminAddForm } from './TeamAdminAddForm';

describe('TeamAdminAddForm', () => {
  it('submits a valid email and clears the field on success', async () => {
    let addCalled = false;
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/admins', async ({ request }) => {
        addCalled = true;
        const body = (await request.json()) as { email: string };
        expect(body).toEqual({ email: 'a@b.com' });
        return HttpResponse.json({
          userId: 'user-2',
          email: body.email,
          teamId: 'team-1',
          createdAt: '2026-01-02',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TeamAdminAddForm clubId="club-1" teamId="team-1" />);

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'a@b.com');
    await user.click(screen.getByRole('button', { name: /ajouter/i }));

    await screen.findByRole('button', { name: /ajouter/i });
    expect(addCalled).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a specific error when the email has no account (404)', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/admins', () =>
        HttpResponse.json({ message: 'No account with that email' }, { status: 404 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<TeamAdminAddForm clubId="club-1" teamId="team-1" />);

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: /ajouter/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /aucun compte avec cette adresse e-mail/i,
    );
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
    renderWithProviders(<TeamAdminAddForm clubId="club-1" teamId="team-1" />);

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'a@b.com');
    await user.click(screen.getByRole('button', { name: /ajouter/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/déjà administrateur/i);
  });
});
