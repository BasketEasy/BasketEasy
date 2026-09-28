import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { AdminUserSummary } from '@basketeasy/types/platform-admin-browse';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AdminUsersPage } from './AdminUsersPage';
import { clearPlatformSession, startPlatformSession } from './platformSession';

const LAST_ACTIVE = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();

function summary(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    person: {
      kind: 'user',
      id: 'user-9',
      displayName: 'Jean Dupont',
      email: 'jean.dupont@example.org',
      emailDomain: 'example.org',
      redacted: false,
    },
    emailVerified: true,
    createdAt: LAST_ACTIVE,
    lastActiveAt: LAST_ACTIVE,
    daysUntilErasure: 340,
    clubCount: 2,
    guardianOfCount: 0,
    platformRole: null,
    ...overrides,
  };
}

/** Serves one page of users and records the query string of every request. */
function serveUsers(items: AdminUserSummary[]): URLSearchParams[] {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get('/api/admin/users', ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json({ items, total: items.length, page: 1, pageSize: 25 });
    }),
  );
  return requests;
}

function startSession(role: 'SUPPORT' | 'DATA_OFFICER') {
  startPlatformSession('platform-token', new Date(Date.now() + 15 * 60 * 1000).toISOString(), role);
}

describe('AdminUsersPage', () => {
  beforeEach(() => startSession('DATA_OFFICER'));
  afterEach(() => clearPlatformSession());

  it('lists every account, not only the inactive ones, and links each to its record', async () => {
    const requests = serveUsers([summary()]);

    renderWithProviders(<AdminUsersPage />, { route: '/admin/users' });

    expect(await screen.findByRole('link', { name: 'Jean Dupont' })).toHaveAttribute(
      'href',
      '/admin/users/user-9',
    );
    expect(screen.getByText('jean.dupont@example.org')).toBeInTheDocument();
    expect(requests[0].has('inactiveSoon')).toBe(false);
  });

  it('shows SUPPORT the redacted person and asks for an exact address', async () => {
    startSession('SUPPORT');
    serveUsers([
      summary({
        person: { ...summary().person, displayName: 'J. D.', email: null, redacted: true },
      }),
    ]);

    renderWithProviders(<AdminUsersPage />, { route: '/admin/users' });

    expect(await screen.findByRole('link', { name: 'J. D.' })).toBeInTheDocument();
    expect(screen.getByText('masqué')).toBeInTheDocument();
    expect(screen.getByText('…@example.org')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail exacte')).toBeInTheDocument();
  });

  it('turns the « Bientôt effacés » view into the inactiveSoon filter', async () => {
    const requests = serveUsers([summary({ daysUntilErasure: -6 })]);
    const user = userEvent.setup();

    renderWithProviders(<AdminUsersPage />, { route: '/admin/users' });
    await screen.findByRole('link', { name: 'Jean Dupont' });

    await user.click(
      within(screen.getByRole('group', { name: 'Vues rapides' })).getByRole('button', {
        name: 'Bientôt effacés',
      }),
    );

    expect(await screen.findByText('Dépassée')).toBeInTheDocument();
    expect(requests[requests.length - 1]?.get('inactiveSoon')).toBe('true');
  });

  it('shows the empty state when no account matches', async () => {
    serveUsers([]);

    renderWithProviders(<AdminUsersPage />, { route: '/admin/users' });

    expect(await screen.findByText('Aucun compte')).toBeInTheDocument();
  });

  it('shows the error branch, not an empty state, when the query fails', async () => {
    server.use(http.get('/api/admin/users', () => HttpResponse.json({}, { status: 500 })));

    renderWithProviders(<AdminUsersPage />, { route: '/admin/users' });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Aucun compte')).not.toBeInTheDocument();
  });
});
