import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { Heading } from '@basketeasy/ui/heading';
import { PageContainer } from '@basketeasy/ui/page-container';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { BuildingIcon } from '@basketeasy/ui/icons/building';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import type { MyAgendaEvent } from '@basketeasy/types/my-dashboard';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import { useAccount } from '../auth/useAccount';
import { useAdminClubs } from '../clubs/useAdminClubs';
import { useMyTeamList } from '../clubs/useMyTeamList';
import { useMyAgenda } from '../clubs/useMyAgenda';
import { teamCategoryLabel, teamGenderLabel, teamMemberRoleLabel } from '../clubs/teamLabels';
import { formatEventDate } from '../clubs/eventDateFormat';
import { eventTypeLabel } from '../clubs/eventLabels';
import { eventRsvpStatusLabel } from '../clubs/eventRsvpLabels';

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-muted">
          {icon}
          <Text as="span" variant="meta" tone="inherit">
            {label}
          </Text>
        </div>
        <Text as="span" variant="display" size="3xl">
          {value}
        </Text>
      </CardContent>
    </Card>
  );
}

function AgendaRow({ event, isRostered }: { event: MyAgendaEvent; isRostered: boolean }) {
  return (
    <Link
      to={`/clubs/${event.clubId}/teams/${event.teamId}?tab=events`}
      state={{ origin: { from: 'dashboard' } }}
      className="flex w-full flex-col gap-1 rounded-md border border-border bg-surface-2 p-3 text-left transition hover:border-orange"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Text as="span" variant="label">
          {event.teamName}
        </Text>
        <Badge tone={event.type === 'MATCH' ? 'brand' : 'structure'}>
          {eventTypeLabel(event.type)}
        </Badge>
        {isRostered && event.myConvocation && <Badge>Convoqué</Badge>}
      </div>
      <Text as="span" variant="meta">
        {formatEventDate(event.startsAt)} · {event.location}
        {event.type === 'MATCH' && event.opponentName ? ` · vs ${event.opponentName}` : ''}
      </Text>
      {isRostered && (
        <Text as="span" variant="label" size="sm" tone={event.myRsvpStatus ? 'secondary' : 'brand'}>
          Ma réponse : {eventRsvpStatusLabel(event.myRsvpStatus)}
        </Text>
      )}
    </Link>
  );
}

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

export function DashboardPage() {
  const { user } = useAccount();
  const {
    data: teams,
    isLoading: isTeamsLoading,
    isError: isTeamsError,
    refetch: refetchTeams,
    isRefetching: isTeamsRefetching,
  } = useMyTeamList();
  const adminClubs = useAdminClubs();
  const {
    data: dashboard,
    isLoading: isDashboardLoading,
    isError: isDashboardError,
    refetch: refetchDashboard,
    isRefetching: isDashboardRefetching,
  } = useMyAgenda();

  const managedTeamCount = teams?.filter((team) => team.isTeamAdmin).length ?? 0;
  const upcomingEvents = dashboard?.upcomingEvents ?? [];
  const greetingName = user?.firstName ?? user?.email;
  // A plain rostered player (no club-admin rights, no TeamAdmin grant
  // anywhere) sees a leaner, agenda-first set of tiles instead of the
  // manager-oriented ones, which would only ever read 0 for them.
  const hasManageRights = managedTeamCount > 0 || adminClubs.length > 0;
  const rosterRoleByTeamId = useMemo(
    () => new Map((teams ?? []).map((team) => [team.teamId, team.rosterRole])),
    [teams],
  );
  const isRostered = (teamId: string) => rosterRoleByTeamId.get(teamId) != null;
  const awaitingResponseCount = upcomingEvents.filter(
    (event) => isRostered(event.teamId) && event.myRsvpStatus === null,
  ).length;

  return (
    <PageContainer size="lg">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Heading as="h1" className="m-0">
            {greetingName ? `Bonjour, ${greetingName}` : 'Tableau de bord'}
          </Heading>
          {user && (
            <Text variant="meta" size="md" className="mt-1 break-all">
              {user.email}
            </Text>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {hasManageRights ? (
          <>
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
          </>
        ) : (
          <>
            <StatTile
              icon={<CalendarIcon className="h-4 w-4" />}
              label="Événements — 7 prochains jours"
              value={upcomingEvents.length}
            />
            <StatTile
              icon={<CalendarIcon className="h-4 w-4" />}
              label="En attente de réponse"
              value={awaitingResponseCount}
            />
          </>
        )}
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
              <AgendaRow key={event.eventId} event={event} isRostered={isRostered(event.teamId)} />
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
    </PageContainer>
  );
}
