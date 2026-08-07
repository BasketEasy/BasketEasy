import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { LoginForm } from './LoginForm';

function renderLoginForm(onSwitchToRegister = vi.fn()) {
  return renderWithProviders(<LoginForm onSwitchToRegister={onSwitchToRegister} />);
}

describe('LoginForm', () => {
  it('shows a validation error and does not submit for an invalid email', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'not-an-email');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/email/i);
  });

  it('associates the email error with the input for screen readers', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'not-an-email');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    const emailInput = screen.getByLabelText(/adresse e-mail/i);
    const alert = await screen.findByRole('alert');
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput).toHaveAttribute('aria-describedby', alert.id);
  });

  it('marks the email and password inputs with the right autoComplete values', () => {
    renderLoginForm();

    expect(screen.getByLabelText(/adresse e-mail/i)).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText(/mot de passe/i)).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
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

  it('shows a French, submit-level error on a 401 (not the raw backend message)', async () => {
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

    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect/i);
  });

  it('calls onSwitchToRegister when the toggle link is clicked', async () => {
    const onSwitchToRegister = vi.fn();
    const user = userEvent.setup();
    renderLoginForm(onSwitchToRegister);

    await user.click(screen.getByRole('button', { name: /créer un compte/i }));

    expect(onSwitchToRegister).toHaveBeenCalledTimes(1);
  });
});
