import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AdminUserDetailPage } from './AdminUserDetailPage';

const USER = {
  id: 'user-9',
  email: 'jean.dupont@example.org',
  firstName: 'Jean',
  lastName: 'Dupont',
  emailVerified: true,
  lastActiveAt: '2025-09-20T10:00:00.000Z',
  createdAt: '2024-01-05T09:00:00.000Z',
  clubs: [{ id: 'club-1', name: 'BC Nantes', role: 'MEMBER' }],
  linkedPlayers: [{ id: 'p-1', firstName: 'Jean', lastName: 'Dupont', clubName: 'BC Nantes' }],
};

function mockDetail() {
  server.use(http.get('/api/admin/users/user-9', () => HttpResponse.json(USER)));
}

// The page reads :userId off the route, so it has to be mounted through a
// matching Route rather than rendered bare.
function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
      <Route path="/admin/users" element={<p>Comptes inactifs</p>} />
    </Routes>,
    { route: '/admin/users/user-9' },
  );
}

describe('AdminUserDetailPage', () => {
  it('renders the full record behind the audited detail route', async () => {
    mockDetail();

    renderDetail();

    expect(await screen.findByText('jean.dupont@example.org')).toBeInTheDocument();
    expect(screen.getByText('BC Nantes · membre')).toBeInTheDocument();
  });

  it('shows the error branch when the record fails to load', async () => {
    server.use(http.get('/api/admin/users/user-9', () => HttpResponse.json({}, { status: 404 })));

    renderDetail();

    expect(await screen.findByText('Fiche indisponible')).toBeInTheDocument();
  });

  it('keeps the erase button disabled-by-validation until a real reason is given', async () => {
    // A manual erasure with no recorded justification is exactly the gap the
    // audit log exists to close, so the reason is a hard requirement, not a
    // hint.
    mockDetail();
    const user = userEvent.setup();

    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Effacer ce compte' }));

    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Motif de l’effacement'), 'court');
    await user.click(dialog.getByRole('button', { name: 'Effacer définitivement' }));

    expect(await screen.findByText('Motif requis (10 caractères minimum)')).toBeInTheDocument();
  });

  it('sends the reason with the erasure', async () => {
    mockDetail();
    let sentReason: string | null = null;
    server.use(
      http.post('/api/admin/users/user-9/erase', async ({ request }) => {
        sentReason = ((await request.json()) as { reason: string }).reason;
        return HttpResponse.json({ erasedUserId: 'user-9', unlinkedPlayerCount: 1 });
      }),
    );
    const user = userEvent.setup();

    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Effacer ce compte' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(
      dialog.getByLabelText('Motif de l’effacement'),
      'Demande RGPD #42 reçue le 01/09/2026',
    );
    await user.click(dialog.getByRole('button', { name: 'Effacer définitivement' }));

    // Success navigates back to the (redacted) list; the outcome itself
    // reaches the reader as a toast, which <Toaster /> renders in App, not
    // here.
    expect(await screen.findByText('Comptes inactifs')).toBeInTheDocument();
    expect(sentReason).toBe('Demande RGPD #42 reçue le 01/09/2026');
  });
});
