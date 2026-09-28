// Who the current screen acts for: « Moi » (null) or one child the user is a
// guardian of. Context + consumer hooks live together here, the provider in
// ActingAsContext.tsx — the same split as useActiveClub.ts, for the same
// react-refresh reason.
import { createContext, useContext } from 'react';
import type { ChildPersona, MyPersonas } from '@basketeasy/types/guardians';

export interface ActingAsContextValue {
  /** The child being acted for, or null for « Moi ». */
  forPlayerId: string | null;
  /** That child's persona (names, teams), or null for « Moi ». */
  persona: ChildPersona | null;
  personas: MyPersonas | undefined;
  /**
   * False while a requested child (a `?pour=` link, the remembered choice)
   * waits on the persona list — persona-scoped queries hold until then, so
   * they never fetch as « Moi » and flash the wrong answers first.
   */
  isReady: boolean;
  setForPlayerId: (playerId: string | null) => void;
  isSwitcherOpen: boolean;
  setSwitcherOpen: (open: boolean) => void;
}

// Outside a provider (public pages, component tests) the app simply acts as
// the user themself.
const SELF: ActingAsContextValue = {
  forPlayerId: null,
  persona: null,
  personas: undefined,
  isReady: true,
  setForPlayerId: () => undefined,
  isSwitcherOpen: false,
  setSwitcherOpen: () => undefined,
};

export const ActingAsContext = createContext<ActingAsContextValue>(SELF);

export function useActingAs(): ActingAsContextValue {
  return useContext(ActingAsContext);
}

/**
 * The persona to send for a request scoped to one team: the child when they
 * are rostered on that team, otherwise the user themself. A playing parent
 * switched to their child who opens their own team still answers as
 * themself there — acting for a child only ever means « on the child's
 * teams ».
 */
export function useTeamActingAs(teamId: string): string | undefined {
  return useTeamPersona(teamId).forPlayerId;
}

/**
 * `useTeamActingAs` plus whether the persona is settled. A team-scoped query
 * must wait on `isReady`: until the persona list arrives, a requested child
 * (a `?pour=` link, the remembered choice) reads as « Moi », and a page
 * fetched then would show — and let the reader answer as — the wrong person.
 */
export function useTeamPersona(teamId: string): {
  forPlayerId: string | undefined;
  isReady: boolean;
} {
  const { forPlayerId, persona, isReady } = useActingAs();
  if (!forPlayerId || !persona?.teams.some((team) => team.teamId === teamId)) {
    return { forPlayerId: undefined, isReady };
  }
  return { forPlayerId, isReady };
}

/** `?forPlayerId=…` for a write path, or nothing when acting as oneself. */
export function actingAsQuery(forPlayerId: string | undefined): string {
  return forPlayerId ? `?forPlayerId=${encodeURIComponent(forPlayerId)}` : '';
}

/**
 * Which persona to act as, given what was asked for and who exists: a known
 * child if one was requested, « Moi » if the user has one, else their first
 * child. Pure, so the fallback order is testable on its own.
 */
export function resolvePersona(
  personas: MyPersonas,
  requested: string | null | undefined,
): string | null {
  const isChild = (id: string | null | undefined) =>
    !!id && personas.children.some((child) => child.playerId === id);
  if (isChild(requested)) return requested as string;
  if (requested === null && personas.self) return null;
  if (personas.self) return null;
  return personas.children[0]?.playerId ?? null;
}

/**
 * The suffix after the persona's own row in a roster: « (vous) » for the
 * reader, nothing when that row is the child they act for — the child's
 * name is already on it, and « vous » would be the wrong person.
 */
export function useMeSuffix(teamId: string): string {
  return useTeamActingAs(teamId) ? '' : ' (vous)';
}
