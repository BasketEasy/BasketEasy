import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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
});
