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
  // This session's explicit choice (the sheet, a ?pour= link), else the one
  // remembered from last time. The stored value is read during render, not in
  // an effect, so it is known before the write-back below can replace it.
  // undefined = nothing asked for yet; null = « Moi ».
  const [chosen, setRequested] = useState<string | null | undefined>(undefined);
  const stored = useMemo(() => (userId ? readStored(userId) : undefined), [userId]);
  const requested = chosen !== undefined ? chosen : stored;
  const [isSwitcherOpen, setSwitcherOpen] = useState(false);

  const pour = new URLSearchParams(location.search).get('pour');
  // What the app actually acts as, once the persona list is known. A failed
  // persona read leaves the app acting as the user themself rather than
  // blocking every screen on it.
  const resolved = personas ? resolvePersona(personas, pour ?? requested) : undefined;

  // Every choice — the sheet, a ?pour= link, the default — is remembered as
  // resolved, so a stale or foreign ?pour= id never lands in storage, and the
  // next visit already knows the answer instead of waiting for the list.
  useEffect(() => {
    if (userId && resolved !== undefined) writeStored(userId, resolved);
  }, [userId, resolved]);

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
    const forPlayerId = resolved ?? null;
    return {
      forPlayerId,
      persona: personas?.children.find((child) => child.playerId === forPlayerId) ?? null,
      personas,
      // Only an explicit « Moi » can skip waiting for the persona list. With
      // nothing asked for yet (a first visit), a guardian-only user resolves
      // to their child, and loading as « Moi » first would flash an empty
      // dashboard — exactly the first screen after accepting an invite.
      isReady: !isPending || (pour ?? requested) === null,
      setForPlayerId,
      isSwitcherOpen,
      setSwitcherOpen,
    };
  }, [resolved, personas, pour, requested, isPending, setForPlayerId, isSwitcherOpen]);

  return <ActingAsContext.Provider value={value}>{children}</ActingAsContext.Provider>;
}
