// login/register/logout as react-query mutations, called directly from the
// components that need them (LoginForm, RegisterForm, the logout button)
// rather than threaded through AccountContext — context here only owns the
// local `user`/`isLoading` UI state (see AccountContext.tsx), consistent
// with CLAUDE.md's "TanStack Query owns server state ... Context owns local
// UI state" split.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AccessTokenResponse } from '@basketeasy/types/auth';
import { apiClient, setAccessToken } from '../api/client';
import { replaceSession } from './session';

export interface AuthCredentials {
  email: string;
  password: string;
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: AuthCredentials) =>
      apiClient.post<AccessTokenResponse>('/auth/login', credentials),
    onSuccess: (response) => {
      setAccessToken(response.accessToken);
      replaceSession(queryClient, response.user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: AuthCredentials) =>
      apiClient.post<AccessTokenResponse>('/auth/register', credentials),
    onSuccess: (response) => {
      setAccessToken(response.accessToken);
      replaceSession(queryClient, response.user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post('/auth/logout'),
    // Logout should always clear local session state, even if the network
    // call fails (e.g. the server is unreachable or the refresh cookie is
    // already invalid) — onSettled runs on both success and error, unlike
    // onSuccess.
    onSettled: () => {
      setAccessToken(null);
      replaceSession(queryClient, null);
    },
  });
}
