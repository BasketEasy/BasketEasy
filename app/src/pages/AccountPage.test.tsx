import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AccountPage } from './AccountPage';

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[] = []) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'a@b.com',
        emailVerified: true,
        firstName: 'Alix',
        lastName: 'Martin',
        avatarUrl: null,
        emailVerified: true,
        emailNotificationsEnabled: true,
        memberships,
      }),
    ),
  );
}

describe('AccountPage', () => {
  it('renders the account profile form inside a card', async () => {
    mockSession();
    renderWithProviders(<AccountPage />);

    expect(screen.getByRole('heading', { name: /mon compte/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/prénom/i)).toHaveValue('Alix'));
  });

  it('shows a club switcher for an admin, defaulting to the first club', async () => {
    mockSession([
      { clubId: 'club-1', role: 'ADMIN' },
      { clubId: 'club-2', role: 'ADMIN' },
    ]);
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([
          { id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' },
          { id: 'club-2', name: 'ES Nantes', createdAt: '2026-01-01' },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<AccountPage />);

    const cocRadio = await screen.findByRole('radio', { name: /coc basket/i });
    const esRadio = screen.getByRole('radio', { name: /es nantes/i });
    await waitFor(() => expect(cocRadio).toHaveAttribute('aria-checked', 'true'));
    expect(esRadio).toHaveAttribute('aria-checked', 'false');

    await user.click(esRadio);
    expect(esRadio).toHaveAttribute('aria-checked', 'true');
    expect(cocRadio).toHaveAttribute('aria-checked', 'false');
  });

  it('hides the club switcher for a user with no admin clubs', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    renderWithProviders(<AccountPage />);

    await waitFor(() => expect(screen.getByLabelText(/prénom/i)).toBeInTheDocument());
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('shows Créer un club for a user who administers no club yet', async () => {
    mockSession();
    server.use(http.get('/api/me/teams', () => HttpResponse.json([])));
    renderWithProviders(<AccountPage />);

    expect(await screen.findByRole('link', { name: /créer un club/i })).toHaveAttribute(
      'href',
      '/clubs/new',
    );
  });

  it('hides Créer un club for a pure player (rostered, admin nowhere)', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    server.use(
      http.get('/api/me/teams', () =>
        HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'U15',
            category: 'U15',
            gender: 'MEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: false,
            rosterRole: 'PLAYER',
          },
        ]),
      ),
    );
    renderWithProviders(<AccountPage />);

    await waitFor(() => expect(screen.getByLabelText(/prénom/i)).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /créer un club/i })).not.toBeInTheDocument(),
    );
  });

  it('logs out when Se déconnecter is clicked', async () => {
    mockSession();
    let logoutCalled = false;
    server.use(
      http.post('/api/auth/logout', () => {
        logoutCalled = true;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AccountPage />);

    await user.click(await screen.findByRole('button', { name: /se déconnecter/i }));

    await waitFor(() => expect(logoutCalled).toBe(true));
  });
});
