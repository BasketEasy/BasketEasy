import type { AdminUsersQuery } from '@basketeasy/types/platform-admin-browse';

// Its own prefix, and deliberately not under `me` or `clubs`: back-office
// data is platform-scoped, and every one of these queries becomes
// unauthorized the moment the step-up session ends — which is what lets the
// shell drop the whole subtree in one `removeQueries` call.
export const adminQueryKeyPrefix = ['admin'] as const;

export const retentionRunsQueryKey = [...adminQueryKeyPrefix, 'retention', 'runs'] as const;

export const platformUsersQueryKey = (params?: AdminUsersQuery) =>
  [...adminQueryKeyPrefix, 'users', params ?? {}] as const;

export const platformUserQueryKey = (userId: string) =>
  [...adminQueryKeyPrefix, 'users', userId] as const;
