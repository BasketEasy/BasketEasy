import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AdminScoresheetsPage } from './AdminScoresheetsPage';

function serveSheets(): URLSearchParams[] {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get('/api/admin/scoresheets', ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        items: [
          {
            id: 'sheet-1',
            event: {
              id: 'event-1',
              startsAt: '2026-10-03T12:00:00.000Z',
              opponentName: 'ASB Rezé',
            },
            team: { id: 'team-1', name: 'U13 F', category: 'U13', gender: 'WOMEN' },
            status: 'FAILED',
            attemptCount: 5,
            failureReason: 'Le service de lecture est saturé.',
            uploadedAt: '2026-10-03T15:12:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      });
    }),
  );
  return requests;
}

describe('AdminScoresheetsPage', () => {
  it('opens on the sheets that need someone: failed or to review', async () => {
    const requests = serveSheets();

    renderWithProviders(<AdminScoresheetsPage />, { route: '/admin/scoresheets' });

    expect(await screen.findByRole('link', { name: 'Match · ASB Rezé' })).toHaveAttribute(
      'href',
      '/admin/events/event-1',
    );
    expect(screen.getByText('Le service de lecture est saturé.')).toBeInTheDocument();
    expect(requests[0].get('status')).toBe('FAILED,NEEDS_REVIEW');
  });

  it('asks for sheets queued for over an hour in the « Bloquées » view', async () => {
    const requests = serveSheets();
    const user = userEvent.setup();

    renderWithProviders(<AdminScoresheetsPage />, { route: '/admin/scoresheets' });
    await screen.findByRole('link', { name: 'Match · ASB Rezé' });
    await user.click(
      within(screen.getByRole('group', { name: 'Statut' })).getByRole('button', {
        name: 'Bloquées',
      }),
    );

    await screen.findByRole('link', { name: 'Match · ASB Rezé' });
    const last = requests[requests.length - 1]!;
    expect(last.get('status')).toBe('QUEUED,PROCESSING');
    expect(new Date(last.get('to')!).getTime()).toBeLessThan(Date.now() - 59 * 60 * 1000);
  });
});
