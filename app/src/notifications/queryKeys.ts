import type { ListNotificationsParams } from '@basketeasy/types/notifications';

// Its own keys file rather than an entry in clubs/queryKeys.ts: notifications
// are account-scoped, spanning every club and team the reader is part of, so
// they key off `me` the way `myTeamsQueryKey` does — nothing here belongs
// under a `clubs` prefix.
export const notificationsQueryKeyPrefix = ['me', 'notifications'] as const;

/**
 * Prefix plus the params, mirroring `myDashboardQueryKey`'s pair: a mutation
 * that changes what the feed holds invalidates the *prefix*, so a bell
 * showing a short list and a /notifications page showing a long one both
 * refresh, rather than only the caller that passed no params.
 */
export const notificationsQueryKey = (params?: ListNotificationsParams) =>
  [...notificationsQueryKeyPrefix, params ?? {}] as const;

export const pushPublicKeyQueryKey = ['me', 'push-subscriptions', 'public-key'] as const;
