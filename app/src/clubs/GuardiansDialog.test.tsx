import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import type { Player } from '@basketeasy/types/players';
import type { PlayerGuardians } from '@basketeasy/types/guardians';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { GuardiansDialog } from './GuardiansDialog';

const player: Player = {
  id: 'p1',
  clubId: 'club-1',
  firstName: 'Léo',
  lastName: 'Martin',
  userId: null,
  nationalId: null,
  licenseNumber: null,
  birthDate: '2015-05-01T00:00:00.000Z',
  gender: null,
  licenseType: null,
  isMinor: true,
  parentalConsentGivenAt: null,
  guardianCount: 1,
  createdAt: 'x',
};

const guardians: PlayerGuardians = {
  guardians: [
    {
      userId: 'mum',
      firstName: 'Sophie',
      lastName: 'Martin',
      email: 'sophie@example.com',
      linkedAt: '2026-09-01T10:00:00.000Z',
      consentGivenAt: '2026-09-01T10:00:00.000Z',
    },
  ],
  pendingInvites: [
    { id: 'inv-1', createdAt: '2026-09-20T10:00:00.000Z', expiresAt: '2026-09-27T10:00:00.000Z' },
  ],
};

function mockGuardians(body: PlayerGuardians | { status: number }) {
  server.use(
    http.get('/api/clubs/club-1/players/p1/guardians', () =>
      'status' in body
        ? HttpResponse.json({ message: 'boom' }, { status: body.status })
        : HttpResponse.json(body),
    ),
  );
}

function renderDialog(overrides: Partial<Player> = {}) {
  return renderWithProviders(
    <>
      <GuardiansDialog clubId="club-1" player={{ ...player, ...overrides }} />
      <Toaster />
    </>,
  );
}

describe('GuardiansDialog', () => {
  it('names the trigger after the number of linked parents', () => {
    renderDialog({ guardianCount: 0 });
    expect(screen.getByRole('button', { name: 'Inviter un parent' })).toBeInTheDocument();
  });

  it('lists linked parents with their consent, and pending links', async () => {
    mockGuardians(guardians);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Parents (1)' }));

    expect(await screen.findByText('Sophie Martin')).toBeInTheDocument();
    expect(screen.getByText('sophie@example.com')).toBeInTheDocument();
    expect(screen.getByText(/autorisation donnée le/i)).toBeInTheDocument();
    expect(screen.getByText(/lien créé le/i)).toBeInTheDocument();
  });

  it('generates a new link and shows it once', async () => {
    mockGuardians({ guardians: [], pendingInvites: [] });
    server.use(
      http.post('/api/clubs/club-1/players/p1/guardians/invites', () =>
        HttpResponse.json({
          id: 'inv-2',
          token: 'tok',
          url: 'http://localhost:5173/guardian-invite/tok',
          expiresAt: '2026-10-04T10:00:00.000Z',
        }),
      ),
    );
    const user = userEvent.setup();
    renderDialog({ guardianCount: 0 });

    await user.click(screen.getByRole('button', { name: 'Inviter un parent' }));
    expect(await screen.findByText('Aucun parent lié')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Générer un lien parent' }));

    expect(await screen.findByLabelText("Lien d'invitation parent")).toHaveValue(
      'http://localhost:5173/guardian-invite/tok',
    );
  });

  it('asks before removing a parent, then removes them', async () => {
    mockGuardians(guardians);
    let removed = false;
    server.use(
      http.delete('/api/clubs/club-1/players/p1/guardians/mum', () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Parents (1)' }));
    await user.click(await screen.findByRole('button', { name: 'Retirer' }));
    expect(screen.getByText(/retirer l'accès de sophie martin/i)).toBeInTheDocument();
    expect(removed).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(removed).toBe(true));
  });

  it('cancels a pending link', async () => {
    mockGuardians(guardians);
    let cancelled = false;
    server.use(
      http.delete('/api/clubs/club-1/players/p1/guardians/invites/inv-1', () => {
        cancelled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Parents (1)' }));
    const pending = (await screen.findByText(/lien créé le/i)).closest('div') as HTMLElement;
    await user.click(within(pending).getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(cancelled).toBe(true));
  });

  it('disables a new link once the limit is reached', async () => {
    mockGuardians({
      guardians: [],
      pendingInvites: Array.from({ length: 4 }, (_, i) => ({
        id: `inv-${i}`,
        createdAt: '2026-09-20T10:00:00.000Z',
        expiresAt: '2026-09-27T10:00:00.000Z',
      })),
    });
    const user = userEvent.setup();
    renderDialog({ guardianCount: 0 });

    await user.click(screen.getByRole('button', { name: 'Inviter un parent' }));
    expect(await screen.findByRole('button', { name: 'Générer un lien parent' })).toBeDisabled();
    expect(screen.getByText(/limite atteinte/i)).toBeInTheDocument();
  });

  it('shows a retry, never the empty state, when the list fails to load', async () => {
    mockGuardians({ status: 500 });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Parents (1)' }));

    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();
    expect(screen.queryByText('Aucun parent lié')).not.toBeInTheDocument();
  });
});
