import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccount } from '../auth/useAccount';
import { usePersonas } from './usePersonas';
import { ActingAsContext, resolvePersona } from './useActingAs';

const storageKey = (userId: string) => `kluvo.actingAs.${userId}`;

// localStorage is a convenience here (reopen on the child you left), never a
// source of truth: every access is guarded, and a missing or stale value
// falls back through resolvePersona like any other.
function readStored(userId: string): string | null | undefined {
  try {
    const value = window.localStorage.getItem(storageKey(userId));
    if (value === null) return undefined;
    return value === 'self' ? null : value;
  } catch {
    return undefined;
  }
}

function writeStored(userId: string, playerId: string | null): void {
  try {
    window.localStorage.setItem(storageKey(userId), playerId ?? 'self');
  } catch {
    // Private mode or blocked storage: the choice just won't survive a reload.
  }
}

/**
 * Holds the persona for the whole logged-in app. Mounted in ProtectedRoute
 * beside ActiveClubProvider. A `?pour=<playerId>` on any URL (a notification
 * deep link) switches to that child and is then stripped, so a reload or a
 * shared link doesn't keep forcing it.
 */
export function ActingAsProvider({ children }: { children: ReactNode }) {
  const { user } = useAccount();
  const { data: personas, isPending } = usePersonas();
  const location = useLocation();
  const navigate = useNavigate();
  const userId = user?.id;
  // undefined = nothing asked for yet; null = « Moi » chosen explicitly.
  const [requested, setRequested] = useState<string | null | undefined>(() =>
    userId ? readStored(userId) : undefined,
  );
  const [isSwitcherOpen, setSwitcherOpen] = useState(false);

  // The remembered choice, once the session names whose it is.
  useEffect(() => {
    if (!userId) return;
    setRequested((current) => (current !== undefined ? current : readStored(userId)));
  }, [userId]);

  // Every choice — the sheet, a ?pour= link — is remembered for next time.
  useEffect(() => {
    if (userId && requested !== undefined) writeStored(userId, requested);
  }, [userId, requested]);

  const pour = new URLSearchParams(location.search).get('pour');
  useEffect(() => {
    if (!pour) return;
    setRequested(pour);
    const params = new URLSearchParams(location.search);
    params.delete('pour');
    const search = params.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
      { replace: true, state: location.state },
    );
  }, [pour, location.pathname, location.search, location.hash, location.state, navigate]);

  const setForPlayerId = useCallback((playerId: string | null) => setRequested(playerId), []);

  const value = useMemo(() => {
    // A failed persona read leaves the app acting as the user themself
    // rather than blocking every screen on it.
    const forPlayerId = personas ? resolvePersona(personas, pour ?? requested) : null;
    return {
      forPlayerId,
      persona: personas?.children.find((child) => child.playerId === forPlayerId) ?? null,
      personas,
      // Only a pending *child* request has to wait for the persona list: with
      // nothing asked for, « Moi » is the answer for everyone but a
      // guardian-only user, so the app doesn't hold every screen back on it.
      isReady: !isPending || !(pour ?? requested),
      setForPlayerId,
      isSwitcherOpen,
      setSwitcherOpen,
    };
  }, [personas, pour, requested, isPending, setForPlayerId, isSwitcherOpen]);

  return <ActingAsContext.Provider value={value}>{children}</ActingAsContext.Provider>;
}
