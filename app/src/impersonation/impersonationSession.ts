import { useSyncExternalStore } from 'react';
import type { StartImpersonationResponse } from '@basketeasy/types/platform-admin-impersonation';
import { setImpersonationToken } from '../api/client';

/**
 * The live read-only impersonation, if any: a DATA_OFFICER viewing the
 * product as another user. Threat model:
 * docs/decisions/rgpd-and-backoffice.md.
 *
 * Module state plus useSyncExternalStore, the same shape as the back-office's
 * platformSession: it is written from one dialog and one exit path, and read
 * by the api client, the session query and the banner. Memory only, never
 * storage: a reload ends it, which is the intended way for it to go cold.
 */
export interface ImpersonationState {
  sessionId: string;
  subjectId: string;
  displayName: string;
  expiresAt: number;
}

let state: ImpersonationState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ImpersonationState | null {
  return state;
}

export function beginImpersonation(response: StartImpersonationResponse): void {
  state = {
    sessionId: response.sessionId,
    subjectId: response.subject.id,
    displayName: response.subject.displayName,
    expiresAt: new Date(response.expiresAt).getTime(),
  };
  setImpersonationToken(response.token);
  emit();
}

/** Drops the token and the state; returns what was live, for the exit path. */
export function dropImpersonation(): ImpersonationState | null {
  const previous = state;
  state = null;
  setImpersonationToken(null);
  emit();
  return previous;
}

/** For non-React callers (the session query, the persona store). */
export function isImpersonating(): boolean {
  return state !== null;
}

export function useImpersonation(): ImpersonationState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
