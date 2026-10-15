import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import type { AdminSearchResult } from '@basketeasy/types/platform-admin-search';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AdminSearchBox } from './AdminSearchBox';

const ID = '4f2c9a1e-8b3d-4c55-9e10-7a6b2d9c0f31';

const TEXT_RESULT: AdminSearchResult = {
  query: 'bernard',
  exactId: null,
  unknownId: false,
  groups: {
    user: [
      { kind: 'user', id: 'user-1', label: 'Nicolas Bernard', sublabel: 'n.bernard@example.fr' },
    ],
    player: [{ kind: 'player', id: 'player-1', label: 'Léo Bernard', sublabel: 'BC Nantes Erdre' }],
    club: [],
    team: [],
  },
};

function serve(result: AdminSearchResult) {
  server.use(http.get('/api/admin/search', () => HttpResponse.json(result)));
}

function renderBox() {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/clubs" element={<AdminSearchBox />} />
      <Route path="/admin/users/:id" element={<p>Fiche utilisateur</p>} />
      <Route path="/admin/players/:id" element={<p>Fiche joueur</p>} />
      <Route path="/admin/search" element={<p>Page de résultats</p>} />
    </Routes>,
    { route: '/admin/clubs' },
  );
}

describe('AdminSearchBox', () => {
  it('groups hits by kind once two characters are typed', async () => {
    serve(TEXT_RESULT);
    const user = userEvent.setup();
    renderBox();

    const input = screen.getByRole('combobox', { name: 'Rechercher dans le back-office' });
    await user.type(input, 'b');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.type(input, 'ernard');
    const list = await screen.findByRole('listbox');
    expect(within(list).getByRole('group', { name: 'Utilisateurs' })).toBeInTheDocument();
    expect(within(list).getByRole('option', { name: /Léo Bernard/ })).toHaveAttribute(
      'href',
      '/admin/players/player-1',
    );
  });

  it('moves through every hit with the arrow keys and opens the highlighted one', async () => {
    serve(TEXT_RESULT);
    const user = userEvent.setup();
    renderBox();

    const input = screen.getByRole('combobox');
    await user.type(input, 'bernard');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{ArrowDown}');

    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /Léo Bernard/ }).id,
    );
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Fiche joueur')).toBeInTheDocument();
  });

  it('opens a pasted id straight away on Enter', async () => {
    serve({
      query: ID,
      exactId: { kind: 'user', id: ID, label: 'J. D.', sublabel: '…@example.org' },
      unknownId: false,
      groups: { user: [], player: [], club: [], team: [] },
    });
    const user = userEvent.setup();
    renderBox();

    await user.type(screen.getByRole('combobox'), ID);
    await screen.findByRole('option', { name: /J\. D\./ });
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Fiche utilisateur')).toBeInTheDocument();
  });

  it('goes to the full results page on Enter with nothing highlighted', async () => {
    serve(TEXT_RESULT);
    const user = userEvent.setup();
    renderBox();

    await user.type(screen.getByRole('combobox'), 'bernard');
    await screen.findByRole('listbox');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Page de résultats')).toBeInTheDocument();
  });

  it('says when an id matches nothing', async () => {
    serve({
      query: ID,
      exactId: null,
      unknownId: true,
      groups: { user: [], player: [], club: [], team: [] },
    });
    const user = userEvent.setup();
    renderBox();

    await user.type(screen.getByRole('combobox'), ID);

    expect(await screen.findByText(/Aucun club, équipe, compte/)).toBeInTheDocument();
  });
});
