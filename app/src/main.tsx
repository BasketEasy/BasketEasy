import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AccountProvider } from './auth/AccountContext';
import App from './App';
import './index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        {/* ActiveClubProvider is mounted inside ProtectedRoute instead of
            here: every consumer (AppHeader, AppBottomNav, AccountPage) only
            renders behind a resolved login, so wrapping the whole app —
            landing page, login, register — gave it nothing to do there but
            still subscribe to the account session on every route. */}
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AccountProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
