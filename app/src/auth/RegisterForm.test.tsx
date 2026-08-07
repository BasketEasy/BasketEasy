import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { AuthProvider } from './AuthContext';
import { RegisterForm } from './RegisterForm';

function renderRegisterForm(onSwitchToLogin = vi.fn()) {
  return render(
    <AuthProvider>
      <RegisterForm onSwitchToLogin={onSwitchToLogin} />
    </AuthProvider>,
  );
}

describe('RegisterForm', () => {
  it('shows a validation error for a password under 8 characters', async () => {
    const user = userEvent.setup();
    renderRegisterForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'new@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'short');
    await user.click(screen.getByRole('button', { name: /créer un compte/i }));

    expect(await screen.findByText(/8/)).toBeInTheDocument();
  });

  it('submits valid data and does not show an error on success', async () => {
    let registerCalled = false;
    server.use(
      http.post('/api/auth/register', async ({ request }) => {
        registerCalled = true;
        const body = (await request.json()) as { email: string; password: string };
        expect(body).toEqual({ email: 'new@b.com', password: 'password123' });
        return HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'new@b.com', memberships: [] },
        });
      }),
    );

    const user = userEvent.setup();
    renderRegisterForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'new@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /créer un compte/i }));

    await waitFor(() => expect(registerCalled).toBe(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a submit-level error on a 409 (duplicate email)', async () => {
    server.use(
      http.post('/api/auth/register', () =>
        HttpResponse.json({ message: 'Email already in use' }, { status: 409 }),
      ),
    );

    const user = userEvent.setup();
    renderRegisterForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'a@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /créer un compte/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already in use/i);
  });

  it('calls onSwitchToLogin when the toggle link is clicked', async () => {
    const onSwitchToLogin = vi.fn();
    const user = userEvent.setup();
    renderRegisterForm(onSwitchToLogin);

    await user.click(screen.getByRole('button', { name: /j'ai déjà un compte/i }));

    expect(onSwitchToLogin).toHaveBeenCalledTimes(1);
  });
});
