import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { StatTile } from '@basketeasy/ui/stat-tile';
import { List, ListItem } from '@basketeasy/ui/list';
import { BuildingIcon } from '@basketeasy/ui/icons/building';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import type { MyDashboardSummary } from '@basketeasy/types/my-dashboard';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import { FRESHNESS } from '../api/freshness';
import { useAdminClubs } from './useAdminClubs';
import { useMyTeamList } from './useMyTeamList';
import { teamCategoryLabel, teamMemberRoleLabel } from './teamLabels';
import { ActionItemsBand } from './ActionItemsBand';
import { MyAgendaEventCard } from './MyAgendaEventCard';
import { PastMatchesSection } from './PastMatchesSection';
import { pastMatchesWindowParams } from './myAgendaWindow';
import { useMyAgenda } from './useMyAgenda';

/** One team as a link row: name, « club · category », the reader's roles, a chevron. */
function TeamLinkRow({ team }: { team: MyTeamSummary }) {
  const hasRoles = Boolean(team.rosterRole) || team.isTeamAdmin;
  return (
    <ListItem
      asChild
      chevron
      meta={`${team.clubName} · ${teamCategoryLabel(team.category)}`}
      trailing={
        hasRoles && (
          <>
            {team.rosterRole && (
              <Badge variant="soft" tone="muted">
                {teamMemberRoleLabel(team.rosterRole)}
              </Badge>
            )}
            {team.isTeamAdmin && (
              <Badge variant="soft" tone="muted">
                Administrateur
              </Badge>
            )}
          </>
        )
      }
    >
      <Link
        to={`/clubs/${team.clubId}/teams/${team.teamId}`}
        state={{ origin: { from: 'dashboard' } }}
      >
        {team.teamName}
      </Link>
    </ListItem>
  );
}

/**
 * The manager's « Accueil » — the four tiles (including the club-scoped
 * "Joueurs au total" `dashboard.service.ts` documents), « Cette semaine »,
 * and the team-card grid are all kept verbatim from the pre-split
 * `DashboardPage`: the player-first revamp turns the player's landing
 * screen into a to-do list, but a manager's four numbers and her team
 * roster are not the thing this pass found broken
 * (`docs/personas.md`) — only the player's screen was.
 *
 * « Après le match » (phase 8) is new here — the pre-phase-8 manager home had
 * no post-match surface at all, even though a manager is exactly who needs
 * the link back to a just-played match to go confirm its scoresheet. Same
 * `PastMatchesSection` the player home renders, reading its own
 * `pastMatchesWindowParams()`-windowed `useMyAgenda()` query independently of
 * the "Cette semaine" query above — see `PastMatchesSection`'s doc-comment.
 *
 * « À traiter » (phase 9) renders above the stat tiles — the first thing a
 * manager sees, per `player-first-implementation-plan.md` §2 Phase 9 — and
 * only when `dashboard.actionItems` isn't empty (`ActionItemsBand` renders
 * nothing otherwise, so no extra branch is needed here).
 */
export function ManagerHome({
  dashboard,
  isDashboardLoading,
  isDashboardError,
  refetchDashboard,
  isDashboardRefetching,
}: {
  dashboard: MyDashboardSummary | undefined;
  isDashboardLoading: boolean;
  isDashboardError: boolean;
  refetchDashboard: () => void;
  isDashboardRefetching: boolean;
}) {
  const {
    data: teams,
    isLoading: isTeamsLoading,
    isError: isTeamsError,
    refetch: refetchTeams,
    isRefetching: isTeamsRefetching,
  } = useMyTeamList();
  const adminClubs = useAdminClubs();

  const managedTeamCount = teams?.filter((team) => team.isTeamAdmin).length ?? 0;
  const upcomingEvents = dashboard?.upcomingEvents ?? [];
  const rosterRoleByTeamId = useMemo(
    () => new Map((teams ?? []).map((team) => [team.teamId, team.rosterRole])),
    [teams],
  );
  const isRostered = (teamId: string) => rosterRoleByTeamId.get(teamId) != null;

  // Computed once per mount, not inline — see PlayerHome's identical comment.
  const pastWindow = useMemo(() => pastMatchesWindowParams(), []);
  const pastMatchesQuery = useMyAgenda(pastWindow, { freshness: FRESHNESS.slow });
  const pastMatches = (pastMatchesQuery.data?.upcomingEvents ?? []).filter(
    (event) => event.type === 'MATCH',
  );

  return (
    <>
      {/* One column on a phone (À traiter → tiles → semaine → équipes, through
          `order`); from `md` a grid where the tiles span both columns, the week
          sits left and À traiter + Mes équipes stack right. The right column's
          wrapper is `contents` on a phone so its children take part in `order`. */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start">
        <div className="grid grid-cols-2 gap-4 order-2 md:order-none md:col-span-2 md:grid-cols-4">
          <StatTile
            icon={<TrophyIcon size="md" />}
            label="Équipes gérées"
            value={managedTeamCount}
          />
          <StatTile
            icon={<CalendarIcon size="md" />}
            label="Événements — 7 prochains jours"
            value={upcomingEvents.length}
          />
          <StatTile
            icon={<UsersIcon size="md" />}
            label="Joueurs au total"
            value={dashboard?.totalPlayers ?? 0}
          />
          <StatTile
            icon={<BuildingIcon size="md" />}
            label="Clubs administrés"
            value={adminClubs.length}
          />
        </div>

        <section className="order-3 flex flex-col gap-3.5 md:order-none md:col-start-1 md:row-start-2">
          <SectionHeading as="h2">Cette semaine</SectionHeading>
          {isDashboardError ? (
            <QueryError onRetry={() => refetchDashboard()} isRetrying={isDashboardRefetching} />
          ) : isDashboardLoading ? (
            <SkeletonList rows={3} />
          ) : upcomingEvents.length > 0 ? (
            <div className="flex flex-col gap-2">
              {upcomingEvents.map((event) => (
                <MyAgendaEventCard
                  key={event.eventId}
                  event={event}
                  isRostered={isRostered(event.teamId)}
                  showRsvpSummary
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CalendarIcon size="3xl" tone="secondary" />}
              title="Rien de prévu cette semaine"
              description="Aucun événement dans les 7 prochains jours pour vos équipes."
            />
          )}
          <Button asChild variant="ghost" size="sm" className="self-start">
            <Link to="/my-teams">Voir le calendrier →</Link>
          </Button>
        </section>

        <div className="contents md:col-start-2 md:row-start-2 md:flex md:flex-col md:gap-6">
          <div className="order-1 empty:hidden md:order-none">
            <ActionItemsBand items={dashboard?.actionItems ?? []} />
          </div>

          <section className="order-4 flex flex-col gap-3.5 md:order-none">
            <SectionHeading as="h2">Mes équipes</SectionHeading>
            {isTeamsError ? (
              <QueryError onRetry={() => refetchTeams()} isRetrying={isTeamsRefetching} />
            ) : isTeamsLoading ? (
              <SkeletonList rows={3} variant="card" />
            ) : teams && teams.length > 0 ? (
              <Card variant="flush">
                <List>
                  {teams.map((team) => (
                    <TeamLinkRow key={team.teamId} team={team} />
                  ))}
                </List>
              </Card>
            ) : (
              <EmptyState
                icon={<TrophyIcon size="3xl" tone="secondary" />}
                title="Aucune équipe pour le moment"
                description="Vous n'êtes membre d'aucune équipe pour le moment."
              />
            )}
          </section>
        </div>
      </div>

      <PastMatchesSection
        matches={pastMatches}
        isLoading={pastMatchesQuery.isLoading}
        isError={pastMatchesQuery.isError}
        onRetry={() => pastMatchesQuery.refetch()}
        isRefetching={pastMatchesQuery.isRefetching}
      />
    </>
  );
}
