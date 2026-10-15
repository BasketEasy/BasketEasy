// Shared render helper for tests that need the session query + mutations to
// work (i.e. anything under an AccountProvider). A *fresh* QueryClient per
// render() call is the test-isolation mechanism here: TanStack Query caches
// by queryKey inside a QueryClient instance, so reusing one client across
// tests would let a later test's AccountProvider mount reuse an earlier
// test's cached ['auth', 'session'] result instead of hitting its own MSW
// handlers — the same class of bug the old module-level singleton's
// __resetSessionRestoreForTests() reset guarded against, replaced here by
// simply not sharing state between renders in the first place.
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountProvider } from './auth/AccountContext';
import { ActiveClubProvider } from './auth/ActiveClubContext';

export function renderWithProviders(ui: ReactNode, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <ActiveClubProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </ActiveClubProvider>
      </AccountProvider>
    </QueryClientProvider>,
  );
}
