import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AdminActionResult,
  AdminReasonRequest,
} from '@basketeasy/types/platform-admin-actions';
import { apiClient } from '../../api/client';
import { adminQueryKeyPrefix } from '../queryKeys';

/**
 * Runs one support action. `path` is the route under /admin; the body always
 * carries the reason, plus the action's own fields.
 *
 * Invalidates the whole admin subtree rather than one record: an action moves
 * counts on lists, the stats and the audit log at once, and a stale page
 * offering an action that already ran is the confusion an audited write must
 * not create.
 */
export function useAdminAction<
  TBody extends AdminReasonRequest,
  TResult extends AdminActionResult = AdminActionResult,
>(path: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: TBody) => apiClient.post<TResult>(`/admin/${path}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminQueryKeyPrefix });
    },
  });
}
