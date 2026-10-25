import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { createQueryClient } from './api/queryClient';
import { AccountProvider } from './auth/AccountContext';
import App from './App';
import './index.css';

const queryClient = createQueryClient();

const tree = (
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
  </React.StrictMode>
);

const container = document.getElementById('root') as HTMLElement;
// A public route ships prerendered (scripts/prerender.mjs): attach to it. Any
// other route has had its root emptied by the inline script in index.html.
if (container.hasChildNodes()) {
  ReactDOM.hydrateRoot(container, tree);
} else {
  ReactDOM.createRoot(container).render(tree);
}
