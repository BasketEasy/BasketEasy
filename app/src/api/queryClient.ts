import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';
import { FRESHNESS } from './freshness';

const MAX_RETRIES = 2;

// A 4xx is a fact about the request (forbidden, not found, invalid), not a
// transient failure: repeating it only repeats the refusal. The exceptions are
// 408 (timeout) and 429 (rate limited), which say "try again later", as does a
// 5xx or a network error. At most two more attempts.
function isTransientStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && !isTransientStatus(error.status)) return false;
  return failureCount < MAX_RETRIES;
}

// The one place a product `QueryClient` is built. Hooks that set their own
// `retry` or `staleTime` (the session query, the polled notifications feed)
// keep it: these are only the defaults.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: FRESHNESS.live,
        retry: shouldRetryQuery,
      },
    },
  });
}
