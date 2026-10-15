import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamCreateForm } from './TeamCreateForm';

const FFBB_URL = 'https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/1';

function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  return Promise.resolve().then(async () => {
    await user.type(screen.getByLabelText(/nom de l'équipe/i), 'Seniors M1');
    await user.click(screen.getByRole('combobox', { name: /catégorie/i }));
    await user.click(await screen.findByRole('option', { name: 'Séniors' }));
    await user.click(screen.getByRole('combobox', { name: /genre/i }));
    await user.click(await screen.findByRole('option', { name: 'Masculin' }));
  });
}

describe('TeamCreateForm', () => {
  it('creates a team without an FFBB link when the field is left empty', async () => {
    let capturedBody: unknown;
    server.use(
      http.post('/api/clubs/club-1/teams', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: 'team-1',
          name: 'Seniors M1',
          category: 'SENIORS',
          gender: 'MEN',
          createdAt: 'x',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TeamCreateForm clubId="club-1" />);
    await fillRequiredFields(user);

    await user.click(screen.getByRole('button', { name: /créer l'équipe/i }));

    await waitFor(() =>
      expect(capturedBody).toEqual({ name: 'Seniors M1', category: 'SENIORS', gender: 'MEN' }),
    );
  });

  it('submits the pasted FFBB URL and clears the form on success', async () => {
    let capturedBody: unknown;
    server.use(
      http.post('/api/clubs/club-1/teams', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: 'team-1',
          name: 'Seniors M1',
          category: 'SENIORS',
          gender: 'MEN',
          createdAt: 'x',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TeamCreateForm clubId="club-1" />);
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/lien ffbb de l'équipe/i), FFBB_URL);

    await user.click(screen.getByRole('button', { name: /créer l'équipe/i }));

    await waitFor(() =>
      expect(capturedBody).toEqual({
        name: 'Seniors M1',
        category: 'SENIORS',
        gender: 'MEN',
        ffbbTeamUrl: FFBB_URL,
      }),
    );
  });

  it('shows a field-bound error, not a generic one, when the URL has a bad shape', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams', () =>
        HttpResponse.json(
          { message: 'Ce lien ne correspond pas au format attendu.', code: 'FFBB_LINK_INVALID' },
          { status: 400 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<TeamCreateForm clubId="club-1" />);
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/lien ffbb de l'équipe/i), '200000005346381');

    await user.click(screen.getByRole('button', { name: /créer l'équipe/i }));

    expect(await screen.findByText(/ne correspond pas au format attendu/i)).toBeInTheDocument();
    expect(screen.queryByText(/une erreur est survenue/i)).not.toBeInTheDocument();
  });

  it('shows a field-bound error when the URL does not resolve', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams', () =>
        HttpResponse.json(
          {
            message: 'Impossible de vérifier ce lien auprès de la FFBB pour le moment.',
            code: 'FFBB_LINK_UNREACHABLE',
          },
          { status: 400 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<TeamCreateForm clubId="club-1" />);
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/lien ffbb de l'équipe/i), FFBB_URL);

    await user.click(screen.getByRole('button', { name: /créer l'équipe/i }));

    expect(await screen.findByText(/impossible de vérifier ce lien/i)).toBeInTheDocument();
  });
});
