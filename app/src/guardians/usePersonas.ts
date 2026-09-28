import { useQuery } from '@tanstack/react-query';
import type { MyPersonas } from '@basketeasy/types/guardians';
import { apiClient } from '../api/client';
import { personasQueryKey } from './queryKeys';

/** Who the caller can act as: « Moi » (if anything) and each child they follow. */
export function usePersonas() {
  return useQuery({
    queryKey: personasQueryKey,
    queryFn: () => apiClient.get<MyPersonas>('/me/personas'),
  });
}
