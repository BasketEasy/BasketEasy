import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamDeleteModal } from './TeamDeleteModal';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('TeamDeleteModal', () => {
  it('requires typing the team name before deleting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamDeleteModal clubId="c1" teamId="t1" teamName="U15 Filles" />);

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    const confirm = screen.getByRole('button', { name: /Supprimer définitivement/ });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/Saisissez/), 'U15 Filles');
    expect(confirm).toBeEnabled();
  });

  it('states the blast radius with the given player and event counts', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TeamDeleteModal
        clubId="c1"
        teamId="t1"
        teamName="U15 Filles"
        playerCount={14}
        eventCount={32}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(
      screen.getByText(
        '« U15 Filles » sera supprimée définitivement, avec son effectif (14) et tous ses événements (32). Cette action est irréversible.',
      ),
    ).toBeInTheDocument();
  });

  it('deletes the team and navigates to the club teams tab on success', async () => {
    let deleteCalled = false;
    server.use(
      http.delete('/api/clubs/c1/teams/t1', () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<TeamDeleteModal clubId="c1" teamId="t1" teamName="U15 Filles" />);

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await user.type(screen.getByLabelText(/Saisissez/), 'U15 Filles');
    await user.click(screen.getByRole('button', { name: /Supprimer définitivement/ }));

    await waitFor(() => expect(deleteCalled).toBe(true));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/clubs/c1/members?tab=teams'));
  });

  it('shows a mapped error message on failure', async () => {
    server.use(
      http.delete('/api/clubs/c1/teams/t1', () =>
        HttpResponse.json({ message: 'Bad request' }, { status: 400 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <>
        <TeamDeleteModal clubId="c1" teamId="t1" teamName="U15 Filles" />
        <Toaster />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await user.type(screen.getByLabelText(/Saisissez/), 'U15 Filles');
    await user.click(screen.getByRole('button', { name: /Supprimer définitivement/ }));

    expect(
      await screen.findByText('Certaines informations saisies sont invalides.'),
    ).toBeInTheDocument();
  });
});
