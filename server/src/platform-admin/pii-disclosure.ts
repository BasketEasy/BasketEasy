/** The people a back-office response shows, by id, for the audit row that records it. */
export interface DisclosedPeople {
  disclosedUserIds: string[];
  disclosedPlayerIds: string[];
}

/**
 * Walks a response for every person it names: an `AdminPersonRef` or a search
 * hit, both `{ kind: 'user' | 'player', id }`. Structural on purpose, so a
 * field added to a response later is covered without touching this.
 */
export function collectDisclosedPeople(value: unknown): DisclosedPeople {
  const users = new Set<string>();
  const players = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record.id === 'string') {
      if (record.kind === 'user') users.add(record.id);
      if (record.kind === 'player') players.add(record.id);
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return { disclosedUserIds: [...users], disclosedPlayerIds: [...players] };
}
