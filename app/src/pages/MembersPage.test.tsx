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

describe('MembersPage', () => {
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

    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('b@example.com')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /ajouter un membre/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /retirer/i })).toHaveLength(2);
  });

  it('redirects a non-admin (MEMBER role, or no membership at all) away from the page without calling the members/players endpoints', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    let membersRequested = false;
    let playersRequested = false;
    server.use(
      http.get('/api/clubs/club-1/members', () => {
        membersRequested = true;
        return HttpResponse.json([]);
      }),
      http.get('/api/clubs/club-1/players', () => {
        playersRequested = true;
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    expect(await screen.findByRole('heading', { name: /tableau de bord/i })).toBeInTheDocument();
    expect(membersRequested).toBe(false);
    expect(playersRequested).toBe(false);
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
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /retirer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /informations saisies sont invalides/i,
    );
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });

  it('shows a note and requires confirmation before removing a member linked to a player', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    let removeCalled = false;
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json([
          { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' },
          { userId: 'user-2', email: 'b@example.com', role: 'MEMBER', joinedAt: '2026-01-02' },
        ]),
      ),
      http.get('/api/clubs/club-1/players', () =>
        HttpResponse.json([
          {
            id: 'p1',
            clubId: 'club-1',
            firstName: 'Alex',
            lastName: 'Dupont',
            userId: 'user-2',
            createdAt: 'x',
          },
        ]),
      ),
      http.delete('/api/clubs/club-1/members/user-2', () => {
        removeCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('b@example.com')).toBeInTheDocument());
    expect(screen.getByText('Alex Dupont')).toBeInTheDocument();

    const retirerButtons = screen.getAllByRole('button', { name: /retirer/i });
    await user.click(retirerButtons[1]); // b@example.com's row

    expect(screen.getByText(/fiche joueur liée : alex dupont/i)).toBeInTheDocument();
    expect(removeCalled).toBe(false);

    await user.click(screen.getByRole('button', { name: /confirmer/i }));

    await waitFor(() => expect(removeCalled).toBe(true));
  });

  it('removes a member with no linked player immediately, without a confirmation step', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    let removeCalled = false;
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json([
          { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' },
          { userId: 'user-2', email: 'b@example.com', role: 'MEMBER', joinedAt: '2026-01-02' },
        ]),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
      http.delete('/api/clubs/club-1/members/user-2', () => {
        removeCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('b@example.com')).toBeInTheDocument());
    const retirerButtons = screen.getAllByRole('button', { name: /retirer/i });
    await user.click(retirerButtons[1]);

    expect(screen.queryByRole('button', { name: /confirmer/i })).not.toBeInTheDocument();
    await waitFor(() => expect(removeCalled).toBe(true));
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
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

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
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

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
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

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
