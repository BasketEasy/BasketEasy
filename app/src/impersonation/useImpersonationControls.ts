import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { StartImpersonationResponse } from '@basketeasy/types/platform-admin-impersonation';
import { toast } from '@basketeasy/ui/toast-store';
import { apiClient } from '../api/client';
import { adminPaths } from '../admin/shared/adminPaths';
import { beginImpersonation, dropImpersonation } from './impersonationSession';

export type ImpersonationExitReason = 'exited' | 'expired';

/**
 * Enter and leave a read-only impersonation. Both clear the whole query
 * cache: the admin's own data and the subject's must never share a screen,
 * and every product query key is written for "me", which changes meaning at
 * the switch. The session query then refetches as whoever is now "me".
 */
export function useImpersonationControls() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const enter = useCallback(
    (response: StartImpersonationResponse) => {
      beginImpersonation(response);
      queryClient.clear();
      void navigate('/dashboard');
    },
    [queryClient, navigate],
  );

  const exit = useCallback(
    (reason: ImpersonationExitReason) => {
      const ended = dropImpersonation();
      if (!ended) return;
      queryClient.clear();
      // Best effort: the server ends it at expiresAt anyway, and an expired
      // step-up token must not keep the admin on the subject's screen.
      if (reason === 'exited') {
        apiClient.post(`/admin/impersonations/${ended.sessionId}/end`).catch(() => undefined);
      }
      void navigate(adminPaths.user(ended.subjectId));
      toast({
        variant: 'success',
        title: 'Consultation terminée',
        description:
          reason === 'expired'
            ? 'La session de 15 minutes a expiré. Elle est inscrite au journal d’audit.'
            : 'Vous êtes revenu·e au back-office. La consultation est inscrite au journal d’audit.',
      });
    },
    [queryClient, navigate],
  );

  return { enter, exit };
}
