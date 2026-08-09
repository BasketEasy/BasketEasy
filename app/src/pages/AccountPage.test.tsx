import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AccountPage } from './AccountPage';

function renderLoggedIn() {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'a@b.com',
        firstName: 'Alix',
        lastName: 'Martin',
        avatarUrl: null,
        memberships: [],
      }),
    ),
  );
  return renderWithProviders(<AccountPage />);
}

describe('AccountPage', () => {
  it('renders the account profile form inside a card', async () => {
    renderLoggedIn();

    expect(screen.getByRole('heading', { name: /mon compte/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/prénom/i)).toHaveValue('Alix'));
  });
});
