import { useMemo } from 'react';
import { PageContainer } from '@basketeasy/ui/page-container';
import { PageHeader } from '@basketeasy/ui/page-header';
import { useAccount } from '../auth/useAccount';
import { ManagerHome } from '../clubs/ManagerHome';
import { PlayerHome } from '../clubs/PlayerHome';
import { useHasManageRights } from '../clubs/useHasManageRights';
import { useMyAgenda } from '../clubs/useMyAgenda';
import { playerAgendaWindowParams } from '../clubs/myAgendaWindow';
import { useActingAs } from '../guardians/useActingAs';

/**
 * `/dashboard` — one route, two screens, branching on `useHasManageRights()`.
 *
 * This page owns exactly three things: the role branch, the one query both
 * views share (`GET /me/dashboard`, windowed differently per role — see
 * below), and its `error → loading` handoff to whichever view renders.
 * Everything else — tiles, agenda blocks, team cards, the post-match
 * surface — lives in `ManagerHome`/`PlayerHome`.
 *
 * A plain rostered player sees an agenda-first "Ma semaine": the previous
 * screen served two counters and a team-card grid that duplicated
 * `MyTeamsPage` — a status readout, not a to-do list
 * (`docs/personas.md`). A manager's four stat tiles and
 * team cards stay exactly as they were: nothing about them was found broken,
 * so nothing about them changes here, other than which file they live in.
 *
 * **The 14-day agenda window is a player-only, client-side change**
 * (ranked #4 in `player-journey.md` §5): the server still defaults to 7 days
 * (`DEFAULT_AGENDA_WINDOW_DAYS`, `server/src/dashboard/dashboard.service.ts`,
 * deliberately untouched) when no `from`/`to` is sent, which is exactly what
 * the manager view keeps doing by passing no params at all.
 */
export function DashboardPage() {
  const { user } = useAccount();
  const { hasManageRights } = useHasManageRights();
  const { persona } = useActingAs();
  // Computed once (not inline on every render): `playerAgendaWindowParams()`
  // stamps `from` with `new Date()`, so recomputing it on each render would
  // shift the query key by a few milliseconds every time and refetch forever.
  const agendaParams = useMemo(
    () => (hasManageRights ? undefined : playerAgendaWindowParams()),
    [hasManageRights],
  );
  const {
    data: dashboard,
    isLoading: isDashboardLoading,
    isError: isDashboardError,
    refetch: refetchDashboard,
    isRefetching: isDashboardRefetching,
  } = useMyAgenda(agendaParams);

  const greetingName = user?.firstName ?? user?.email;

  return (
    <PageContainer size="lg">
      <PageHeader
        title={greetingName ? `Bonjour, ${greetingName}` : 'Tableau de bord'}
        meta={
          // The account e-mail line is manager-only: a player's home screen
          // is about the week, not about the account (`player-journey.md` §3.3).
          persona ? (
            `Vous suivez ${persona.firstName} ${persona.lastName}`
          ) : hasManageRights && user ? (
            <span className="break-all">{user.email}</span>
          ) : undefined
        }
      />

      {hasManageRights ? (
        <ManagerHome
          dashboard={dashboard}
          isDashboardLoading={isDashboardLoading}
          isDashboardError={isDashboardError}
          refetchDashboard={refetchDashboard}
          isDashboardRefetching={isDashboardRefetching}
        />
      ) : (
        <PlayerHome
          dashboard={dashboard}
          isDashboardLoading={isDashboardLoading}
          isDashboardError={isDashboardError}
          refetchDashboard={refetchDashboard}
          isDashboardRefetching={isDashboardRefetching}
        />
      )}
    </PageContainer>
  );
}
