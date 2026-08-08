import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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

describe('ClubMembersPage', () => {
  it('shows the add-member form and remove buttons for an ADMIN', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json([
          { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' },
          { userId: 'user-2', email: 'b@example.com', role: 'MEMBER', joinedAt: '2026-01-02' },
        ]),
      ),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('b@example.com')).toBeInTheDocument());
    expect(screen.getByLabelText(/adresse e-mail du membre/i)).toBeInTheDocument();
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
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    expect(screen.queryByLabelText(/adresse e-mail du membre/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retirer/i })).not.toBeInTheDocument();
  });
});
