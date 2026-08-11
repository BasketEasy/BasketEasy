import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import App from '../App';
import { ClubCreateForm } from './ClubCreateForm';

describe('ClubCreateForm', () => {
  it('shows a validation error and does not submit for a too-short name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClubCreateForm />);

    await user.type(screen.getByLabelText(/nom du club/i), 'A');
    await user.click(screen.getByRole('button', { name: /créer le club/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/2 caractères/i);
  });

  it('submits a valid name and does not show an error on success', async () => {
    let createCalled = false;
    server.use(
      http.post('/api/clubs', async ({ request }) => {
        createCalled = true;
        const body = (await request.json()) as { name: string };
        expect(body).toEqual({ name: 'COC Basket' });
        return HttpResponse.json({ id: 'club-1', name: body.name, createdAt: '2026-01-01' });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ClubCreateForm />);

    await user.type(screen.getByLabelText(/nom du club/i), 'COC Basket');
    await user.click(screen.getByRole('button', { name: /créer le club/i }));

    await screen.findByRole('button', { name: /créer le club/i });
    expect(createCalled).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a submit-level error on a server failure', async () => {
    server.use(
      http.post('/api/clubs', () => HttpResponse.json({ message: 'error' }, { status: 500 })),
    );

    const user = userEvent.setup();
    renderWithProviders(<ClubCreateForm />);

    await user.type(screen.getByLabelText(/nom du club/i), 'COC Basket');
    await user.click(screen.getByRole('button', { name: /créer le club/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/erreur est survenue/i);
  });

  it('lands on the new club members page after creation, without bouncing through /dashboard', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          id: 'user-1',
          email: 'a@b.com',
          firstName: null,
          lastName: null,
          avatarUrl: null,
          memberships: [],
        }),
      ),
      http.post('/api/clubs', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({ id: 'club-1', name: body.name, createdAt: '2026-01-01' });
      }),
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
      ),
      http.get('/api/clubs/club-1/players', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/new' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /créer le club/i })).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText(/nom du club/i), 'COC Basket');
    await user.click(screen.getByRole('button', { name: /créer le club/i }));

    expect(await screen.findByRole('heading', { name: /effectif du club/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /tableau de bord/i })).not.toBeInTheDocument();
  });
});
