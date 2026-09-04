import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmEmailRequest,
  RequestPasswordResetRequest,
  ResetPasswordRequest,
} from '@basketeasy/types/account-security';
import { apiClient } from '../api/client';
import { sessionQueryKey } from './session';

/**
 * Asks for a fresh verification e-mail. Authenticated — the address it goes
 * to is the session's own, never one supplied in the body.
 */
export function useRequestEmailVerification() {
  return useMutation({
    mutationFn: () => apiClient.post<void>('/auth/verify-email/request'),
  });
}

export function useConfirmEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ConfirmEmailRequest) =>
      apiClient.post<void>('/auth/verify-email/confirm', body),
    onSuccess: () => {
      // The session carries `emailVerified`, which this just changed. Its
      // query is staleTime: Infinity and never refetches on its own, so the
      // banner would otherwise stay up until the next hard reload. An
      // invalidate is safe here (unlike a plain refetch of /auth/refresh)
      // because the session query refetches through the same single-use
      // rotation the app already handles.
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
  });
}

/**
 * Both password-reset endpoints answer 204 with no body and never reveal
 * whether an address has an account, so there is nothing to put in the query
 * cache — these stay plain mutations whose success is the absence of a throw.
 */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (body: RequestPasswordResetRequest) =>
      apiClient.post<void>('/auth/password-reset/request', body),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetPasswordRequest) =>
      apiClient.post<void>('/auth/password-reset/confirm', body),
  });
}
