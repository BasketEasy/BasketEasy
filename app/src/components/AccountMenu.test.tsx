import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AccountMenu } from './AccountMenu';

function mockSession() {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'chris@example.com',
        firstName: 'Chris',
        lastName: 'Rillesen',
        avatarUrl: null,
        memberships: [],
      }),
    ),
  );
}

describe('AccountMenu', () => {
  it("shows the user's initials on the trigger", async () => {
    mockSession();
    renderWithProviders(<AccountMenu />);

    expect(await screen.findByText('CR')).toBeInTheDocument();
  });

  it("opens to show the user's email and a link to their profile", async () => {
    mockSession();
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />);

    await user.click(screen.getByRole('button', { name: 'Mon compte' }));

    expect(await screen.findByText('chris@example.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Mon profil' })).toHaveAttribute(
      'href',
      '/account',
    );
  });

  it('carries Créer un club, which left the primary navigation', async () => {
    mockSession();
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />);

    await user.click(screen.getByRole('button', { name: 'Mon compte' }));

    expect(await screen.findByRole('menuitem', { name: 'Créer un club' })).toHaveAttribute(
      'href',
      '/clubs/new',
    );
  });

  it('logs out when "Se déconnecter" is chosen', async () => {
    mockSession();
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 200 })));
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />);

    await waitFor(() => expect(screen.queryByText('CR')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Mon compte' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Se déconnecter' }));

    // Menu closes and the trigger falls back to the no-user state once the
    // session cache is cleared.
    await waitFor(() => expect(screen.queryByText('CR')).not.toBeInTheDocument());
  });

  it('closes the menu on Escape without logging out', async () => {
    mockSession();
    const user = userEvent.setup();
    renderWithProviders(<AccountMenu />);

    await user.click(screen.getByRole('button', { name: 'Mon compte' }));
    expect(await screen.findByRole('menuitem', { name: 'Se déconnecter' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Se déconnecter' })).not.toBeInTheDocument(),
    );
  });
});
