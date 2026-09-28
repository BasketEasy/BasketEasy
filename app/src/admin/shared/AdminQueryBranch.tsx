import type { ReactNode } from 'react';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { Loader } from '@basketeasy/ui/loader';
import { QueryError } from '@basketeasy/ui/query-error';

interface QueryLike<T> {
  data: T | undefined;
  isError: boolean;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}

/**
 * The `error → loading → empty → data` ladder every back-office query
 * follows, in that order: an error must never fall through to the empty
 * state, which would tell an admin a record doesn't exist when it merely
 * failed to load.
 */
export function AdminQueryBranch<T>({
  query,
  isEmpty,
  emptyTitle,
  emptyDescription,
  errorTitle,
  loadingLabel = 'Chargement…',
  children,
}: {
  query: QueryLike<T>;
  isEmpty?: (data: T) => boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  errorTitle?: string;
  loadingLabel?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isError) {
    return (
      <QueryError
        title={errorTitle}
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
      />
    );
  }
  if (query.isLoading || query.data === undefined) {
    return <Loader>{loadingLabel}</Loader>;
  }
  if (isEmpty?.(query.data)) {
    return <EmptyState title={emptyTitle ?? 'Aucun résultat'} description={emptyDescription} />;
  }
  return <>{children(query.data)}</>;
}
