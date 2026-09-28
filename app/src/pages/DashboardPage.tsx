import { useMemo } from 'react';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Heading } from '@basketeasy/ui/heading';
import { Text } from '@basketeasy/ui/text';
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
 * surface — lives in `ManagerHome`/`PlayerHome`
 * (`docs/ux-audit/player-first-implementation-plan.md` §2 Phase 4).
 *
 * A plain rostered player sees an agenda-first "Ma semaine": the previous
 * screen served two counters and a team-card grid that duplicated
 * `MyTeamsPage` — a status readout, not a to-do list
 * (`docs/ux-audit/player-journey.md` §3.3). A manager's four stat tiles and
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Heading as="h1" className="m-0">
            {greetingName ? `Bonjour, ${greetingName}` : 'Tableau de bord'}
          </Heading>
          {/* The account e-mail line is manager-only now: a player's home
              screen is about the week, not about the account
              (`player-journey.md` §3.3). */}
          {persona ? (
            <Text variant="meta" size="md" className="mt-1">
              {`Vous gérez ${persona.firstName} ${persona.lastName}`}
            </Text>
          ) : (
            hasManageRights && user && (
              <Text variant="meta" size="md" className="mt-1 break-all">
                {user.email}
              </Text>
            )
          )}
        </div>
      </div>

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
