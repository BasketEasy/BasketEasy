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

describe('ClubTeamsPage', () => {
  it('shows the create-team button and lists teams for an ADMIN', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams', () =>
        HttpResponse.json([
          { id: 'team-1', name: 'U15 Filles', clubIds: ['club-1'], createdAt: 'x' },
        ]),
      ),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams' });

    await waitFor(() => expect(screen.getByText('U15 Filles')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /créer une équipe/i })).toBeInTheDocument();
  });

  it('hides the create-team button for a MEMBER', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    server.use(
      http.get('/api/clubs/club-1/teams', () =>
        HttpResponse.json([
          { id: 'team-1', name: 'U15 Filles', clubIds: ['club-1'], createdAt: 'x' },
        ]),
      ),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams' });

    await waitFor(() => expect(screen.getByText('U15 Filles')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /créer une équipe/i })).not.toBeInTheDocument();
  });

  it('opens the create-team form in a modal, and closes it after a successful submit', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams', () => HttpResponse.json([])),
      http.post('/api/clubs/club-1/teams', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({
          id: 'team-1',
          name: body.name,
          clubIds: ['club-1'],
          createdAt: '2026-01-01',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /créer une équipe/i })).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/nom de l'équipe/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /créer une équipe/i }));
    expect(screen.getByRole('heading', { name: /créer une équipe/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/nom de l'équipe/i), 'U15 Filles');
    await user.click(screen.getByRole('button', { name: /^créer$/i }));

    await waitFor(() =>
      expect(screen.queryByLabelText(/nom de l'équipe/i)).not.toBeInTheDocument(),
    );
    expect(screen.getByText('U15 Filles')).toBeInTheDocument();
  });
});
