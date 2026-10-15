import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountProvider } from '../auth/AccountContext';
import { LoginPage } from './LoginPage';

function renderLoginPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<div>Page de création de compte</div>} />
          </Routes>
        </MemoryRouter>
      </AccountProvider>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  it('renders the login form', () => {
    renderLoginPage();
    expect(screen.getByRole('heading', { name: /se connecter/i })).toBeInTheDocument();
  });

  it('navigates to /register when switching to the register form', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole('link', { name: /créer un compte/i }));

    expect(screen.getByText('Page de création de compte')).toBeInTheDocument();
  });
});
