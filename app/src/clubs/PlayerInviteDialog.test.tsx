import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { PlayerInviteDialog } from './PlayerInviteDialog';

const player = {
  id: 'p1',
  clubId: 'club-1',
  firstName: 'Alex',
  lastName: 'Dupont',
  userId: null,
  nationalId: null,
  licenseNumber: null,
  birthDate: null,
  gender: null,
  licenseType: null,
  createdAt: 'x',
};

function renderDialog() {
  return renderWithProviders(
    <>
      <PlayerInviteDialog clubId="club-1" player={player} />
      <Toaster />
    </>,
  );
}

describe('PlayerInviteDialog', () => {
  it('shows the current status, then generates and displays a copyable link', async () => {
    server.use(
      http.get('/api/clubs/club-1/players/p1/invite', () =>
        HttpResponse.json({ status: 'NONE', expiresAt: null }),
      ),
      http.post('/api/clubs/club-1/players/p1/invite', () =>
        HttpResponse.json({
          token: 'abc123',
          url: 'http://localhost:5173/invite/abc123',
          expiresAt: '2026-09-10T00:00:00.000Z',
        }),
      ),
    );

    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /^inviter$/i }));
    expect(
      await screen.findByText(/aucune invitation n'a encore été envoyée/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /générer un lien d'invitation/i }));

    expect(
      await screen.findByDisplayValue('http://localhost:5173/invite/abc123'),
    ).toBeInTheDocument();
  });

  it('copies the link to the clipboard and confirms via toast', async () => {
    server.use(
      http.get('/api/clubs/club-1/players/p1/invite', () =>
        HttpResponse.json({ status: 'NONE', expiresAt: null }),
      ),
      http.post('/api/clubs/club-1/players/p1/invite', () =>
        HttpResponse.json({
          token: 'abc123',
          url: 'http://localhost:5173/invite/abc123',
          expiresAt: '2026-09-10T00:00:00.000Z',
        }),
      ),
    );
    const user = userEvent.setup();
    // Must come after userEvent.setup(): it installs its own navigator.clipboard
    // stub, which would otherwise clobber this override.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    renderDialog();

    await user.click(screen.getByRole('button', { name: /^inviter$/i }));
    await user.click(await screen.findByRole('button', { name: /générer un lien d'invitation/i }));
    await screen.findByDisplayValue('http://localhost:5173/invite/abc123');
    await user.click(await screen.findByRole('button', { name: /^copier$/i }));

    expect(writeText).toHaveBeenCalledWith('http://localhost:5173/invite/abc123');
    expect(await screen.findByText(/lien copié/i)).toBeInTheDocument();
  });

  it('shows an error toast when the player is already linked to an account', async () => {
    server.use(
      http.get('/api/clubs/club-1/players/p1/invite', () =>
        HttpResponse.json({ status: 'NONE', expiresAt: null }),
      ),
      http.post('/api/clubs/club-1/players/p1/invite', () =>
        HttpResponse.json({ message: 'Ce joueur est déjà lié à un compte' }, { status: 400 }),
      ),
    );

    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /^inviter$/i }));
    await user.click(await screen.findByRole('button', { name: /générer un lien d'invitation/i }));

    expect(await screen.findByText(/déjà lié à un compte/i)).toBeInTheDocument();
  });

  it('shows a query error instead of an empty status when the invite status fails to load', async () => {
    server.use(
      http.get('/api/clubs/club-1/players/p1/invite', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /^inviter$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/chargement impossible/i);
    expect(
      screen.queryByRole('button', { name: /générer un lien d'invitation/i }),
    ).not.toBeInTheDocument();
  });
});
