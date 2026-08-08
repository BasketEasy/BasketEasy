import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { PlayerCreateForm } from './PlayerCreateForm';

describe('PlayerCreateForm', () => {
  it('shows validation errors and does not submit when fields are empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlayerCreateForm clubId="club-1" />);

    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    expect(await screen.findByText(/prénom requis/i)).toBeInTheDocument();
    expect(screen.getByText(/^nom requis$/i)).toBeInTheDocument();
  });

  it('submits valid names, clears the fields, and calls onSuccess', async () => {
    let createCalled = false;
    server.use(
      http.post('/api/clubs/club-1/players', async ({ request }) => {
        createCalled = true;
        const body = (await request.json()) as { firstName: string; lastName: string };
        expect(body).toEqual({ firstName: 'Alex', lastName: 'Dupont' });
        return HttpResponse.json({
          id: 'p1',
          clubId: 'club-1',
          firstName: body.firstName,
          lastName: body.lastName,
          createdAt: '2026-01-01',
        });
      }),
    );

    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<PlayerCreateForm clubId="club-1" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/prénom/i), 'Alex');
    await user.type(screen.getByLabelText(/^nom$/i), 'Dupont');
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    await screen.findByRole('button', { name: /^ajouter$/i });
    expect(createCalled).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows a submit-level error on a server failure', async () => {
    server.use(
      http.post('/api/clubs/club-1/players', () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<PlayerCreateForm clubId="club-1" />);

    await user.type(screen.getByLabelText(/prénom/i), 'Alex');
    await user.type(screen.getByLabelText(/^nom$/i), 'Dupont');
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/erreur est survenue/i);
  });
});
