// The context object and its consumer hook live together in one file (as
// opposed to a dedicated context.ts + useActiveClub.ts split): neither
// exports a component, so eslint-plugin-react-refresh's
// only-export-components rule — the reason ActiveClubContext.tsx can't also
// export these — doesn't apply here, and one small file beats three. Mirrors
// useAccount.ts's split.
import { createContext, useContext } from 'react';

export interface ActiveClubContextValue {
  activeClubId: string | null;
  setActiveClubId: (clubId: string) => void;
}

export const ActiveClubContext = createContext<ActiveClubContextValue | null>(null);

export function useActiveClub(): ActiveClubContextValue {
  const value = useContext(ActiveClubContext);
  if (!value) {
    throw new Error('useActiveClub must be used within an ActiveClubProvider');
  }
  return value;
}
