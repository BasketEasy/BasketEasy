import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { Heading } from '@basketeasy/ui/heading';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { StatTile } from '@basketeasy/ui/stat-tile';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { BuildingIcon } from '@basketeasy/ui/icons/building';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import type { MyDashboardSummary } from '@basketeasy/types/my-dashboard';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import { useAdminClubs } from './useAdminClubs';
import { useMyTeamList } from './useMyTeamList';
import { teamCategoryLabel, teamGenderLabel, teamMemberRoleLabel } from './teamLabels';
import { ActionItemsBand } from './ActionItemsBand';
import { MyAgendaEventCard } from './MyAgendaEventCard';
import { PastMatchesSection } from './PastMatchesSection';
import { pastMatchesWindowParams } from './myAgendaWindow';
import { useMyAgenda } from './useMyAgenda';

function TeamCard({ team }: { team: MyTeamSummary }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Text as="span" variant="display" size="lg">
            {team.teamName}
          </Text>
          <div className="flex flex-wrap items-center gap-2">
            {team.rosterRole && (
              <Badge tone="structure">{teamMemberRoleLabel(team.rosterRole)}</Badge>
            )}
            {team.isTeamAdmin && <Badge>Administrateur</Badge>}
          </div>
        </div>
        <Text variant="meta">
          {team.clubName} · {teamCategoryLabel(team.category)} · {teamGenderLabel(team.gender)}
        </Text>
        <Button asChild variant="outline">
          <Link
            to={`/clubs/${team.clubId}/teams/${team.teamId}`}
            state={{ origin: { from: 'dashboard' } }}
          >
            Voir l&apos;équipe
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The manager's « Accueil » — the four tiles (including the club-scoped
 * "Joueurs au total" `dashboard.service.ts` documents), « Cette semaine »,
 * and the team-card grid are all kept verbatim from the pre-split
 * `DashboardPage`: the player-first revamp turns the player's landing
 * screen into a to-do list, but a manager's four numbers and her team
 * roster are not the thing this pass found broken
 * (`docs/ux-audit/player-journey.md` §4.1) — only the player's screen was.
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

  // Computed once per mount, not inline — see PlayerHome's identical comment:
  // pastMatchesWindowParams() stamps from/to with new Date(), so recomputing
  // it every render would shift the query key and refetch forever.
  const pastWindow = useMemo(() => pastMatchesWindowParams(), []);
  const pastMatchesQuery = useMyAgenda(pastWindow);
  const pastMatches = (pastMatchesQuery.data?.upcomingEvents ?? []).filter(
    (event) => event.type === 'MATCH',
  );

  return (
    <>
      <ActionItemsBand items={dashboard?.actionItems ?? []} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          icon={<TrophyIcon className="h-4 w-4" />}
          label="Équipes gérées"
          value={managedTeamCount}
        />
        <StatTile
          icon={<CalendarIcon className="h-4 w-4" />}
          label="Événements — 7 prochains jours"
          value={upcomingEvents.length}
        />
        <StatTile
          icon={<UsersIcon className="h-4 w-4" />}
          label="Joueurs au total"
          value={dashboard?.totalPlayers ?? 0}
        />
        <StatTile
          icon={<BuildingIcon className="h-4 w-4" />}
          label="Clubs administrés"
          value={adminClubs.length}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Cette semaine</CardTitle>
          <TextLink asChild tone="brand">
            <Link to="/my-teams">Voir le calendrier →</Link>
          </TextLink>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isDashboardError ? (
            <QueryError onRetry={() => refetchDashboard()} isRetrying={isDashboardRefetching} />
          ) : isDashboardLoading ? (
            <SkeletonList rows={3} />
          ) : upcomingEvents.length > 0 ? (
            upcomingEvents.map((event) => (
              <MyAgendaEventCard
                key={event.eventId}
                event={event}
                isRostered={isRostered(event.teamId)}
                showRsvpSummary
              />
            ))
          ) : (
            <EmptyState
              icon={<CalendarIcon tone="secondary" className="h-8 w-8" />}
              title="Rien de prévu cette semaine"
              description="Aucun événement dans les 7 prochains jours pour vos équipes."
            />
          )}
        </CardContent>
      </Card>

      <div>
        <Heading as="h2" className="mb-3">
          Mes équipes
        </Heading>
        {isTeamsError ? (
          <QueryError onRetry={() => refetchTeams()} isRetrying={isTeamsRefetching} />
        ) : isTeamsLoading ? (
          <SkeletonList rows={3} variant="card" />
        ) : teams && teams.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <TeamCard key={team.teamId} team={team} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<TrophyIcon tone="secondary" className="h-8 w-8" />}
            title="Aucune équipe pour le moment"
            description="Vous n'êtes membre d'aucune équipe pour le moment."
          />
        )}
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
