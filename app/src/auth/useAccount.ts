// The context object and its consumer hook live together in one file (as
// opposed to a dedicated context.ts + useAuth.ts split): neither exports a
// component, so eslint-plugin-react-refresh's
// only-export-components rule — the reason AccountContext.tsx can't also
// export these — doesn't apply here, and one small file beats three.
import { createContext, useContext } from 'react';
import type { AuthUser } from '@basketeasy/types/auth';

export interface AccountContextValue {
  user: AuthUser | null;
  isLoading: boolean;
}

export const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return value;
}
