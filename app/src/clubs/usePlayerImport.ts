import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportPlayersRow, ImportPlayersResult } from '@basketeasy/types/players';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerImport(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rows: ImportPlayersRow[]) =>
      apiClient.post<ImportPlayersResult>(`/clubs/${clubId}/players/import`, { rows }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubPlayersQueryKey(clubId) });
    },
  });
}
