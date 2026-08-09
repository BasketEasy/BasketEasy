import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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

  it('submits without a userId when no member is linked', async () => {
    let capturedBody: unknown;
    server.use(
      http.post('/api/clubs/club-1/players', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: 'p1',
          clubId: 'club-1',
          firstName: 'Alex',
          lastName: 'Dupont',
          userId: null,
          createdAt: '2026-01-01',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<PlayerCreateForm clubId="club-1" />);

    await user.type(screen.getByLabelText(/prénom/i), 'Alex');
    await user.type(screen.getByLabelText(/^nom$/i), 'Dupont');
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody).toEqual({ firstName: 'Alex', lastName: 'Dupont' });
  });

  it('links the player to the selected member on submit', async () => {
    let capturedBody: unknown;
    server.use(
      http.post('/api/clubs/club-1/players', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: 'p1',
          clubId: 'club-1',
          firstName: 'Alex',
          lastName: 'Dupont',
          userId: 'user-2',
          createdAt: '2026-01-01',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <PlayerCreateForm
        clubId="club-1"
        linkableMembers={[
          {
            userId: 'user-2',
            email: 'b@example.com',
            firstName: null,
            lastName: null,
            role: 'MEMBER',
            joinedAt: 'x',
          },
        ]}
      />,
    );

    await user.type(screen.getByLabelText(/prénom/i), 'Alex');
    await user.type(screen.getByLabelText(/^nom$/i), 'Dupont');
    await user.click(screen.getByRole('combobox', { name: /compte lié/i }));
    await user.click(await screen.findByRole('option', { name: 'b@example.com' }));
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody).toEqual({ firstName: 'Alex', lastName: 'Dupont', userId: 'user-2' });
  });

  it('pre-fills firstName/lastName when selecting a linked member with a profile name', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PlayerCreateForm
        clubId="club-1"
        linkableMembers={[
          {
            userId: 'user-2',
            email: 'b@example.com',
            firstName: 'Bianca',
            lastName: 'Martin',
            role: 'MEMBER',
            joinedAt: 'x',
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: /compte lié/i }));
    await user.click(await screen.findByRole('option', { name: 'b@example.com' }));

    expect(screen.getByLabelText(/prénom/i)).toHaveValue('Bianca');
    expect(screen.getByLabelText(/^nom$/i)).toHaveValue('Martin');
  });

  it('leaves the name fields untouched when the selected member has no profile name', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PlayerCreateForm
        clubId="club-1"
        linkableMembers={[
          {
            userId: 'user-2',
            email: 'b@example.com',
            firstName: null,
            lastName: null,
            role: 'MEMBER',
            joinedAt: 'x',
          },
        ]}
      />,
    );

    await user.type(screen.getByLabelText(/prénom/i), 'Alex');
    await user.type(screen.getByLabelText(/^nom$/i), 'Dupont');
    await user.click(screen.getByRole('combobox', { name: /compte lié/i }));
    await user.click(await screen.findByRole('option', { name: 'b@example.com' }));

    expect(screen.getByLabelText(/prénom/i)).toHaveValue('Alex');
    expect(screen.getByLabelText(/^nom$/i)).toHaveValue('Dupont');
  });

  it('preserves a manual edit made after auto-fill when submitting', async () => {
    let capturedBody: unknown;
    server.use(
      http.post('/api/clubs/club-1/players', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: 'p1',
          clubId: 'club-1',
          firstName: 'Bianca',
          lastName: 'Leblanc',
          userId: 'user-2',
          createdAt: '2026-01-01',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <PlayerCreateForm
        clubId="club-1"
        linkableMembers={[
          {
            userId: 'user-2',
            email: 'b@example.com',
            firstName: 'Bianca',
            lastName: 'Martin',
            role: 'MEMBER',
            joinedAt: 'x',
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: /compte lié/i }));
    await user.click(await screen.findByRole('option', { name: 'b@example.com' }));

    expect(screen.getByLabelText(/prénom/i)).toHaveValue('Bianca');
    expect(screen.getByLabelText(/^nom$/i)).toHaveValue('Martin');

    const lastNameInput = screen.getByLabelText(/^nom$/i);
    await user.clear(lastNameInput);
    await user.type(lastNameInput, 'Leblanc');

    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody).toEqual({ firstName: 'Bianca', lastName: 'Leblanc', userId: 'user-2' });
  });
});
