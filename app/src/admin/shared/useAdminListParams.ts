import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export const ADMIN_PAGE_SIZE = 25;

/**
 * A back-office list's filters and page, kept in the URL rather than in
 * component state, so any view can be pasted into a support ticket and
 * reopened exactly as it was.
 *
 * Changing a filter replaces the history entry and goes back to page 1 (a
 * filter typed letter by letter must not leave one entry per keystroke);
 * changing the page pushes one, so Back returns to the previous page.
 *
 * `keys` must be stable (a module-level constant), or the memo recomputes on
 * every render. `prefix` namespaces the keys when two lists share one URL (a club page's
 * tabs), so their filters don't overwrite each other.
 */
export function useAdminListParams<K extends string>(keys: readonly K[], prefix = '') {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageKey = `${prefix}page`;

  const filters = useMemo(() => {
    const values: Partial<Record<K, string>> = {};
    for (const key of keys) {
      const value = searchParams.get(prefix + key);
      if (value) values[key] = value;
    }
    return values;
  }, [searchParams, prefix, keys]);

  const page = Math.max(1, Number(searchParams.get(pageKey)) || 1);

  const setFilters = useCallback(
    (changes: Partial<Record<K, string | undefined>>) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(changes) as [K, string | undefined][]) {
            if (value) next.set(prefix + key, value);
            else next.delete(prefix + key);
          }
          next.delete(pageKey);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, prefix, pageKey],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        if (nextPage > 1) next.set(pageKey, String(nextPage));
        else next.delete(pageKey);
        return next;
      });
    },
    [setSearchParams, pageKey],
  );

  return { filters, page, setFilters, setPage, pageSize: ADMIN_PAGE_SIZE };
}
