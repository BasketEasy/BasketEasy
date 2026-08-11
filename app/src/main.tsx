import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AccountProvider } from './auth/AccountContext';
import { ActiveClubProvider } from './auth/ActiveClubContext';
import App from './App';
import './index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <ActiveClubProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ActiveClubProvider>
      </AccountProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
