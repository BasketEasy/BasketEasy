import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
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
import { teamCategoryLabel, teamGenderLabel } from '../clubs/teamLabels';
import { formatEventDate } from '../clubs/eventDateFormat';

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <div className="flex items-center gap-2 text-muted">
          {icon}
          <span className="text-sm">{label}</span>
        </div>
        <span className="font-heading text-3xl font-bold text-charcoal">{value}</span>
      </CardContent>
    </Card>
  );
}

function AgendaRow({ event }: { event: MyAgendaEvent }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(`/clubs/${event.clubId}/teams/${event.teamId}?tab=events`)}
      className="flex w-full flex-col gap-1 rounded-md border border-border p-3 text-left transition hover:border-orange"
    >
      <span className="font-semibold text-charcoal">{event.teamName}</span>
      <span className="text-sm text-muted">
        {formatEventDate(event.startsAt)} · {event.location}
      </span>
    </button>
  );
}

function TeamCard({ team }: { team: MyTeamSummary }) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-6">
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading text-lg font-bold text-charcoal">{team.teamName}</span>
          {team.isTeamAdmin && <Badge>Administrateur</Badge>}
        </div>
        <p className="text-sm text-muted">
          {team.clubName} · {teamCategoryLabel(team.category)} · {teamGenderLabel(team.gender)}
        </p>
        <Button
          variant="outline"
          onClick={() => navigate(`/clubs/${team.clubId}/teams/${team.teamId}`)}
        >
          Voir l&apos;équipe
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

  return (
    <PageContainer id="contenu" size="lg">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Heading as="h1" className="m-0">
            {greetingName ? `Bonjour, ${greetingName}` : 'Tableau de bord'}
          </Heading>
          {user && <p className="mt-1 break-all text-muted">{user.email}</p>}
        </div>
      </div>

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
          <Link to="/my-teams" className="text-sm font-semibold text-orange-text hover:underline">
            Voir le calendrier →
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isDashboardError ? (
            <QueryError onRetry={() => refetchDashboard()} isRetrying={isDashboardRefetching} />
          ) : isDashboardLoading ? (
            <SkeletonList rows={3} />
          ) : upcomingEvents.length > 0 ? (
            upcomingEvents.map((event) => <AgendaRow key={event.eventId} event={event} />)
          ) : (
            <EmptyState
              icon={<CalendarIcon className="h-8 w-8 text-muted" />}
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
            icon={<TrophyIcon className="h-8 w-8 text-muted" />}
            title="Aucune équipe pour le moment"
            description="Vous n'êtes membre d'aucune équipe pour le moment."
          />
        )}
      </div>
    </PageContainer>
  );
}
