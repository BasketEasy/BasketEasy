import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import type { AdminSearchResult } from '@basketeasy/types/platform-admin-search';
import { server } from '../../mocks/server';
import { renderWithProviders } from '../../testUtils';
import { clearPlatformSession, startPlatformSession } from '../platformSession';
import { AdminCreateClubDialog } from './AdminCreateClubDialog';

const SEARCH: AdminSearchResult = {
  query: 'durand',
  exactId: null,
  unknownId: false,
  groups: {
    club: [],
    team: [],
    player: [],
    user: [
      {
        kind: 'user',
        id: 'user-9',
        label: 'Claire Durand',
        sublabel: 'claire.durand@example.fr',
        emailVerified: false,
      },
    ],
  },
};

function renderDialog() {
  renderWithProviders(
    <Routes>
      <Route path="/admin/clubs" element={<AdminCreateClubDialog />} />
      <Route path="/admin/clubs/:clubId" element={<p>Fiche du club</p>} />
    </Routes>,
    { route: '/admin/clubs' },
  );
}

async function fill(user: ReturnType<typeof userEvent.setup>, ffbbClubCode = '') {
  await user.click(screen.getByRole('button', { name: 'Créer un club' }));
  const dialog = within(screen.getByRole('dialog'));
  await user.type(dialog.getByLabelText('Nom du club'), 'Saint-Herblain BC');
  if (ffbbClubCode) await user.type(dialog.getByLabelText('Code FFBB (facultatif)'), ffbbClubCode);
  await user.type(dialog.getByLabelText('Premier admin'), 'durand');
  await user.click(await dialog.findByRole('radio', { name: /Claire Durand/ }));
  await user.type(dialog.getByLabelText('Motif'), 'Demande du comité 44, ticket #830');
  return dialog;
}

describe('AdminCreateClubDialog', () => {
  beforeEach(() => {
    startPlatformSession('token', new Date(Date.now() + 15 * 60_000).toISOString(), 'DATA_OFFICER');
    server.use(http.get('/api/admin/search', () => HttpResponse.json(SEARCH)));
  });
  afterEach(() => clearPlatformSession());

  it('warns when the picked first admin has not verified their address', async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = await fill(user);

    expect(dialog.getByText(/Adresse non vérifiée/)).toBeInTheDocument();
  });

  it('creates the club and opens its page', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/admin/clubs', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { action: 'CLUB_CREATED', auditLogId: 'log-1', clubId: 'club-9' },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderDialog();

    const dialog = await fill(user);
    await user.click(dialog.getByRole('button', { name: 'Créer le club' }));

    expect(await screen.findByText('Fiche du club')).toBeInTheDocument();
    expect(body).toEqual({
      name: 'Saint-Herblain BC',
      firstAdminUserId: 'user-9',
      reason: 'Demande du comité 44, ticket #830',
    });
  });

  it('shows a taken FFBB code under its own field', async () => {
    server.use(
      http.post('/api/admin/clubs', () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Ce code club FFBB est déjà utilisé par un autre club' },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderDialog();

    const dialog = await fill(user, 'PDL0044012');
    await user.click(dialog.getByRole('button', { name: 'Créer le club' }));

    expect(
      await dialog.findByText('Ce code club FFBB est déjà utilisé par un autre club'),
    ).toBeInTheDocument();
    expect(dialog.getByLabelText('Code FFBB (facultatif)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('requires a first admin', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Créer un club' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Nom du club'), 'Saint-Herblain BC');
    await user.type(dialog.getByLabelText('Motif'), 'Demande du comité 44, ticket #830');
    await user.click(dialog.getByRole('button', { name: 'Créer le club' }));

    expect(await dialog.findByText('Choisissez le premier admin')).toBeInTheDocument();
  });
});
