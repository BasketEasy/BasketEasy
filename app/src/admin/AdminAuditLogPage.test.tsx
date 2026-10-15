import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AdminAuditLogPage } from './AdminAuditLogPage';

describe('AdminAuditLogPage', () => {
  it('narrows to one person from the URL, and can show everything again', async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get('/api/admin/audit-log', ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          items: [
            {
              id: 'log-1',
              type: 'ADMIN_PII_VIEWED',
              userId: 'admin-1',
              actorEmail: 'dpo@kluvo.net',
              ipAddress: '203.0.113.7',
              metadata: { subjectPlayerId: 'player-1' },
              createdAt: '2026-09-28T10:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 25,
        });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<AdminAuditLogPage />, { route: '/admin/audit-log?playerId=player-1' });

    expect(await screen.findByText('Fiche consultée')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Joueur' })).toHaveAttribute(
      'href',
      '/admin/players/player-1',
    );
    expect(requests[0].get('playerId')).toBe('player-1');

    await user.click(screen.getByRole('button', { name: 'Tout afficher' }));

    await screen.findByText('Fiche consultée');
    expect(requests[requests.length - 1]?.has('playerId')).toBe(false);
  });

  it('labels a support action with what it changed, and filters by action', async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get('/api/admin/audit-log', ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          items: [
            {
              id: 'log-2',
              type: 'ADMIN_SUPPORT_ACTION',
              userId: 'admin-1',
              actorEmail: 'dpo@kluvo.net',
              ipAddress: null,
              metadata: {
                action: 'CHANGE_CLUB_ROLE',
                reason: 'Demande du président, ticket #815',
                subjectUserId: 'user-1',
                clubId: 'club-1',
                before: { role: 'ADMIN' },
                after: { role: 'MEMBER' },
              },
              createdAt: '2026-09-28T13:40:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 25,
        });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<AdminAuditLogPage />, { route: '/admin/audit-log' });

    expect(await screen.findByText('Rôle modifié')).toBeInTheDocument();
    expect(screen.getByText('Admin → Membre')).toBeInTheDocument();
    expect(screen.getByText('Demande du président, ticket #815')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Club' })).toHaveAttribute(
      'href',
      '/admin/clubs/club-1',
    );

    await user.click(screen.getByRole('combobox', { name: 'Action' }));
    await user.click(await screen.findByRole('option', { name: 'Sessions révoquées' }));

    await waitFor(() =>
      expect(requests[requests.length - 1]?.get('action')).toBe('REVOKE_SESSIONS'),
    );
  });
});
