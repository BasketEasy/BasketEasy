import type { ChildPersona, MyPersonas } from '@basketeasy/types/guardians';

export const SELF_PERSONA_VALUE = 'self';

/** « 2 à répondre », or nothing when the persona owes no answer. */
export function pendingLabel(count: number): string | null {
  return count > 0 ? `${count} à répondre` : null;
}

export function personaCount(personas: MyPersonas | undefined): number {
  if (!personas) return 0;
  return (personas.self ? 1 : 0) + personas.children.length;
}

/** Unanswered events across every persona except the one on screen. */
export function othersPendingCount(
  personas: MyPersonas | undefined,
  forPlayerId: string | null,
): number {
  if (!personas) return 0;
  const self = forPlayerId !== null ? (personas.self?.pendingCount ?? 0) : 0;
  const children = personas.children
    .filter((child: ChildPersona) => child.playerId !== forPlayerId)
    .reduce((sum, child) => sum + child.pendingCount, 0);
  return self + children;
}
