import { useCallback, useState } from 'react';

const storageKey = (token: string) => `kluvo.guest.${token}`;

function read(token: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(token));
  } catch {
    return null;
  }
}

/**
 * Who the visitor said they are, kept on the device under the link's token.
 * A convenience only: storage can be blocked or cleared, and the page must
 * work without it (the picker just shows again).
 */
export function useGuestIdentity(token: string) {
  const [teamPlayerId, setTeamPlayerId] = useState<string | null>(() => read(token));

  const choose = useCallback(
    (id: string) => {
      setTeamPlayerId(id);
      try {
        window.localStorage.setItem(storageKey(token), id);
      } catch {
        // Blocked storage: the choice lasts until the page is closed.
      }
    },
    [token],
  );

  const reset = useCallback(() => {
    setTeamPlayerId(null);
    try {
      window.localStorage.removeItem(storageKey(token));
    } catch {
      // Nothing stored, nothing to clear.
    }
  }, [token]);

  return { teamPlayerId, choose, reset };
}
