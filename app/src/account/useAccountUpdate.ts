import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateProfileRequest, User } from '@basketeasy/types/auth';
import { apiClient } from '../api/client';
import { sessionQueryKey } from '../auth/session';

export function useAccountUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: UpdateProfileRequest) => apiClient.patch<User>('/auth/me', dto),
    // Same pattern as useLogin/useRegister: update the cached session user
    // directly instead of refetching, since the mutation response already
    // is the fresh User.
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQueryKey, user);
    },
  });
}
