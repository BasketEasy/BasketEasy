// How long a query's data counts as fresh, in milliseconds. Every query hook
// picks one tier; a hook that sets none gets `live` from `createQueryClient`.
//
// The rule: `static` only when the data is immutable or changed solely by
// mutations that already write the cache. Anything another person or a server
// job can change while someone is looking stays finite.
export const FRESHNESS = {
  /** Co-edited at the same time by several people (the global default). */
  live: 30_000,
  /** Always mounted or polled. */
  feed: 60_000,
  /** Others change it rarely. */
  slow: 10 * 60_000,
  /** Immutable, or only changed by our own mutations. */
  static: Infinity,
} as const;
