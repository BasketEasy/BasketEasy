import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { AuthProvider } from './AuthContext';
import { LoginForm } from './LoginForm';

function renderLoginForm(onSwitchToRegister = vi.fn()) {
  return render(
    <AuthProvider>
      <LoginForm onSwitchToRegister={onSwitchToRegister} />
    </AuthProvider>,
  );
}

describe('LoginForm', () => {
  it('shows a validation error and does not submit for an invalid email', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'not-an-email');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(await screen.findByText(/email/i)).toBeInTheDocument();
  });

  it('submits valid credentials and does not show an error on success', async () => {
    let loginCalled = false;
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        loginCalled = true;
        const body = (await request.json()) as { email: string; password: string };
        expect(body).toEqual({ email: 'a@b.com', password: 'password123' });
        return HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'a@b.com', memberships: [] },
        });
      }),
    );

    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'a@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(loginCalled).toBe(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a submit-level error on a 401', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 }),
      ),
    );

    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'a@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid credentials/i);
  });

  it('calls onSwitchToRegister when the toggle link is clicked', async () => {
    const onSwitchToRegister = vi.fn();
    const user = userEvent.setup();
    renderLoginForm(onSwitchToRegister);

    await user.click(screen.getByRole('button', { name: /créer un compte/i }));

    expect(onSwitchToRegister).toHaveBeenCalledTimes(1);
  });
});
