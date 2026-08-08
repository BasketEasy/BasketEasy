import { beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import App from '../App';

// jsdom implements neither the Pointer Events methods nor scrollIntoView
// that Radix's Select uses to manage its open/highlight behavior — without
// these no-op stubs, opening the Select throws in tests (works fine in a
// real browser).
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[]) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships }),
    ),
  );
}

describe('TeamMembersPage', () => {
  it('shows the add-member button and remove buttons for an ADMIN', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/members', () =>
        HttpResponse.json([{ userId: 'user-1', email: 'a@b.com', addedAt: '2026-01-01' }]),
      ),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1/members' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /ajouter un membre/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retirer/i })).toBeInTheDocument();
  });

  it('hides admin-only controls for a MEMBER', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/members', () =>
        HttpResponse.json([{ userId: 'user-1', email: 'a@b.com', addedAt: '2026-01-01' }]),
      ),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1/members' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /ajouter un membre/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retirer/i })).not.toBeInTheDocument();
  });

  it('opens the add-member form in a modal, and closes it after a successful submit', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/members', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json([{ userId: 'user-2', email: 'c@d.com', role: 'MEMBER', joinedAt: 'x' }]),
      ),
      http.post('/api/clubs/club-1/teams/team-1/members', async ({ request }) => {
        const body = (await request.json()) as { userId: string };
        return HttpResponse.json({
          userId: body.userId,
          email: 'c@d.com',
          addedAt: '2026-01-01',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1/members' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /ajouter un membre/i })).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/membre du club/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /ajouter un membre/i }));
    expect(screen.getByRole('heading', { name: /ajouter un membre/i })).toBeInTheDocument();

    await user.click(await screen.findByLabelText(/membre du club/i));
    await user.click(await screen.findByRole('option', { name: 'c@d.com' }));
    await user.click(screen.getByRole('button', { name: /ajouter à l'équipe/i }));

    await waitFor(() => expect(screen.queryByLabelText(/membre du club/i)).not.toBeInTheDocument());
    expect(screen.getByText('c@d.com')).toBeInTheDocument();
  });

  it('shows an error instead of silently doing nothing when removal fails', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/members', () =>
        HttpResponse.json([{ userId: 'user-1', email: 'a@b.com', addedAt: '2026-01-01' }]),
      ),
      http.delete('/api/clubs/club-1/teams/team-1/members/user-1', () =>
        HttpResponse.json({ message: 'Team membership not found' }, { status: 404 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1/members' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /retirer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/ressource introuvable/i);
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });
});
