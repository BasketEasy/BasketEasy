// The context object and its consumer hook live together in one file (as
// opposed to a dedicated context.ts + useAuth.ts split): neither exports a
// component, so eslint-plugin-react-refresh's
// only-export-components rule — the reason AccountContext.tsx can't also
// export these — doesn't apply here, and one small file beats three.
import { createContext, useContext } from 'react';
import type { User } from '@basketeasy/types/auth';

export interface AccountContextValue {
  user: User | null;
  isLoading: boolean;
  /** The session could not be restored (as opposed to there being none). */
  isError: boolean;
  /** Re-runs the session restore after `isError`. */
  retry: () => void;
}

export const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return value;
}
