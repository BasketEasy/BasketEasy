import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import App from '../App';

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[]) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships }),
    ),
  );
}

describe('ClubPlayersPage', () => {
  it('shows the create-player form and row controls for an ADMIN', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/players', () =>
        HttpResponse.json([
          { id: 'p1', clubId: 'club-1', firstName: 'Alex', lastName: 'Dupont', createdAt: 'x' },
        ]),
      ),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/players' });

    await waitFor(() => expect(screen.getByText('Alex')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /ajouter un joueur/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /modifier/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /supprimer/i })).toBeInTheDocument();
  });

  it('hides admin-only controls for a MEMBER', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    server.use(
      http.get('/api/clubs/club-1/players', () =>
        HttpResponse.json([
          { id: 'p1', clubId: 'club-1', firstName: 'Alex', lastName: 'Dupont', createdAt: 'x' },
        ]),
      ),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/players' });

    await waitFor(() => expect(screen.getByText('Alex')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /ajouter un joueur/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /supprimer/i })).not.toBeInTheDocument();
  });

  it('opens the add-player form in a modal, and closes it after a successful submit', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
      http.post('/api/clubs/club-1/players', async ({ request }) => {
        const body = (await request.json()) as { firstName: string; lastName: string };
        return HttpResponse.json({
          id: 'p1',
          clubId: 'club-1',
          firstName: body.firstName,
          lastName: body.lastName,
          createdAt: '2026-01-01',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/players' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /ajouter un joueur/i })).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/prénom/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /ajouter un joueur/i }));
    expect(screen.getByRole('heading', { name: /ajouter un joueur/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/prénom/i), 'Alex');
    await user.type(screen.getByLabelText(/^nom$/i), 'Dupont');
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    await waitFor(() => expect(screen.queryByLabelText(/prénom/i)).not.toBeInTheDocument());
    expect(screen.getByText('Alex')).toBeInTheDocument();
  });
});
