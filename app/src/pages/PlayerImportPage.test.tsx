import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import App from '../App';

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[]) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships }),
    ),
  );
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, pageSize: 100 };
}

async function reachPreviewStep(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['Prénom,Nom\nThéo,Dupont'], 'export.csv', { type: 'text/csv' });
  const input = await screen.findByLabelText('Choisir un fichier à importer');
  await user.upload(input, file);

  const continueButton = await screen.findByRole('button', { name: 'Continuer' });
  await user.click(continueButton);
}

describe('PlayerImportPage', () => {
  it('walks a CSV through mapping and preview, then imports and returns to the roster', async () => {
    const user = userEvent.setup();
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);

    let importBody: unknown;
    server.use(
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.post('/api/clubs/club-1/players/import', async ({ request }) => {
        importBody = await request.json();
        return HttpResponse.json({ created: 1, updated: 0, conflicts: 0 });
      }),
      http.get('/api/clubs/club-1', () =>
        HttpResponse.json({ id: 'club-1', name: 'ASB Rezé', createdAt: 'x' }),
      ),
      http.get('/api/clubs/club-1/members', () => HttpResponse.json(paginated([]))),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/import-players' });

    await reachPreviewStep(user);

    await screen.findByText('Vérifier et confirmer');
    expect(screen.getByText('Théo')).toBeInTheDocument();
    expect(screen.getByText('Dupont')).toBeInTheDocument();
    expect(screen.getByText('Créer')).toBeInTheDocument();

    const importButton = screen.getByRole('button', { name: 'Importer 1 joueur' });
    await user.click(importButton);

    await waitFor(() =>
      expect(importBody).toEqual({ rows: [{ firstName: 'Théo', lastName: 'Dupont' }] }),
    );
    expect(await screen.findByText('Import terminé')).toBeInTheDocument();
  });

  it('shows an error branch, not a false "no duplicates" preview, when the existing roster fails to load', async () => {
    const user = userEvent.setup();
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);

    server.use(
      http.get('/api/clubs/club-1/players', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
      http.get('/api/clubs/club-1', () =>
        HttpResponse.json({ id: 'club-1', name: 'ASB Rezé', createdAt: 'x' }),
      ),
      http.get('/api/clubs/club-1/members', () => HttpResponse.json(paginated([]))),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/import-players' });

    await reachPreviewStep(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/chargement impossible/i);
    expect(screen.queryByText('Vérifier et confirmer')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retour' }));
    await screen.findByText('Faire correspondre les colonnes');
  });
});
