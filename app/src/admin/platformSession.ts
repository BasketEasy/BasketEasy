import { useCallback, useSyncExternalStore } from 'react';
import type { PlatformRole } from '@basketeasy/types/platform-admin';
import { setPlatformToken } from '../api/client';

/**
 * The back-office step-up session.
 *
 * Module state plus useSyncExternalStore rather than a Context provider,
 * because the *only* place it is written from is the TOTP form and the only
 * places it is read from are the admin shell and the api client — a provider
 * would add a tree to mount around a value that never crosses the admin
 * subtree's boundary.
 *
 * Nothing here touches localStorage or sessionStorage on purpose. The token
 * lives 15 minutes and is deliberately not refreshable; persisting it would
 * defeat the reason it is short-lived, which is that a back-office tab left
 * open on a shared machine must go cold.
 */
interface PlatformSession {
  role: PlatformRole;
  expiresAt: number;
}

let session: PlatformSession | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PlatformSession | null {
  // Expiry is checked on read rather than on a timer: a timer would have to
  // be cancelled on unmount and would fire in a background tab, and the only
  // moment staleness matters is when something is about to render or send.
  //
  // Deliberately drops the session *without* emitting. getSnapshot is called
  // during render and must stay free of side effects that re-enter React;
  // dropping it here keeps every subsequent read consistently null, and the
  // re-prompt is driven by the 403 the next request gets, which does emit.
  if (session && session.expiresAt <= Date.now()) {
    session = null;
    setPlatformToken(null);
  }
  return session;
}

export function startPlatformSession(token: string, expiresAt: string, role: PlatformRole): void {
  session = { role, expiresAt: new Date(expiresAt).getTime() };
  setPlatformToken(token);
  emit();
}

export function clearPlatformSession(): void {
  session = null;
  setPlatformToken(null);
  emit();
}

export function usePlatformSession(): {
  session: PlatformSession | null;
  endSession: () => void;
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const endSession = useCallback(() => clearPlatformSession(), []);
  return { session: current, endSession };
}
