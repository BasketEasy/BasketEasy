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

describe('RosterPage', () => {
  it('shows the Membres tab by default, with the add-member form and remove buttons for an ADMIN', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json([
          { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' },
          { userId: 'user-2', email: 'b@example.com', role: 'MEMBER', joinedAt: '2026-01-02' },
        ]),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/roster' });

    await waitFor(() => expect(screen.getByText('b@example.com')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /ajouter un membre/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /retirer/i })).toHaveLength(2);
  });

  it('hides admin-only controls for a MEMBER', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json([
          { userId: 'user-1', email: 'a@b.com', role: 'MEMBER', joinedAt: '2026-01-01' },
        ]),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/roster' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /ajouter un membre/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retirer/i })).not.toBeInTheDocument();
  });

  it('shows an error instead of silently doing nothing when removing the last admin fails', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json([
          { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' },
        ]),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
      http.delete('/api/clubs/club-1/members/user-1', () =>
        HttpResponse.json({ message: 'Cannot remove the last admin of a club' }, { status: 400 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/roster' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /retirer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /informations saisies sont invalides/i,
    );
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });

  it('opens the add-member form in a modal, and closes it after a successful submit', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
      http.post('/api/clubs/club-1/members', async ({ request }) => {
        const body = (await request.json()) as { email: string };
        return HttpResponse.json({
          userId: 'user-2',
          email: body.email,
          role: 'MEMBER',
          joinedAt: '2026-01-02',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/roster' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /ajouter un membre/i })).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/adresse e-mail du membre/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /ajouter un membre/i }));
    expect(screen.getByRole('heading', { name: /ajouter un membre/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/adresse e-mail du membre/i), 'b@example.com');
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    await waitFor(() =>
      expect(screen.queryByLabelText(/adresse e-mail du membre/i)).not.toBeInTheDocument(),
    );
    expect(screen.getByText('b@example.com')).toBeInTheDocument();
  });

  it('switches to the Joueurs tab and shows the create-player form and row controls for an ADMIN', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/players', () =>
        HttpResponse.json([
          {
            id: 'p1',
            clubId: 'club-1',
            firstName: 'Alex',
            lastName: 'Dupont',
            userId: null,
            createdAt: 'x',
          },
        ]),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/roster' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /ajouter un membre/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('tab', { name: /joueurs/i }));

    await waitFor(() => expect(screen.getByText('Alex')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /ajouter un joueur/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /modifier/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /supprimer/i })).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('hides player-row admin-only controls for a MEMBER', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/players', () =>
        HttpResponse.json([
          {
            id: 'p1',
            clubId: 'club-1',
            firstName: 'Alex',
            lastName: 'Dupont',
            userId: null,
            createdAt: 'x',
          },
        ]),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/roster' });

    await waitFor(() => expect(screen.getByRole('tab', { name: /joueurs/i })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /joueurs/i }));

    await waitFor(() => expect(screen.getByText('Alex')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /ajouter un joueur/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /supprimer/i })).not.toBeInTheDocument();
  });

  it('opens the add-player form in a modal, offering unlinked members, and shows the linked email once added', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json([
          { userId: 'user-2', email: 'b@example.com', role: 'MEMBER', joinedAt: '2026-01-02' },
        ]),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
      http.post('/api/clubs/club-1/players', async ({ request }) => {
        const body = (await request.json()) as {
          firstName: string;
          lastName: string;
          userId?: string;
        };
        return HttpResponse.json({
          id: 'p1',
          clubId: 'club-1',
          firstName: body.firstName,
          lastName: body.lastName,
          userId: body.userId ?? null,
          createdAt: '2026-01-01',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/roster' });

    await waitFor(() => expect(screen.getByRole('tab', { name: /joueurs/i })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /joueurs/i }));
    await user.click(await screen.findByRole('button', { name: /ajouter un joueur/i }));

    await user.type(screen.getByLabelText(/prénom/i), 'Alex');
    await user.type(screen.getByLabelText(/^nom$/i), 'Dupont');
    await user.click(screen.getByRole('combobox', { name: /compte lié/i }));
    await user.click(await screen.findByRole('option', { name: 'b@example.com' }));
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    await waitFor(() => expect(screen.queryByLabelText(/prénom/i)).not.toBeInTheDocument());
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('b@example.com')).toBeInTheDocument();
  });
});
