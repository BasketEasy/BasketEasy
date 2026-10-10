import { useMemo } from 'react';
import type { GetDashboardParams } from '@basketeasy/types/my-dashboard';
import { useHasManageRights } from './useHasManageRights';
import { playerAgendaWindowParams } from './myAgendaWindow';

/**
 * The window the signed-in home screen asks `GET /me/dashboard` for: none for
 * a manager (the server's 7-day default), 14 days for a player. One hook so
 * everything that reads « the home's agenda » asks for the same window and
 * therefore shares one cache entry: the dashboard itself, and the bottom
 * nav's « to answer » badge, which has to count what the list shows.
 *
 * Computed once per role (not inline): the window is snapped to a quarter hour
 * (`myAgendaWindow.ts`), so a re-render inside the same slot is stable either way,
 * but a mounted screen should not slide to a new key mid-visit.
 */
export function useHomeAgendaParams(): GetDashboardParams | undefined {
  const { hasManageRights } = useHasManageRights();
  return useMemo(
    () => (hasManageRights ? undefined : playerAgendaWindowParams()),
    [hasManageRights],
  );
}
