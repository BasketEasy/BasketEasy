import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
  it('opens on one h1 with the e-mail, and shows the profile form without interaction', async () => {
    mockSession();
    renderWithProviders(<AccountPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: /mon compte/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Profil' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/prénom/i)).toHaveValue('Alix'));
    expect(await screen.findByText('a@b.com')).toBeInTheDocument();
  });

  it('folds notifications by default with its e-mail summary, and unfolds it', async () => {
    mockSession();
    const user = userEvent.setup();
    renderWithProviders(<AccountPage />);

    const trigger = await screen.findByRole('button', { name: /notifications/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(await screen.findByText('E-mail activé')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /voir mes notifications/i })).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole('link', { name: /voir mes notifications/i })).toBeInTheDocument();
  });

  it('offers only the notifications item to a plain player', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    renderWithProviders(<AccountPage />);

    await screen.findByRole('button', { name: /notifications/i });
    expect(screen.queryByRole('button', { name: /club actif/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mes enfants/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accès parents/i })).not.toBeInTheDocument();
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

    const fold = await screen.findByRole('button', { name: /club actif/i });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(fold).toHaveTextContent('COC Basket'));
    await user.click(fold);
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

  describe('guardians', () => {
    it('lists the children the caller follows, each linking to its profile', async () => {
      mockSession();
      server.use(
        http.get('/api/me/personas', () =>
          HttpResponse.json({
            self: null,
            children: [
              {
                playerId: 'child-1',
                firstName: 'Léo',
                lastName: 'Martin',
                clubId: 'club-1',
                clubName: 'ASBC Rezé',
                teams: [{ teamId: 'team-1', teamName: 'U11 M' }],
                pendingCount: 2,
              },
            ],
          }),
        ),
      );
      const user = userEvent.setup();
      renderWithProviders(<AccountPage />);

      const fold = await screen.findByRole('button', { name: /mes enfants/i });
      expect(fold).toHaveTextContent('Léo');
      await user.click(fold);
      const link = await screen.findByRole('link', { name: 'Léo Martin' });
      expect(link).toHaveAttribute('href', '/children/child-1');
      expect(screen.getByText('U11 M · ASBC Rezé')).toBeInTheDocument();
    });

    it('lets an adult player remove a parent who follows them', async () => {
      mockSession();
      let removed = false;
      server.use(
        http.get('/api/me/personas', () =>
          HttpResponse.json({ self: { pendingCount: 0, playerIds: ['me-1'] }, children: [] }),
        ),
        http.get('/api/me/players/me-1/guardians', () =>
          HttpResponse.json({
            playerId: 'me-1',
            isMinor: false,
            guardians: [{ userId: 'mum', firstName: 'Sophie', lastName: 'Martin', linkedAt: 'x' }],
          }),
        ),
        http.delete('/api/me/players/me-1/guardians/mum', () => {
          removed = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      const user = userEvent.setup();
      renderWithProviders(<AccountPage />);

      await user.click(await screen.findByRole('button', { name: /accès parents/i }));
      expect(await screen.findByText('Sophie Martin')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Retirer' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retirer' }));

      await waitFor(() => expect(removed).toBe(true));
    });

    it('shows a minor who follows them but offers no way to remove anyone', async () => {
      mockSession();
      server.use(
        http.get('/api/me/personas', () =>
          HttpResponse.json({ self: { pendingCount: 0, playerIds: ['me-1'] }, children: [] }),
        ),
        http.get('/api/me/players/me-1/guardians', () =>
          HttpResponse.json({
            playerId: 'me-1',
            isMinor: true,
            guardians: [{ userId: 'mum', firstName: 'Sophie', lastName: 'Martin', linkedAt: 'x' }],
          }),
        ),
      );
      const user = userEvent.setup();
      renderWithProviders(<AccountPage />);

      await user.click(await screen.findByRole('button', { name: /accès parents/i }));
      expect(await screen.findByText('Sophie Martin')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument();
    });

    it('shows no guardian section at all for someone who has none', async () => {
      mockSession();
      renderWithProviders(<AccountPage />);

      await waitFor(() => expect(screen.getByLabelText(/prénom/i)).toHaveValue('Alix'));
      expect(screen.queryByRole('button', { name: /mes enfants/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /accès parents/i })).not.toBeInTheDocument();
    });
  });
});
