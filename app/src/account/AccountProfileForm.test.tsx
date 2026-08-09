import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AccountProfileForm } from './AccountProfileForm';

function renderLoggedIn(overrides: Partial<Record<string, unknown>> = {}) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'a@b.com',
        firstName: 'Alix',
        lastName: 'Martin',
        avatarUrl: 'https://example.com/avatar.png',
        memberships: [],
        ...overrides,
      }),
    ),
  );
  return renderWithProviders(<AccountProfileForm />);
}

describe('AccountProfileForm', () => {
  it('pre-fills the form fields from the logged-in user', async () => {
    renderLoggedIn();

    await waitFor(() => expect(screen.getByLabelText(/prénom/i)).toHaveValue('Alix'));
    expect(screen.getByLabelText(/^nom$/i)).toHaveValue('Martin');
    expect(screen.getByLabelText(/url de l'avatar/i)).toHaveValue('https://example.com/avatar.png');
  });

  it('updates the session cache on a successful submit', async () => {
    let requestBody: unknown;
    renderLoggedIn();

    await waitFor(() => expect(screen.getByLabelText(/prénom/i)).toHaveValue('Alix'));

    server.use(
      http.patch('/api/auth/me', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          id: 'user-1',
          email: 'a@b.com',
          firstName: 'Alix',
          lastName: 'Dupont',
          avatarUrl: 'https://example.com/avatar.png',
          memberships: [],
        });
      }),
    );

    const user = userEvent.setup();
    const lastNameInput = screen.getByLabelText(/^nom$/i);
    await user.clear(lastNameInput);
    await user.type(lastNameInput, 'Dupont');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() =>
      expect(requestBody).toEqual({
        firstName: 'Alix',
        lastName: 'Dupont',
        avatarUrl: 'https://example.com/avatar.png',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/mis à jour/i);
  });

  it('shows a French, submit-level error when the update fails', async () => {
    renderLoggedIn();

    await waitFor(() => expect(screen.getByLabelText(/prénom/i)).toHaveValue('Alix'));

    server.use(
      http.patch('/api/auth/me', () =>
        HttpResponse.json({ message: 'Invalid input' }, { status: 400 }),
      ),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalides/i);
  });
});
