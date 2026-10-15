import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { FRESHNESS } from './freshness';
import { createQueryClient } from './queryClient';

function retryFn() {
  const retry = createQueryClient().getDefaultOptions().queries?.retry;
  if (typeof retry !== 'function') throw new Error('retry default must be a function');
  return (failureCount: number, error: unknown) => retry(failureCount, error as Error);
}

describe('createQueryClient', () => {
  it('defaults to the live freshness tier', () => {
    expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(FRESHNESS.live);
  });

  it.each([400, 401, 403, 404, 409, 429])('never retries a %i', (status) => {
    expect(retryFn()(0, new ApiError('refused', status))).toBe(false);
  });

  it('retries a 500 twice, then gives up', () => {
    const retry = retryFn();
    const error = new ApiError('boom', 500);
    expect(retry(0, error)).toBe(true);
    expect(retry(1, error)).toBe(true);
    expect(retry(2, error)).toBe(false);
  });

  it('retries a network error twice, then gives up', () => {
    const retry = retryFn();
    const error = new TypeError('Failed to fetch');
    expect(retry(0, error)).toBe(true);
    expect(retry(1, error)).toBe(true);
    expect(retry(2, error)).toBe(false);
  });
});
