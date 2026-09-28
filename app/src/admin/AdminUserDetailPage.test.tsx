import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import type { AdminUserDetail } from '@basketeasy/types/platform-admin-browse';
import { AdminUserDetailPage } from './AdminUserDetailPage';
import { clearPlatformSession, startPlatformSession } from './platformSession';

const CLUB = { id: 'club-1', name: 'BC Nantes' };

const USER: AdminUserDetail = {
  person: {
    kind: 'user',
    id: 'user-9',
    displayName: 'Jean Dupont',
    email: 'jean.dupont@example.org',
    emailDomain: 'example.org',
    redacted: false,
  },
  emailVerified: true,
  createdAt: '2024-01-05T09:00:00.000Z',
  lastActiveAt: '2025-09-20T10:00:00.000Z',
  daysUntilErasure: 10,
  clubCount: 1,
  guardianOfCount: 0,
  platformRole: null,
  memberships: [{ club: CLUB, role: 'MEMBER', joinedAt: '2024-01-05T09:00:00.000Z' }],
  teamAdminOf: [],
  linkedPlayers: [
    {
      player: {
        kind: 'player',
        id: 'p-1',
        displayName: 'Jean Dupont',
        email: 'jean.dupont@example.org',
        emailDomain: 'example.org',
        redacted: false,
      },
      club: CLUB,
      teams: [],
    },
  ],
  guardianOf: [],
  activeSessionCount: 1,
};

const REDACTED_USER: AdminUserDetail = {
  ...USER,
  person: { ...USER.person, displayName: 'J. D.', email: null, redacted: true },
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

function startSession(role: 'SUPPORT' | 'DATA_OFFICER') {
  startPlatformSession('platform-token', new Date(Date.now() + 15 * 60 * 1000).toISOString(), role);
}

describe('AdminUserDetailPage', () => {
  beforeEach(() => startSession('DATA_OFFICER'));
  afterEach(() => clearPlatformSession());

  it('shows SUPPORT the redacted record without the export and erase sections', async () => {
    startSession('SUPPORT');
    server.use(http.get('/api/admin/users/user-9', () => HttpResponse.json(REDACTED_USER)));

    renderDetail();

    expect(await screen.findByText('J. D.')).toBeInTheDocument();
    expect(screen.getByText('…@example.org')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Effacer ce compte' })).not.toBeInTheDocument();
    expect(screen.queryByText('Export RGPD')).not.toBeInTheDocument();
  });

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

  describe('RGPD export', () => {
    let createObjectURL: ReturnType<typeof vi.fn>;
    let revokeObjectURL: ReturnType<typeof vi.fn>;
    let clicked: string[];

    beforeEach(() => {
      // jsdom implements neither, and the download is the whole point of the
      // flow — a link the browser never follows would pass a shallower test.
      createObjectURL = vi.fn(() => 'blob:kluvo-export');
      revokeObjectURL = vi.fn();
      clicked = [];
      URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
      URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        clicked.push(this.download);
      });
    });

    afterEach(() => vi.restoreAllMocks());

    it('requires a reason before generating anything', async () => {
      mockDetail();
      const user = userEvent.setup();
      renderDetail();

      await user.click(await screen.findByRole('button', { name: 'Exporter les données' }));
      const dialog = within(screen.getByRole('dialog'));
      await user.type(dialog.getByLabelText('Motif de l’export'), 'court');
      await user.click(dialog.getByRole('button', { name: 'Générer et télécharger' }));

      expect(await screen.findByText('Motif requis (10 caractères minimum)')).toBeInTheDocument();
      expect(clicked).toEqual([]);
    });

    it('sends the reason and downloads the returned bundle as a file', async () => {
      mockDetail();
      let sentReason: string | null = null;
      server.use(
        http.post('/api/admin/users/user-9/export', async ({ request }) => {
          sentReason = ((await request.json()) as { reason: string }).reason;
          return HttpResponse.json({
            generatedAt: '2026-09-06T12:00:00.000Z',
            subjectUserId: 'user-9',
            notice: { basis: 'articles 15 et 20', omissions: ['a', 'b', 'c'] },
            account: { email: 'jean.dupont@example.org' },
          });
        }),
      );
      const user = userEvent.setup();
      renderDetail();

      await user.click(await screen.findByRole('button', { name: 'Exporter les données' }));
      const dialog = within(screen.getByRole('dialog'));
      await user.type(
        dialog.getByLabelText('Motif de l’export'),
        'Demande d’accès RGPD #42 reçue le 01/09/2026',
      );
      await user.click(dialog.getByRole('button', { name: 'Générer et télécharger' }));

      await waitFor(() => expect(clicked).toEqual(['kluvo-export-user-9.json']));
      expect(sentReason).toBe('Demande d’accès RGPD #42 reçue le 01/09/2026');
      // The blob holds a full copy of someone's personal data; nothing needs
      // the URL once the click has happened.
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:kluvo-export');
    });

    it('reports a failure inline and produces no file', async () => {
      mockDetail();
      server.use(
        http.post('/api/admin/users/user-9/export', () => HttpResponse.json({}, { status: 500 })),
      );
      const user = userEvent.setup();
      renderDetail();

      await user.click(await screen.findByRole('button', { name: 'Exporter les données' }));
      const dialog = within(screen.getByRole('dialog'));
      await user.type(dialog.getByLabelText('Motif de l’export'), 'Demande d’accès RGPD #42');
      await user.click(dialog.getByRole('button', { name: 'Générer et télécharger' }));

      expect(
        await screen.findByText('L’export a échoué. Aucun fichier n’a été produit.'),
      ).toBeInTheDocument();
      expect(clicked).toEqual([]);
    });
  });
});
