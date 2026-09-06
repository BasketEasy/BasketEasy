import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import type { Player } from '@basketeasy/types/players';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamPlayerAddForm } from './TeamPlayerAddForm';

const player: Player = {
  id: 'p1',
  clubId: 'club-1',
  firstName: 'Alex',
  lastName: 'Dupont',
  userId: null,
  nationalId: null,
  licenseNumber: null,
  birthDate: null,
  gender: null,
  licenseType: null,
  isMinor: false,
  parentalConsentGivenAt: null,
  createdAt: 'x',
};

function renderForm() {
  return renderWithProviders(
    <>
      <TeamPlayerAddForm clubId="club-1" teamId="team-1" addablePlayers={[player]} />
      <Toaster />
    </>,
  );
}

describe('TeamPlayerAddForm', () => {
  it('shows a validation error and does not submit when no player is selected', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /ajouter à l'effectif/i }));

    expect(await screen.findByText(/joueur requis/i)).toBeInTheDocument();
  });

  it('confirms a successful add with a toast', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/players', () =>
        HttpResponse.json({
          id: 'tp-1',
          teamId: 'team-1',
          playerId: 'p1',
          firstName: 'Alex',
          lastName: 'Dupont',
          clubId: 'club-1',
          role: 'PLAYER',
          createdAt: 'x',
        }),
      ),
    );

    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('combobox', { name: /joueur/i }));
    await user.click(await screen.findByRole('option', { name: /alex dupont/i }));
    await user.click(screen.getByRole('button', { name: /ajouter à l'effectif/i }));

    expect(await screen.findByText('Joueur ajouté à l’effectif')).toBeInTheDocument();
  });

  it('shows a submit-level error on a server failure', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/players', () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('combobox', { name: /joueur/i }));
    await user.click(await screen.findByRole('option', { name: /alex dupont/i }));
    await user.click(screen.getByRole('button', { name: /ajouter à l'effectif/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/erreur est survenue/i);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /ajouter à l'effectif/i })).toBeInTheDocument(),
    );
  });
});
