import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountProvider } from '../auth/AccountContext';
import { RegisterPage } from './RegisterPage';

function renderRegisterPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <MemoryRouter initialEntries={['/register']}>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<div>Page de connexion</div>} />
          </Routes>
        </MemoryRouter>
      </AccountProvider>
    </QueryClientProvider>,
  );
}

describe('RegisterPage', () => {
  it('renders the register form', () => {
    renderRegisterPage();
    expect(screen.getByRole('heading', { name: /créer un compte/i })).toBeInTheDocument();
  });

  it('navigates to /login when switching to the login form', async () => {
    const user = userEvent.setup();
    renderRegisterPage();

    await user.click(screen.getByRole('link', { name: /j'ai déjà un compte/i }));

    expect(screen.getByText('Page de connexion')).toBeInTheDocument();
  });
});
