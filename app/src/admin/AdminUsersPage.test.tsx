import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AdminUsersPage } from './AdminUsersPage';

const LAST_ACTIVE = new Date(Date.now() - 350 * 24 * 60 * 60 * 1000).toISOString();

describe('AdminUsersPage', () => {
  it('shows the domain and never the address', async () => {
    // The redaction is the feature: opening a record is the audited
    // ADMIN_PII_VIEWED moment, so the list must not already identify anyone.
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          items: [
            {
              id: 'user-9',
              emailDomain: 'example.org',
              lastActiveAt: LAST_ACTIVE,
              daysUntilErasure: 15,
              clubCount: 2,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 25,
        }),
      ),
    );

    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByText('example.org')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir la fiche' })).toHaveAttribute(
      'href',
      '/admin/users/user-9',
    );
  });

  it('flags an account already past the 12-month cutoff', async () => {
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json({
          items: [
            {
              id: 'user-9',
              emailDomain: 'example.org',
              lastActiveAt: LAST_ACTIVE,
              daysUntilErasure: -20,
              clubCount: 0,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 25,
        }),
      ),
    );

    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByText('Dépassée')).toBeInTheDocument();
  });

  it('says nothing is due rather than showing an error', async () => {
    server.use(
      http.get('/api/admin/users', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
      ),
    );

    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByText('Aucun compte concerné')).toBeInTheDocument();
  });

  it('shows the error branch, not an empty state, when the query fails', async () => {
    // An error falling through to EmptyState would tell an admin no accounts
    // are due for erasure when the list merely failed to load.
    server.use(http.get('/api/admin/users', () => HttpResponse.json({}, { status: 500 })));

    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Aucun compte concerné')).not.toBeInTheDocument();
  });
});
