import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@basketeasy/ui/tabs';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Heading } from '@basketeasy/ui/heading';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { FormField } from '@basketeasy/ui/form-field';
import { Input } from '@basketeasy/ui/input';
import { Pagination } from '@basketeasy/ui/pagination';
import { SegmentedControl } from '@basketeasy/ui/segmented-control';
import { SelectField } from '@basketeasy/ui/select-field';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import type { TeamClubSortBy, TeamPlayerSortBy } from '@basketeasy/types/teams';
import type { SortOrder } from '@basketeasy/types/pagination';
import { useBackLink } from '../clubs/backLink';
import { useTeamShow } from '../clubs/useTeamShow';
import { TeamDeleteModal } from '../clubs/TeamDeleteModal';
import { useTeamClubList } from '../clubs/useTeamClubList';
import { useTeamPlayerList } from '../clubs/useTeamPlayerList';
import { usePlayerList } from '../clubs/usePlayerList';
import { useEventList } from '../clubs/useEventList';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { useIsTeamManager } from '../clubs/useIsTeamManager';
import { useMyTeamList } from '../clubs/useMyTeamList';
import { useTeamAdminList } from '../clubs/useTeamAdminList';
import { useTeamAdminCandidates } from '../clubs/useTeamAdminCandidates';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { TeamClubAddForm } from '../clubs/TeamClubAddForm';
import { TeamClubRow } from '../clubs/TeamClubRow';
import { TeamPlayerAddForm } from '../clubs/TeamPlayerAddForm';
import { TeamPlayerRow } from '../clubs/TeamPlayerRow';
import { TeamRosterCards } from '../clubs/TeamRosterCards';
import { EventCreateForm } from '../clubs/EventCreateForm';
import { EventRow } from '../clubs/EventRow';
import { TeamEventsAgenda } from '../clubs/TeamEventsAgenda';
import { TeamSeasonStatsTab } from '../clubs/TeamSeasonStatsTab';
import { TeamAdminAddForm } from '../clubs/TeamAdminAddForm';
import { TeamAdminRow } from '../clubs/TeamAdminRow';
import { ResponsiveTable } from '@basketeasy/ui/responsive-table';
import { TeamEditModal } from '../clubs/TeamEditModal';
import { TeamFfbbLinkList } from '../clubs/TeamFfbbLinkList';
import { teamCategoryLabel, teamGenderLabel } from '../clubs/teamLabels';
import { BuildingIcon } from '@basketeasy/ui/icons/building';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { ShieldIcon } from '@basketeasy/ui/icons/shield';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import { Text } from '@basketeasy/ui/text';

// Mirrors MembersPage's LINKING_PAGE_SIZE — the "which club players are not
// yet on this roster" computation needs the full roster/player lists, not
// one paginated table page. Capped at the server's MAX_PAGE_SIZE.
const LINKING_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const TEAM_CLUB_SORT_OPTIONS: {
  value: string;
  label: string;
  sortBy: TeamClubSortBy;
  sortOrder: SortOrder;
}[] = [
  { value: 'name:asc', label: 'Nom (A → Z)', sortBy: 'name', sortOrder: 'asc' },
  { value: 'name:desc', label: 'Nom (Z → A)', sortBy: 'name', sortOrder: 'desc' },
  {
    value: 'linkedAt:desc',
    label: 'Association la plus récente',
    sortBy: 'linkedAt',
    sortOrder: 'desc',
  },
  {
    value: 'linkedAt:asc',
    label: 'Association la plus ancienne',
    sortBy: 'linkedAt',
    sortOrder: 'asc',
  },
];

const ROSTER_SORT_OPTIONS: {
  value: string;
  label: string;
  sortBy: TeamPlayerSortBy;
  sortOrder: SortOrder;
}[] = [
  { value: 'name:asc', label: 'Nom (A → Z)', sortBy: 'name', sortOrder: 'asc' },
  { value: 'name:desc', label: 'Nom (Z → A)', sortBy: 'name', sortOrder: 'desc' },
  {
    value: 'createdAt:desc',
    label: 'Ajout le plus récent',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  { value: 'createdAt:asc', label: 'Ajout le plus ancien', sortBy: 'createdAt', sortOrder: 'asc' },
];

const EVENT_SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'asc', label: 'Plus proche d’abord' },
  { value: 'desc', label: 'Plus lointain d’abord' },
];

type TeamDetailTab = 'roster' | 'clubs' | 'admins' | 'stats' | 'events';

export function TeamDetailPage() {
  const { clubId, teamId } = useParams<{ clubId: string; teamId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const isAdmin = useIsClubAdmin(clubId);
  const canManageTeam = useIsTeamManager(clubId!, teamId!);
  const requestedTab: TeamDetailTab =
    tabParam === 'roster'
      ? 'roster'
      : tabParam === 'clubs'
        ? 'clubs'
        : tabParam === 'admins'
          ? 'admins'
          : tabParam === 'stats'
            ? 'stats'
            : 'events';
  // Clubs partenaires/Administrateurs are management-only tabs, hidden from
  // a rostered player with no manage rights — fall back to Événements (the
  // default for everyone) rather than rendering a tab that isn't in the list.
  const activeTab: TeamDetailTab =
    !canManageTeam && (requestedTab === 'clubs' || requestedTab === 'admins')
      ? 'events'
      : requestedTab;
  // Undefined means "the season containing today", which only the server can
  // resolve — the September-to-August boundary is its rule, not the client's.
  const [statsSeason, setStatsSeason] = useState<number | undefined>(undefined);
  const backLink = useBackLink();
  // Whether the viewer themselves has a roster row on this team (as PLAYER
  // or COACH) — gates the RSVP control, independent of canManageTeam: a
  // club admin who isn't personally rostered can manage the event but has
  // nothing to RSVP for, and vice versa for a rostered non-admin.
  const { data: myTeams } = useMyTeamList();
  const isRostered = myTeams?.some((t) => t.teamId === teamId && t.rosterRole !== null) ?? false;

  const {
    data: team,
    isLoading: isLoadingTeam,
    isError: isTeamError,
    refetch: refetchTeam,
  } = useTeamShow(clubId!, teamId!);

  // Clubs partenaires (CTC) filters
  const [teamClubsSearch, setTeamClubsSearch] = useState('');
  const debouncedTeamClubsSearch = useDebouncedValue(teamClubsSearch);
  const [teamClubsSort, setTeamClubsSort] = useState(TEAM_CLUB_SORT_OPTIONS[0].value);
  const [teamClubsPage, setTeamClubsPage] = useState(1);
  const [teamClubsPageSize, setTeamClubsPageSize] = useState(DEFAULT_PAGE_SIZE);
  const teamClubsSortOption =
    TEAM_CLUB_SORT_OPTIONS.find((o) => o.value === teamClubsSort) ?? TEAM_CLUB_SORT_OPTIONS[0];
  const isTeamClubsFiltered = debouncedTeamClubsSearch !== '';

  // Effectif (roster) filters
  const [rosterSearch, setRosterSearch] = useState('');
  const debouncedRosterSearch = useDebouncedValue(rosterSearch);
  const [rosterSort, setRosterSort] = useState(ROSTER_SORT_OPTIONS[0].value);
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterPageSize, setRosterPageSize] = useState(DEFAULT_PAGE_SIZE);
  const rosterSortOption =
    ROSTER_SORT_OPTIONS.find((o) => o.value === rosterSort) ?? ROSTER_SORT_OPTIONS[0];
  const isRosterFiltered = debouncedRosterSearch !== '';
  // Effectif view mode — defaults to the grouped card view. Toggling resets
  // the table view's search/sort/page state rather than preserving it: a
  // search typed in table view silently filtering the card view's grouping
  // (or vice versa) would be more confusing than just starting fresh.
  const [rosterViewMode, setRosterViewMode] = useState<'cards' | 'table'>('cards');
  const toggleRosterViewMode = () => {
    setRosterSearch('');
    setRosterSort(ROSTER_SORT_OPTIONS[0].value);
    setRosterPage(1);
    setRosterViewMode((mode) => (mode === 'cards' ? 'table' : 'cards'));
  };

  // Événements filters
  const [eventsSearch, setEventsSearch] = useState('');
  const debouncedEventsSearch = useDebouncedValue(eventsSearch);
  const [eventsFrom, setEventsFrom] = useState('');
  const [eventsTo, setEventsTo] = useState('');
  const [eventsSortOrder, setEventsSortOrder] = useState<SortOrder>('asc');
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(DEFAULT_PAGE_SIZE);
  const isEventsFiltered = debouncedEventsSearch !== '' || eventsFrom !== '' || eventsTo !== '';
  // Événements view mode — defaults to the day-grouped agenda view (item
  // 5a). Toggling resets the table view's search/date-range/sort state,
  // mirroring the Effectif tab's card/table toggle exactly.
  const [eventsViewMode, setEventsViewMode] = useState<'agenda' | 'table'>('agenda');
  const toggleEventsViewMode = () => {
    setEventsSearch('');
    setEventsFrom('');
    setEventsTo('');
    setEventsSortOrder('asc');
    setEventsPage(1);
    setAgendaPeriod('upcoming');
    setEventsViewMode((mode) => (mode === 'agenda' ? 'table' : 'agenda'));
  };
  // Agenda period — "À venir" (default) vs. "Passés", toggled the same way
  // as eventsViewMode above and reset back to 'upcoming' whenever the outer
  // Agenda/Liste toggle flips, so re-entering Agenda always starts
  // forward-looking. Liste view remains the real paginated escape hatch for
  // deep history — this only covers "yesterday's/last week's practice."
  const [agendaPeriod, setAgendaPeriod] = useState<'upcoming' | 'past'>('upcoming');
  const toggleAgendaPeriod = () => {
    setAgendaPeriod((period) => (period === 'upcoming' ? 'past' : 'upcoming'));
  };
  // Agenda fetch window boundary: start of today — computed once per mount
  // rather than every render, since it only needs to be "today," not "this
  // exact instant." Shared by both directions: upcoming reads from this
  // point on (uncapped upper bound), past reads up to this point (capped
  // lower bound) — today's own events always bucket into "À venir," never
  // "Passés," since an event later today hasn't happened yet. Either
  // direction is capped at LINKING_PAGE_SIZE rows (a team's realistic
  // near-term/recent event count is well under that).
  const agendaFrom = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }, []);

  const {
    data: teamClubsResult,
    isLoading: isLoadingClubs,
    isError: isClubsError,
    refetch: refetchClubs,
    isRefetching: isClubsRefetching,
  } = useTeamClubList(clubId!, teamId!, {
    search: debouncedTeamClubsSearch || undefined,
    sortBy: teamClubsSortOption.sortBy,
    sortOrder: teamClubsSortOption.sortOrder,
    page: teamClubsPage,
    pageSize: teamClubsPageSize,
  });
  // Unfiltered, capped fetch used only to find the owning club below —
  // independent of the paginated/filtered table view.
  const { data: allTeamClubsResult } = useTeamClubList(clubId!, teamId!, {
    pageSize: LINKING_PAGE_SIZE,
  });

  const {
    data: teamPlayersResult,
    isLoading: isLoadingPlayers,
    isError: isPlayersError,
    refetch: refetchPlayers,
    isRefetching: isPlayersRefetching,
  } = useTeamPlayerList(clubId!, teamId!, {
    search: debouncedRosterSearch || undefined,
    sortBy: rosterSortOption.sortBy,
    sortOrder: rosterSortOption.sortOrder,
    page: rosterPage,
    pageSize: rosterPageSize,
  });
  // Unfiltered, capped fetch backing the "already rostered" computation below
  // — also backs the Effectif tab's card view, which shows the full roster
  // rather than one paginated/filtered table page.
  // TODO: LINKING_PAGE_SIZE (100) is also the server's MAX_PAGE_SIZE
  // (server/src/common/pagination.ts), so a CTC/entente team's shared roster
  // — this app's own headline multi-club use case — could exceed it and
  // silently render only the first 100 players/coaches in the card view with
  // no "and N more" indicator, unlike the table-view toggle, which stays
  // correctly paginated. Not expected at current usage, but if/when it comes
  // up, the card view needs either real pagination or an overflow indicator
  // driven by `allTeamPlayersResult.total` vs. `allTeamPlayers.length`.
  const {
    data: allTeamPlayersResult,
    isLoading: isLoadingAllTeamPlayers,
    isError: isAllTeamPlayersError,
    refetch: refetchAllTeamPlayers,
    isRefetching: isAllTeamPlayersRefetching,
  } = useTeamPlayerList(clubId!, teamId!, {
    pageSize: LINKING_PAGE_SIZE,
  });
  const { data: clubPlayersResult } = usePlayerList(clubId!, { pageSize: LINKING_PAGE_SIZE });

  const {
    data: eventsResult,
    isLoading: isLoadingEvents,
    isError: isEventsError,
    refetch: refetchEvents,
    isRefetching: isEventsRefetching,
  } = useEventList(clubId!, teamId!, {
    search: debouncedEventsSearch || undefined,
    from: eventsFrom ? new Date(eventsFrom).toISOString() : undefined,
    to: eventsTo ? new Date(eventsTo).toISOString() : undefined,
    sortOrder: eventsSortOrder,
    page: eventsPage,
    pageSize: eventsPageSize,
  });
  // Backs the agenda view — unpaginated, sorted ascending, bounded to
  // upcoming events only. Independent of the table view's own filters above,
  // same as the roster tab's card-view fetch is independent of its table.
  const {
    data: agendaEventsResult,
    isLoading: isLoadingAgendaEvents,
    isError: isAgendaEventsError,
    refetch: refetchAgendaEvents,
    isRefetching: isAgendaEventsRefetching,
  } = useEventList(clubId!, teamId!, {
    ...(agendaPeriod === 'upcoming' ? { from: agendaFrom } : { to: agendaFrom }),
    sortOrder: agendaPeriod === 'upcoming' ? 'asc' : 'desc',
    pageSize: LINKING_PAGE_SIZE,
  });

  const {
    data: teamAdmins,
    isLoading: isLoadingAdmins,
    isError: isAdminsError,
    refetch: refetchAdmins,
    isRefetching: isAdminsRefetching,
  } = useTeamAdminList(clubId!, teamId!);
  const { data: teamAdminCandidatesResult } = useTeamAdminCandidates(clubId!, teamId!);

  const [isEditing, setIsEditing] = useState(false);
  const [isAddClubOpen, setIsAddClubOpen] = useState(false);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);

  const teamClubs = teamClubsResult?.items;
  const teamPlayers = teamPlayersResult?.items;
  const allTeamPlayers = useMemo(() => allTeamPlayersResult?.items ?? [], [allTeamPlayersResult]);
  const clubPlayers = useMemo(() => clubPlayersResult?.items ?? [], [clubPlayersResult]);
  const events = eventsResult?.items;
  const agendaEvents = useMemo(() => agendaEventsResult?.items ?? [], [agendaEventsResult]);

  // Same pattern as the roster tab: whichever fetch backs the active
  // Événements view (agenda vs. table) sources its own loading/empty state.
  const isLoadingEventsView = eventsViewMode === 'agenda' ? isLoadingAgendaEvents : isLoadingEvents;
  const isEventsViewError = eventsViewMode === 'agenda' ? isAgendaEventsError : isEventsError;
  const isEventsViewRefetching =
    eventsViewMode === 'agenda' ? isAgendaEventsRefetching : isEventsRefetching;
  const refetchEventsView = eventsViewMode === 'agenda' ? refetchAgendaEvents : refetchEvents;
  const isEventsEmpty =
    (eventsViewMode === 'agenda' ? agendaEventsResult?.total : eventsResult?.total) === 0;

  // The card view reads the full unfiltered roster, the table view reads the
  // paginated/filtered one — so "is the roster empty" (and its loading
  // state) is sourced from whichever fetch backs the active view, letting
  // both views share a single error/loading/empty branch instead of each
  // duplicating that logic.
  const isLoadingRoster = rosterViewMode === 'cards' ? isLoadingAllTeamPlayers : isLoadingPlayers;
  const isRosterError = rosterViewMode === 'cards' ? isAllTeamPlayersError : isPlayersError;
  const isRosterRefetching =
    rosterViewMode === 'cards' ? isAllTeamPlayersRefetching : isPlayersRefetching;
  const refetchRoster = rosterViewMode === 'cards' ? refetchAllTeamPlayers : refetchPlayers;
  const isRosterEmpty =
    (rosterViewMode === 'cards' ? allTeamPlayersResult?.total : teamPlayersResult?.total) === 0;

  const isOwner =
    (allTeamClubsResult?.items ?? []).find((c) => c.clubId === clubId)?.isOwner ?? false;

  const addablePlayers = useMemo(() => {
    const rosteredPlayerIds = new Set(allTeamPlayers.map((tp) => tp.playerId));
    return clubPlayers.filter((p) => !rosteredPlayerIds.has(p.id));
  }, [clubPlayers, allTeamPlayers]);

  const addableAdmins = useMemo(() => {
    const adminUserIds = new Set((teamAdmins ?? []).map((admin) => admin.userId));
    return (teamAdminCandidatesResult ?? []).filter((c) => !adminUserIds.has(c.userId));
  }, [teamAdminCandidatesResult, teamAdmins]);

  if (isTeamError) {
    return (
      <PageContainer size="lg">
        <QueryError onRetry={() => refetchTeam()} />
      </PageContainer>
    );
  }

  if (isLoadingTeam) {
    return (
      <PageContainer size="lg">
        <SkeletonList rows={4} variant="card" />
      </PageContainer>
    );
  }

  if (!team) {
    return (
      <PageContainer size="lg">
        <EmptyState
          icon={<TrophyIcon tone="secondary" className="h-8 w-8" />}
          title="Équipe introuvable"
          description="Cette équipe n’existe plus ou a été supprimée."
          action={
            <Button asChild>
              <Link to="/my-teams">Mes équipes</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer size="lg">
      <Button asChild variant="ghost" className="self-start">
        <Link to={backLink.to}>{backLink.label}</Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Heading as="h1" className="m-0">
            {team.name}
          </Heading>
          <Text variant="meta" className="mt-1">
            {teamCategoryLabel(team.category)} · {teamGenderLabel(team.gender)}
          </Text>
        </div>
        {canManageTeam && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              Modifier
            </Button>
            {isAdmin && isOwner && (
              <TeamDeleteModal
                clubId={clubId!}
                teamId={teamId!}
                teamName={team.name}
                playerCount={allTeamPlayers.length}
                eventCount={eventsResult?.total ?? 0}
              />
            )}
          </div>
        )}
      </div>

      <TeamEditModal
        clubId={clubId!}
        teamId={teamId!}
        team={team}
        open={isEditing}
        onOpenChange={setIsEditing}
      />

      <TeamFfbbLinkList clubId={clubId!} teamId={teamId!} canManage={canManageTeam} />

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setSearchParams(
            (previous) => {
              const next = new URLSearchParams(previous);
              next.set('tab', value);
              return next;
            },
            { replace: true },
          )
        }
      >
        <TabsList>
          <TabsTrigger value="roster" badge={allTeamPlayers.length}>
            Effectif
          </TabsTrigger>
          {canManageTeam && (
            <TabsTrigger value="clubs" badge={teamClubsResult?.total ?? 0}>
              Clubs partenaires
            </TabsTrigger>
          )}
          {canManageTeam && (
            <TabsTrigger value="admins" badge={teamAdmins?.length ?? 0}>
              Administrateurs
            </TabsTrigger>
          )}
          <TabsTrigger value="stats">Statistiques</TabsTrigger>
          <TabsTrigger value="events" badge={eventsResult?.total ?? 0}>
            Événements
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="mt-4">
          <TeamSeasonStatsTab
            clubId={clubId!}
            teamId={teamId!}
            season={statsSeason}
            onSeasonChange={setStatsSeason}
          />
        </TabsContent>

        <TabsContent value="roster" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {canManageTeam && (
              <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
                <DialogTrigger asChild>
                  <Button className="self-start">Ajouter un joueur</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Ajouter un joueur à l'effectif</DialogTitle>
                    <DialogDescription>
                      Ajoutez un joueur du club à l'effectif de cette équipe.
                    </DialogDescription>
                  </DialogHeader>
                  <TeamPlayerAddForm
                    clubId={clubId!}
                    teamId={teamId!}
                    addablePlayers={addablePlayers}
                    onSuccess={() => setIsAddPlayerOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            )}
            <SegmentedControl
              ariaLabel="Affichage de l'effectif"
              value={rosterViewMode}
              onChange={(next) => {
                if (next !== rosterViewMode) toggleRosterViewMode();
              }}
              options={[
                { value: 'cards', label: 'Cartes' },
                { value: 'table', label: 'Tableau' },
              ]}
            />
          </div>

          {rosterViewMode === 'table' && (
            <div className="flex flex-wrap items-end gap-3">
              <Input
                aria-label="Rechercher un joueur de l'effectif"
                placeholder="Rechercher un joueur…"
                value={rosterSearch}
                onChange={(e) => {
                  setRosterSearch(e.target.value);
                  setRosterPage(1);
                }}
                className="max-w-xs"
              />
              <SelectField
                label="Trier par"
                containerClassName="w-56"
                value={rosterSort}
                onValueChange={(value) => {
                  setRosterSort(value);
                  setRosterPage(1);
                }}
                options={ROSTER_SORT_OPTIONS}
              />
            </div>
          )}

          <Card>
            <CardContent className="flex flex-col gap-4">
              {isRosterError ? (
                <QueryError onRetry={() => refetchRoster()} isRetrying={isRosterRefetching} />
              ) : isLoadingRoster ? (
                <SkeletonList rows={3} />
              ) : isRosterEmpty ? (
                <EmptyState
                  icon={<UsersIcon tone="secondary" className="h-8 w-8" />}
                  title={isRosterFiltered ? 'Aucun résultat' : 'Effectif vide'}
                  description={
                    isRosterFiltered
                      ? "Aucun joueur de l'effectif ne correspond à votre recherche."
                      : "Ajoutez un joueur du club à l'effectif de cette équipe."
                  }
                  action={
                    canManageTeam && !isRosterFiltered ? (
                      <Button onClick={() => setIsAddPlayerOpen(true)}>Ajouter un joueur</Button>
                    ) : undefined
                  }
                />
              ) : rosterViewMode === 'cards' ? (
                <TeamRosterCards players={allTeamPlayers} teamGender={team.gender} />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Prénom</TableHead>
                        <TableHead>Nom</TableHead>
                        <TableHead>Rôle</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamPlayers?.map((teamPlayer) => (
                        <TeamPlayerRow
                          key={teamPlayer.id}
                          clubId={clubId!}
                          teamId={teamId!}
                          teamPlayer={teamPlayer}
                          canManage={canManageTeam}
                        />
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    page={teamPlayersResult?.page ?? 1}
                    pageSize={teamPlayersResult?.pageSize ?? rosterPageSize}
                    total={teamPlayersResult?.total ?? 0}
                    onPageChange={setRosterPage}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageSizeChange={(size) => {
                      setRosterPageSize(size);
                      setRosterPage(1);
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canManageTeam && (
          <TabsContent value="clubs" className="mt-4 flex flex-col gap-4">
            {isAdmin && isOwner && (
              <Dialog open={isAddClubOpen} onOpenChange={setIsAddClubOpen}>
                <DialogTrigger asChild>
                  <Button className="self-start">Associer un club</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Associer un club partenaire</DialogTitle>
                    <DialogDescription>
                      Ajoutez un club partenaire à cette équipe CTC pour partager son effectif et
                      son encadrement.
                    </DialogDescription>
                  </DialogHeader>
                  <TeamClubAddForm
                    clubId={clubId!}
                    teamId={teamId!}
                    onSuccess={() => setIsAddClubOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <Input
                aria-label="Rechercher un club partenaire"
                placeholder="Rechercher un club…"
                value={teamClubsSearch}
                onChange={(e) => {
                  setTeamClubsSearch(e.target.value);
                  setTeamClubsPage(1);
                }}
                className="max-w-xs"
              />
              <SelectField
                label="Trier par"
                containerClassName="w-56"
                value={teamClubsSort}
                onValueChange={(value) => {
                  setTeamClubsSort(value);
                  setTeamClubsPage(1);
                }}
                options={TEAM_CLUB_SORT_OPTIONS}
              />
            </div>

            <Card>
              <CardContent className="flex flex-col gap-4">
                {isClubsError ? (
                  <QueryError onRetry={() => refetchClubs()} isRetrying={isClubsRefetching} />
                ) : isLoadingClubs ? (
                  <SkeletonList rows={3} />
                ) : (teamClubsResult?.total ?? 0) === 0 ? (
                  <EmptyState
                    icon={<BuildingIcon tone="secondary" className="h-8 w-8" />}
                    title={isTeamClubsFiltered ? 'Aucun résultat' : 'Aucun club partenaire'}
                    description={
                      isTeamClubsFiltered
                        ? 'Aucun club partenaire ne correspond à votre recherche.'
                        : 'Associez un club partenaire pour gérer une équipe CTC à effectif partagé.'
                    }
                    action={
                      isAdmin && isOwner && !isTeamClubsFiltered ? (
                        <Button onClick={() => setIsAddClubOpen(true)}>Associer un club</Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <>
                    <ResponsiveTable columns={['Club', '']}>
                      {teamClubs?.map((link) => (
                        <TeamClubRow
                          key={link.clubId}
                          clubId={clubId!}
                          teamId={teamId!}
                          link={link}
                          canManage={isAdmin && isOwner}
                        />
                      ))}
                    </ResponsiveTable>
                    <Pagination
                      page={teamClubsResult?.page ?? 1}
                      pageSize={teamClubsResult?.pageSize ?? teamClubsPageSize}
                      total={teamClubsResult?.total ?? 0}
                      onPageChange={setTeamClubsPage}
                      pageSizeOptions={PAGE_SIZE_OPTIONS}
                      onPageSizeChange={(size) => {
                        setTeamClubsPageSize(size);
                        setTeamClubsPage(1);
                      }}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canManageTeam && (
          <TabsContent value="admins" className="mt-4 flex flex-col gap-4">
            <Dialog open={isAddAdminOpen} onOpenChange={setIsAddAdminOpen}>
              <DialogTrigger asChild>
                <Button className="self-start">Ajouter un administrateur</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajouter un administrateur d'équipe</DialogTitle>
                  <DialogDescription>
                    Donnez à un membre du club la gestion de cette équipe (effectif, événements)
                    sans en faire un administrateur du club.
                  </DialogDescription>
                </DialogHeader>
                <TeamAdminAddForm
                  clubId={clubId!}
                  teamId={teamId!}
                  candidates={addableAdmins}
                  onSuccess={() => setIsAddAdminOpen(false)}
                />
              </DialogContent>
            </Dialog>

            <Card>
              <CardContent>
                {isAdminsError ? (
                  <QueryError onRetry={() => refetchAdmins()} isRetrying={isAdminsRefetching} />
                ) : isLoadingAdmins ? (
                  <SkeletonList rows={3} />
                ) : (teamAdmins?.length ?? 0) === 0 ? (
                  <EmptyState
                    icon={<ShieldIcon tone="secondary" className="h-8 w-8" />}
                    title="Aucun administrateur d'équipe"
                    description="Donnez à un membre du club la gestion de cette équipe (effectif, événements)."
                    action={
                      <Button onClick={() => setIsAddAdminOpen(true)}>
                        Ajouter un administrateur
                      </Button>
                    }
                  />
                ) : (
                  <ResponsiveTable columns={['E-mail', '']}>
                    {teamAdmins?.map((admin) => (
                      <TeamAdminRow
                        key={admin.userId}
                        clubId={clubId!}
                        teamId={teamId!}
                        admin={admin}
                        canManage={canManageTeam}
                      />
                    ))}
                  </ResponsiveTable>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="events" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {canManageTeam && (
              <Dialog open={isAddEventOpen} onOpenChange={setIsAddEventOpen}>
                <DialogTrigger asChild>
                  <Button className="self-start">Créer un événement</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Créer un événement</DialogTitle>
                    <DialogDescription>
                      Planifiez un entraînement ou un rendez-vous pour cette équipe.
                    </DialogDescription>
                  </DialogHeader>
                  <EventCreateForm
                    clubId={clubId!}
                    teamId={teamId!}
                    onSuccess={() => setIsAddEventOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            )}
            <SegmentedControl
              ariaLabel="Affichage des événements"
              value={eventsViewMode}
              onChange={(next) => {
                if (next !== eventsViewMode) toggleEventsViewMode();
              }}
              options={[
                { value: 'agenda', label: 'Agenda' },
                { value: 'table', label: 'Liste' },
              ]}
            />
          </div>

          {eventsViewMode === 'agenda' && (
            <SegmentedControl
              ariaLabel="Période"
              value={agendaPeriod}
              onChange={(next) => {
                if (next !== agendaPeriod) toggleAgendaPeriod();
              }}
              options={[
                { value: 'upcoming', label: 'À venir' },
                { value: 'past', label: 'Passés' },
              ]}
            />
          )}

          {eventsViewMode === 'table' && (
            <div className="flex flex-wrap items-end gap-3">
              <Input
                aria-label="Rechercher un événement"
                placeholder="Rechercher (lieu, notes)…"
                value={eventsSearch}
                onChange={(e) => {
                  setEventsSearch(e.target.value);
                  setEventsPage(1);
                }}
                className="max-w-xs"
              />
              <FormField
                label="Du"
                type="date"
                value={eventsFrom}
                onChange={(e) => {
                  setEventsFrom(e.target.value);
                  setEventsPage(1);
                }}
              />
              <FormField
                label="Au"
                type="date"
                value={eventsTo}
                onChange={(e) => {
                  setEventsTo(e.target.value);
                  setEventsPage(1);
                }}
              />
              <SelectField
                label="Trier par"
                containerClassName="w-56"
                value={eventsSortOrder}
                onValueChange={(value) => {
                  setEventsSortOrder(value as SortOrder);
                  setEventsPage(1);
                }}
                options={EVENT_SORT_OPTIONS}
              />
            </div>
          )}

          <Card>
            <CardContent className="flex flex-col gap-4">
              {isEventsViewError ? (
                <QueryError
                  onRetry={() => refetchEventsView()}
                  isRetrying={isEventsViewRefetching}
                />
              ) : isLoadingEventsView ? (
                <SkeletonList rows={3} />
              ) : isEventsEmpty ? (
                <EmptyState
                  icon={<CalendarIcon tone="secondary" className="h-8 w-8" />}
                  title={
                    eventsViewMode === 'table' && isEventsFiltered
                      ? 'Aucun résultat'
                      : eventsViewMode === 'agenda' && agendaPeriod === 'past'
                        ? 'Aucun événement passé'
                        : 'Aucun événement'
                  }
                  description={
                    eventsViewMode === 'table' && isEventsFiltered
                      ? 'Aucun événement ne correspond à ces critères.'
                      : eventsViewMode === 'agenda' && agendaPeriod === 'past'
                        ? 'Aucun entraînement ni match n’a encore eu lieu pour cette équipe.'
                        : 'Planifiez un entraînement ou un match pour cette équipe.'
                  }
                  action={
                    canManageTeam &&
                    !(eventsViewMode === 'table' && isEventsFiltered) &&
                    !(eventsViewMode === 'agenda' && agendaPeriod === 'past') ? (
                      <Button onClick={() => setIsAddEventOpen(true)}>Créer un événement</Button>
                    ) : undefined
                  }
                />
              ) : eventsViewMode === 'agenda' ? (
                <TeamEventsAgenda
                  clubId={clubId!}
                  teamId={teamId!}
                  events={agendaEvents}
                  isRostered={isRostered}
                />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Lieu</TableHead>
                        <TableHead>Adversaire</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Réponse</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events?.map((event) => (
                        <EventRow
                          key={event.id}
                          clubId={clubId!}
                          teamId={teamId!}
                          event={event}
                          canManage={canManageTeam}
                          isRostered={isRostered}
                        />
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    page={eventsResult?.page ?? 1}
                    pageSize={eventsResult?.pageSize ?? eventsPageSize}
                    total={eventsResult?.total ?? 0}
                    onPageChange={setEventsPage}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageSizeChange={(size) => {
                      setEventsPageSize(size);
                      setEventsPage(1);
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
