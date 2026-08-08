import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamCreateForm } from './TeamCreateForm';

describe('TeamCreateForm', () => {
  it('shows a validation error and does not submit for a too-short name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamCreateForm clubId="club-1" />);

    await user.type(screen.getByLabelText(/nom de l'équipe/i), 'A');
    await user.click(screen.getByRole('button', { name: /créer/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/2 caractères/i);
  });

  it('submits a valid name, clears the field, and calls onSuccess', async () => {
    let createCalled = false;
    server.use(
      http.post('/api/clubs/club-1/teams', async ({ request }) => {
        createCalled = true;
        const body = (await request.json()) as { name: string };
        expect(body).toEqual({ name: 'U15 Filles' });
        return HttpResponse.json({
          id: 'team-1',
          name: body.name,
          clubIds: ['club-1'],
          createdAt: '2026-01-01',
        });
      }),
    );

    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TeamCreateForm clubId="club-1" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/nom de l'équipe/i), 'U15 Filles');
    await user.click(screen.getByRole('button', { name: /créer/i }));

    await screen.findByRole('button', { name: /créer/i });
    expect(createCalled).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows a submit-level error on a server failure', async () => {
    server.use(
      http.post('/api/clubs/club-1/teams', () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<TeamCreateForm clubId="club-1" />);

    await user.type(screen.getByLabelText(/nom de l'équipe/i), 'U15 Filles');
    await user.click(screen.getByRole('button', { name: /créer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/erreur est survenue/i);
  });
});
