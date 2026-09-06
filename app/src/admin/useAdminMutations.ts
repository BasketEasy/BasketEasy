import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ErasePlatformUserResponse,
  PlatformLoginResponse,
  PlatformUserExport,
  RetentionRunSummary,
} from '@basketeasy/types/platform-admin';
import { apiClient } from '../api/client';
import { adminQueryKeyPrefix, retentionRunsQueryKey } from './queryKeys';
import { startPlatformSession } from './platformSession';

/** Trades a TOTP code for the 15-minute step-up token every other route needs. */
export function usePlatformLogin() {
  return useMutation({
    mutationFn: (totpCode: string) =>
      apiClient.post<PlatformLoginResponse>('/admin/login', { totpCode }),
    onSuccess: (response) => {
      startPlatformSession(response.platformAccessToken, response.expiresAt, response.role);
    },
  });
}

export function useRetentionDryRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<RetentionRunSummary>('/admin/retention/dry-run'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: retentionRunsQueryKey });
    },
  });
}

export function useErasePlatformUser(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reason: string) =>
      apiClient.post<ErasePlatformUserResponse>(`/admin/users/${userId}/erase`, { reason }),
    onSuccess: () => {
      // The whole admin subtree, not just this record: the account is gone
      // from the inactive-accounts list and the dry-run counts too, and a
      // stale row offering to erase an already-erased account is exactly the
      // confusion an audited destructive action must not create.
      void queryClient.invalidateQueries({ queryKey: adminQueryKeyPrefix });
    },
  });
}

/**
 * Generates the RGPD art. 15 / art. 20 bundle.
 *
 * No `onSuccess` cache work: an export changes nothing server-side beyond
 * writing its own audit row, and nothing in the admin UI reads it back.
 */
export function useExportPlatformUser(userId: string) {
  return useMutation({
    mutationFn: (reason: string) =>
      apiClient.post<PlatformUserExport>(`/admin/users/${userId}/export`, { reason }),
  });
}
