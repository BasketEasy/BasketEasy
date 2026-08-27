import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@basketeasy/ui/tabs';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
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
import { useIsDesktopViewport } from '../hooks/useIsDesktopViewport';
import { Pagination } from '@basketeasy/ui/pagination';
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
import { TeamClubCard } from '../clubs/TeamClubCard';
import { TeamPlayerAddForm } from '../clubs/TeamPlayerAddForm';
import { TeamPlayerRow } from '../clubs/TeamPlayerRow';
import { TeamRosterCards } from '../clubs/TeamRosterCards';
import { EventCreateForm } from '../clubs/EventCreateForm';
import { EventRow } from '../clubs/EventRow';
import { TeamEventsAgenda } from '../clubs/TeamEventsAgenda';
import { TeamAdminAddForm } from '../clubs/TeamAdminAddForm';
import { TeamAdminRow } from '../clubs/TeamAdminRow';
import { TeamAdminCard } from '../clubs/TeamAdminCard';
import { TeamEditModal } from '../clubs/TeamEditModal';
import { TeamFfbbLinkList } from '../clubs/TeamFfbbLinkList';
import { teamCategoryLabel, teamGenderLabel } from '../clubs/teamLabels';
import { BuildingIcon } from '@basketeasy/ui/icons/building';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { ShieldIcon } from '@basketeasy/ui/icons/shield';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { UsersIcon } from '@basketeasy/ui/icons/users';

// Mirrors MembersPage's LINKING_PAGE_SIZE — the "which club players are not
// yet on this roster" computation needs the full roster/player lists, not
// one paginated table page. Capped at the server's MAX_PAGE_SIZE.
const LINKING_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Two-option segmented control for a view-mode toggle (roster cards/table,
 * events agenda/table) — same visual/interaction pattern as
 * EventRsvpControl's segmented control (role="group" of buttons,
 * aria-pressed, shadow-segment-active on the pressed option), adapted for a
 * plain two-state toggle instead of a tri-state selectable value. Reuses the
 * existing toggleXViewMode callback as-is: since there are only ever two
 * states, clicking the inactive option is exactly what that toggle already
 * does (flip state, reset the table view's filters); clicking the active
 * option is a no-op.
 */
function ViewModeToggle<T extends string>({
  ariaLabel,
  value,
  options,
  onToggle,
}: {
  ariaLabel: string;
  value: T;
  options: { value: T; label: string }[];
  onToggle: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex w-fit overflow-hidden rounded-md border border-border bg-sunk"
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onToggle();
            }}
            className={cn(
              'flex min-h-11 items-center justify-center whitespace-nowrap px-3.5 text-sm font-semibold transition-colors',
              focusRing,
              index > 0 && 'border-l border-border-strong',
              active
                ? 'bg-blue-green text-cream shadow-segment-active'
                : 'bg-surface text-muted hover:bg-sunk',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

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

type TeamDetailTab = 'roster' | 'clubs' | 'admins' | 'events';

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
          : 'events';
  // Clubs partenaires/Administrateurs are management-only tabs, hidden from
  // a rostered player with no manage rights — fall back to Événements (the
  // default for everyone) rather than rendering a tab that isn't in the list.
  const activeTab: TeamDetailTab =
    !canManageTeam && (requestedTab === 'clubs' || requestedTab === 'admins')
      ? 'events'
      : requestedTab;
  const backLink = useBackLink();
  const isDesktop = useIsDesktopViewport();
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
    setEventsViewMode((mode) => (mode === 'agenda' ? 'table' : 'agenda'));
  };
  // Agenda fetch window: from the start of today onward, uncapped by an
  // upper bound but capped at LINKING_PAGE_SIZE rows (a team's realistic
  // near-term event count is well under that) — computed once per mount
  // rather than every render, since it only needs to be "today," not "this
  // exact instant."
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
    from: agendaFrom,
    sortOrder: 'asc',
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
          icon={<TrophyIcon className="h-8 w-8 text-muted" />}
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
          <p className="mt-1 text-muted">
            {teamCategoryLabel(team.category)} · {teamGenderLabel(team.gender)}
          </p>
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
          <TabsTrigger value="roster" className="gap-2">
            Effectif
            <Badge variant="outline" aria-hidden="true">
              {allTeamPlayers.length}
            </Badge>
          </TabsTrigger>
          {canManageTeam && (
            <TabsTrigger value="clubs" className="gap-2">
              Clubs partenaires
              <Badge variant="outline" aria-hidden="true">
                {teamClubsResult?.total ?? 0}
              </Badge>
            </TabsTrigger>
          )}
          {canManageTeam && (
            <TabsTrigger value="admins" className="gap-2">
              Administrateurs
              <Badge variant="outline" aria-hidden="true">
                {teamAdmins?.length ?? 0}
              </Badge>
            </TabsTrigger>
          )}
          <TabsTrigger value="events" className="gap-2">
            Événements
            <Badge variant="outline" aria-hidden="true">
              {eventsResult?.total ?? 0}
            </Badge>
          </TabsTrigger>
        </TabsList>

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
            <ViewModeToggle
              ariaLabel="Affichage de l'effectif"
              value={rosterViewMode}
              onToggle={toggleRosterViewMode}
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
            <CardContent className="pt-6 flex flex-col gap-4">
              {isRosterError ? (
                <QueryError onRetry={() => refetchRoster()} isRetrying={isRosterRefetching} />
              ) : isLoadingRoster ? (
                <SkeletonList rows={3} />
              ) : isRosterEmpty ? (
                <EmptyState
                  icon={<UsersIcon className="h-8 w-8 text-muted" />}
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
              <CardContent className="pt-6 flex flex-col gap-4">
                {isClubsError ? (
                  <QueryError onRetry={() => refetchClubs()} isRetrying={isClubsRefetching} />
                ) : isLoadingClubs ? (
                  <SkeletonList rows={3} />
                ) : (teamClubsResult?.total ?? 0) === 0 ? (
                  <EmptyState
                    icon={<BuildingIcon className="h-8 w-8 text-muted" />}
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
                    {isDesktop ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Club</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {teamClubs?.map((link) => (
                            <TeamClubRow
                              key={link.clubId}
                              clubId={clubId!}
                              teamId={teamId!}
                              link={link}
                              canManage={isAdmin && isOwner}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {teamClubs?.map((link) => (
                          <TeamClubCard
                            key={link.clubId}
                            clubId={clubId!}
                            teamId={teamId!}
                            link={link}
                            canManage={isAdmin && isOwner}
                          />
                        ))}
                      </div>
                    )}
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
              <CardContent className="pt-6">
                {isAdminsError ? (
                  <QueryError onRetry={() => refetchAdmins()} isRetrying={isAdminsRefetching} />
                ) : isLoadingAdmins ? (
                  <SkeletonList rows={3} />
                ) : (teamAdmins?.length ?? 0) === 0 ? (
                  <EmptyState
                    icon={<ShieldIcon className="h-8 w-8 text-muted" />}
                    title="Aucun administrateur d'équipe"
                    description="Donnez à un membre du club la gestion de cette équipe (effectif, événements)."
                    action={
                      <Button onClick={() => setIsAddAdminOpen(true)}>
                        Ajouter un administrateur
                      </Button>
                    }
                  />
                ) : isDesktop ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>E-mail</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamAdmins?.map((admin) => (
                        <TeamAdminRow
                          key={admin.userId}
                          clubId={clubId!}
                          teamId={teamId!}
                          admin={admin}
                          canManage={canManageTeam}
                        />
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col gap-3">
                    {teamAdmins?.map((admin) => (
                      <TeamAdminCard
                        key={admin.userId}
                        clubId={clubId!}
                        teamId={teamId!}
                        admin={admin}
                        canManage={canManageTeam}
                      />
                    ))}
                  </div>
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
            <ViewModeToggle
              ariaLabel="Affichage des événements"
              value={eventsViewMode}
              onToggle={toggleEventsViewMode}
              options={[
                { value: 'agenda', label: 'Agenda' },
                { value: 'table', label: 'Liste' },
              ]}
            />
          </div>

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
            <CardContent className="pt-6 flex flex-col gap-4">
              {isEventsViewError ? (
                <QueryError
                  onRetry={() => refetchEventsView()}
                  isRetrying={isEventsViewRefetching}
                />
              ) : isLoadingEventsView ? (
                <SkeletonList rows={3} />
              ) : isEventsEmpty ? (
                <EmptyState
                  icon={<CalendarIcon className="h-8 w-8 text-muted" />}
                  title={
                    eventsViewMode === 'table' && isEventsFiltered
                      ? 'Aucun résultat'
                      : 'Aucun événement'
                  }
                  description={
                    eventsViewMode === 'table' && isEventsFiltered
                      ? 'Aucun événement ne correspond à ces critères.'
                      : 'Planifiez un entraînement ou un match pour cette équipe.'
                  }
                  action={
                    canManageTeam && !(eventsViewMode === 'table' && isEventsFiltered) ? (
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
