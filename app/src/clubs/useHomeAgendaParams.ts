import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
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
 * Computed once per role and per route (not inline): the window is snapped to
 * a quarter hour (`myAgendaWindow.ts`), and a mounted screen should not slide
 * to a new key mid-visit. The route is part of it because the bottom nav is
 * never remounted: keyed on the role alone, it would keep the window of its
 * first render while every later visit to the home computes a newer one, and
 * the badge would stop counting what the list shows. Recomputed on each
 * navigation, it lands in the same slot as the home that mounts with it.
 */
export function useHomeAgendaParams(): GetDashboardParams | undefined {
  const { hasManageRights } = useHasManageRights();
  const { pathname } = useLocation();
  return useMemo(
    () => (hasManageRights ? undefined : playerAgendaWindowParams()),
    // `pathname` is not read inside: it is the recompute trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasManageRights, pathname],
  );
}
