import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { AdminSearchResult } from '@basketeasy/types/platform-admin-search';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AdminSearchPage } from './AdminSearchPage';
import { clearPlatformSession, startPlatformSession } from './platformSession';

function serve(result: AdminSearchResult) {
  server.use(http.get('/api/admin/search', () => HttpResponse.json(result)));
}

function startSession(role: 'SUPPORT' | 'DATA_OFFICER') {
  startPlatformSession('platform-token', new Date(Date.now() + 15 * 60 * 1000).toISOString(), role);
}

describe('AdminSearchPage', () => {
  afterEach(() => clearPlatformSession());

  it('lists every group and links each to its filterable list', async () => {
    startSession('DATA_OFFICER');
    serve({
      query: 'bernard',
      exactId: null,
      unknownId: false,
      groups: {
        user: [{ kind: 'user', id: 'user-1', label: 'Nicolas Bernard', sublabel: null }],
        player: [],
        club: [{ kind: 'club', id: 'club-9', label: 'Saint-Bernard Basket', sublabel: null }],
        team: [],
      },
    });

    renderWithProviders(<AdminSearchPage />, { route: '/admin/search?q=bernard' });

    expect(await screen.findByRole('link', { name: 'Nicolas Bernard' })).toHaveAttribute(
      'href',
      '/admin/users/user-1',
    );
    expect(
      screen.getByRole('link', { name: 'Ouvrir dans la liste des utilisateurs' }),
    ).toHaveAttribute('href', '/admin/users?q=bernard');
    expect(screen.getByText('Aucun résultat parmi les joueurs.')).toBeInTheDocument();
  });

  it('explains to SUPPORT why a name finds nobody', async () => {
    startSession('SUPPORT');
    serve({
      query: 'bernard',
      exactId: null,
      unknownId: false,
      groups: { user: [], player: [], club: [], team: [] },
    });

    renderWithProviders(<AdminSearchPage />, { route: '/admin/search?q=bernard' });

    expect(await screen.findByText(/adresse e-mail complète/)).toBeInTheDocument();
  });
});
