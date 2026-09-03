import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@basketeasy/ui/tabs';
import { Button } from '@basketeasy/ui/button';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Heading } from '@basketeasy/ui/heading';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { QueryError } from '@basketeasy/ui/query-error';
import { SkeletonList } from '@basketeasy/ui/skeleton';
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
import { useMyAgenda } from '../clubs/useMyAgenda';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { TeamRosterTab } from '../clubs/TeamRosterTab';
import { TeamClubsTab } from '../clubs/TeamClubsTab';
import { TeamAdminsTab } from '../clubs/TeamAdminsTab';
import { TeamEventsTab } from '../clubs/TeamEventsTab';
import { TeamAgendaTab } from '../clubs/TeamAgendaTab';
import { ROSTER_SORT_OPTIONS, TEAM_CLUB_SORT_OPTIONS } from '../clubs/teamFilterOptions';
import { TeamSeasonStatsTab } from '../clubs/TeamSeasonStatsTab';
import { TeamEditModal } from '../clubs/TeamEditModal';
import { TeamFfbbLinkList } from '../clubs/TeamFfbbLinkList';
import { teamCategoryLabel, teamGenderLabel } from '../clubs/teamLabels';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { Text } from '@basketeasy/ui/text';

// Mirrors MembersPage's LINKING_PAGE_SIZE — the "which club players are not
// yet on this roster" computation needs the full roster/player lists, not
// one paginated table page. Capped at the server's MAX_PAGE_SIZE.
const LINKING_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

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

  // « À traiter » (phase 9) — only a manager has anything here (the server
  // gates actionItems on admin/TeamAdmin status), so the fetch is skipped
  // entirely for a rostered player viewing the same page. No custom
  // from/to: the default 7-day window is also what every action-item kind's
  // own window is bounded by (`DashboardService`), independent of it.
  const { data: dashboard } = useMyAgenda(undefined, { enabled: canManageTeam });
  const teamActionItems = useMemo(
    () => (dashboard?.actionItems ?? []).filter((item) => item.teamId === teamId),
    [dashboard, teamId],
  );

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
  // The player's Agenda tab (TeamAgendaTab) always reads the agenda fetch,
  // regardless of eventsViewMode/eventsViewMode's manager-only table state —
  // it has no table view to fall back to.
  const isAgendaEmpty = agendaEventsResult?.total === 0;

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
          {canManageTeam ? (
            // Manager: the five tabs stay exactly as they are, in the order
            // they've always been in — the desktop power view this revamp
            // deliberately doesn't touch (docs/ux-audit/player-journey.md
            // §4.4).
            <>
              <TabsTrigger value="roster" badge={allTeamPlayers.length}>
                Effectif
              </TabsTrigger>
              <TabsTrigger value="clubs" badge={teamClubsResult?.total ?? 0}>
                Clubs partenaires
              </TabsTrigger>
              <TabsTrigger value="admins" badge={teamAdmins?.length ?? 0}>
                Administrateurs
              </TabsTrigger>
              <TabsTrigger value="stats">Statistiques</TabsTrigger>
              <TabsTrigger value="events" badge={eventsResult?.total ?? 0}>
                Événements
              </TabsTrigger>
            </>
          ) : (
            // Player: three tabs, agenda-first — the two management-only
            // tabs (Clubs partenaires, Administrateurs) were never in this
            // list. "Agenda" and "Mes stats" reuse the same "events"/"stats"
            // tab ids as the manager view (so ?tab= and the default fallback
            // keep working unchanged); only the label, order and — for
            // "events" — the rendered content differ.
            <>
              <TabsTrigger value="events">Agenda</TabsTrigger>
              <TabsTrigger value="roster" badge={allTeamPlayers.length}>
                Effectif
              </TabsTrigger>
              <TabsTrigger value="stats">Mes stats</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="stats" className="mt-4">
          <TeamSeasonStatsTab
            clubId={clubId!}
            teamId={teamId!}
            season={statsSeason}
            onSeasonChange={setStatsSeason}
          />
        </TabsContent>

        <TabsContent value="roster">
          <TeamRosterTab
            clubId={clubId!}
            teamId={teamId!}
            teamGender={team.gender}
            canManageTeam={canManageTeam}
            addablePlayers={addablePlayers}
            isAddPlayerOpen={isAddPlayerOpen}
            setIsAddPlayerOpen={setIsAddPlayerOpen}
            rosterViewMode={rosterViewMode}
            toggleRosterViewMode={toggleRosterViewMode}
            rosterSearch={rosterSearch}
            setRosterSearch={setRosterSearch}
            rosterSort={rosterSort}
            setRosterSort={setRosterSort}
            setRosterPage={setRosterPage}
            rosterPageSize={rosterPageSize}
            setRosterPageSize={setRosterPageSize}
            isRosterFiltered={isRosterFiltered}
            isRosterError={isRosterError}
            isLoadingRoster={isLoadingRoster}
            isRosterRefetching={isRosterRefetching}
            refetchRoster={refetchRoster}
            isRosterEmpty={isRosterEmpty}
            allTeamPlayers={allTeamPlayers}
            teamPlayers={teamPlayers}
            teamPlayersResult={teamPlayersResult}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        </TabsContent>

        {canManageTeam && (
          <TabsContent value="clubs">
            <TeamClubsTab
              clubId={clubId!}
              teamId={teamId!}
              isAdmin={isAdmin}
              isOwner={isOwner}
              isAddClubOpen={isAddClubOpen}
              setIsAddClubOpen={setIsAddClubOpen}
              teamClubsSearch={teamClubsSearch}
              setTeamClubsSearch={setTeamClubsSearch}
              teamClubsSort={teamClubsSort}
              setTeamClubsSort={setTeamClubsSort}
              setTeamClubsPage={setTeamClubsPage}
              teamClubsPageSize={teamClubsPageSize}
              setTeamClubsPageSize={setTeamClubsPageSize}
              isTeamClubsFiltered={isTeamClubsFiltered}
              isClubsError={isClubsError}
              isLoadingClubs={isLoadingClubs}
              isClubsRefetching={isClubsRefetching}
              refetchClubs={refetchClubs}
              teamClubs={teamClubs}
              teamClubsResult={teamClubsResult}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          </TabsContent>
        )}

        {canManageTeam && (
          <TabsContent value="admins">
            <TeamAdminsTab
              clubId={clubId!}
              teamId={teamId!}
              canManageTeam={canManageTeam}
              isAddAdminOpen={isAddAdminOpen}
              setIsAddAdminOpen={setIsAddAdminOpen}
              addableAdmins={addableAdmins}
              isAdminsError={isAdminsError}
              isLoadingAdmins={isLoadingAdmins}
              isAdminsRefetching={isAdminsRefetching}
              refetchAdmins={refetchAdmins}
              teamAdmins={teamAdmins}
            />
          </TabsContent>
        )}

        <TabsContent value="events">
          {canManageTeam ? (
            <TeamEventsTab
              clubId={clubId!}
              teamId={teamId!}
              canManageTeam={canManageTeam}
              isRostered={isRostered}
              teamActionItems={teamActionItems}
              isAddEventOpen={isAddEventOpen}
              setIsAddEventOpen={setIsAddEventOpen}
              eventsViewMode={eventsViewMode}
              toggleEventsViewMode={toggleEventsViewMode}
              agendaPeriod={agendaPeriod}
              toggleAgendaPeriod={toggleAgendaPeriod}
              eventsSearch={eventsSearch}
              setEventsSearch={setEventsSearch}
              eventsFrom={eventsFrom}
              setEventsFrom={setEventsFrom}
              eventsTo={eventsTo}
              setEventsTo={setEventsTo}
              eventsSortOrder={eventsSortOrder}
              setEventsSortOrder={setEventsSortOrder}
              setEventsPage={setEventsPage}
              eventsPageSize={eventsPageSize}
              setEventsPageSize={setEventsPageSize}
              isEventsFiltered={isEventsFiltered}
              isEventsViewError={isEventsViewError}
              isLoadingEventsView={isLoadingEventsView}
              isEventsViewRefetching={isEventsViewRefetching}
              refetchEventsView={refetchEventsView}
              isEventsEmpty={isEventsEmpty}
              agendaEvents={agendaEvents}
              events={events}
              eventsResult={eventsResult}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          ) : (
            <TeamAgendaTab
              clubId={clubId!}
              teamId={teamId!}
              isRostered={isRostered}
              agendaPeriod={agendaPeriod}
              toggleAgendaPeriod={toggleAgendaPeriod}
              isLoading={isLoadingAgendaEvents}
              isError={isAgendaEventsError}
              isRefetching={isAgendaEventsRefetching}
              refetch={refetchAgendaEvents}
              isEmpty={isAgendaEmpty}
              agendaEvents={agendaEvents}
            />
          )}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
