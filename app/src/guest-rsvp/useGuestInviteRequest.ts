import { useMutation } from '@tanstack/react-query';
import type { GuestInviteRequest } from '@basketeasy/types/guest-links';
import { apiClient } from '../api/client';

export function useGuestInviteRequest(token: string) {
  return useMutation({
    mutationFn: (body: GuestInviteRequest) =>
      apiClient.post<void>(`/public/guest/${token}/invite-request`, body),
  });
}
