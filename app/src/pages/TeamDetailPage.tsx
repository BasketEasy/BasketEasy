import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
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
import { Loader } from '@basketeasy/ui/loader';
import { Pagination } from '@basketeasy/ui/pagination';
import { SelectField } from '@basketeasy/ui/select-field';
import type { TeamCategory, TeamGender } from '@basketeasy/types/teams';
import type { TeamClubSortBy, TeamPlayerSortBy } from '@basketeasy/types/teams';
import type { SortOrder } from '@basketeasy/types/pagination';
import { useTeamShow } from '../clubs/useTeamShow';
import { useTeamUpdate } from '../clubs/useTeamUpdate';
import { useTeamDelete } from '../clubs/useTeamDelete';
import { useTeamClubList } from '../clubs/useTeamClubList';
import { useTeamPlayerList } from '../clubs/useTeamPlayerList';
import { usePlayerList } from '../clubs/usePlayerList';
import { useEventList } from '../clubs/useEventList';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { useIsTeamManager } from '../clubs/useIsTeamManager';
import { useTeamAdminList } from '../clubs/useTeamAdminList';
import { useTeamAdminCandidates } from '../clubs/useTeamAdminCandidates';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { TeamClubAddForm } from '../clubs/TeamClubAddForm';
import { TeamClubRow } from '../clubs/TeamClubRow';
import { TeamPlayerAddForm } from '../clubs/TeamPlayerAddForm';
import { TeamPlayerRow } from '../clubs/TeamPlayerRow';
import { EventCreateForm } from '../clubs/EventCreateForm';
import { EventRow } from '../clubs/EventRow';
import { TeamAdminAddForm } from '../clubs/TeamAdminAddForm';
import { TeamAdminRow } from '../clubs/TeamAdminRow';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import {
  TEAM_CATEGORY_OPTIONS,
  TEAM_GENDER_OPTIONS,
  teamCategoryLabel,
  teamGenderLabel,
} from '../clubs/teamLabels';

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

export function TeamDetailPage() {
  const { clubId, teamId } = useParams<{ clubId: string; teamId: string }>();
  const navigate = useNavigate();
  const isAdmin = useIsClubAdmin(clubId);
  const canManageTeam = useIsTeamManager(clubId!, teamId!);

  const { data: team, isLoading: isLoadingTeam } = useTeamShow(clubId!, teamId!);

  // Clubs partenaires (CTC) filters
  const [teamClubsSearch, setTeamClubsSearch] = useState('');
  const debouncedTeamClubsSearch = useDebouncedValue(teamClubsSearch);
  const [teamClubsSort, setTeamClubsSort] = useState(TEAM_CLUB_SORT_OPTIONS[0].value);
  const [teamClubsPage, setTeamClubsPage] = useState(1);
  const [teamClubsPageSize, setTeamClubsPageSize] = useState(DEFAULT_PAGE_SIZE);
  const teamClubsSortOption =
    TEAM_CLUB_SORT_OPTIONS.find((o) => o.value === teamClubsSort) ?? TEAM_CLUB_SORT_OPTIONS[0];

  // Effectif (roster) filters
  const [rosterSearch, setRosterSearch] = useState('');
  const debouncedRosterSearch = useDebouncedValue(rosterSearch);
  const [rosterSort, setRosterSort] = useState(ROSTER_SORT_OPTIONS[0].value);
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterPageSize, setRosterPageSize] = useState(DEFAULT_PAGE_SIZE);
  const rosterSortOption =
    ROSTER_SORT_OPTIONS.find((o) => o.value === rosterSort) ?? ROSTER_SORT_OPTIONS[0];

  // Événements filters
  const [eventsSearch, setEventsSearch] = useState('');
  const debouncedEventsSearch = useDebouncedValue(eventsSearch);
  const [eventsFrom, setEventsFrom] = useState('');
  const [eventsTo, setEventsTo] = useState('');
  const [eventsSortOrder, setEventsSortOrder] = useState<SortOrder>('asc');
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { data: teamClubsResult, isLoading: isLoadingClubs } = useTeamClubList(clubId!, teamId!, {
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

  const { data: teamPlayersResult, isLoading: isLoadingPlayers } = useTeamPlayerList(
    clubId!,
    teamId!,
    {
      search: debouncedRosterSearch || undefined,
      sortBy: rosterSortOption.sortBy,
      sortOrder: rosterSortOption.sortOrder,
      page: rosterPage,
      pageSize: rosterPageSize,
    },
  );
  // Unfiltered, capped fetch backing the "already rostered" computation below.
  const { data: allTeamPlayersResult } = useTeamPlayerList(clubId!, teamId!, {
    pageSize: LINKING_PAGE_SIZE,
  });
  const { data: clubPlayersResult } = usePlayerList(clubId!, { pageSize: LINKING_PAGE_SIZE });

  const { data: eventsResult, isLoading: isLoadingEvents } = useEventList(clubId!, teamId!, {
    search: debouncedEventsSearch || undefined,
    from: eventsFrom ? new Date(eventsFrom).toISOString() : undefined,
    to: eventsTo ? new Date(eventsTo).toISOString() : undefined,
    sortOrder: eventsSortOrder,
    page: eventsPage,
    pageSize: eventsPageSize,
  });

  const { data: teamAdmins, isLoading: isLoadingAdmins } = useTeamAdminList(clubId!, teamId!);
  const { data: teamAdminCandidatesResult } = useTeamAdminCandidates(clubId!, teamId!);

  const { mutate: updateTeam, isPending: isUpdating } = useTeamUpdate(clubId!, teamId!);
  const { mutate: deleteTeam, isPending: isDeleting } = useTeamDelete(clubId!);

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TeamCategory>('U9');
  const [gender, setGender] = useState<TeamGender>('MEN');
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isAddClubOpen, setIsAddClubOpen] = useState(false);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);

  const teamClubs = teamClubsResult?.items;
  const teamPlayers = teamPlayersResult?.items;
  const allTeamPlayers = useMemo(() => allTeamPlayersResult?.items ?? [], [allTeamPlayersResult]);
  const clubPlayers = useMemo(() => clubPlayersResult?.items ?? [], [clubPlayersResult]);
  const events = eventsResult?.items;

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

  const startEditing = () => {
    if (!team) return;
    setName(team.name);
    setCategory(team.category);
    setGender(team.gender);
    setEditError(null);
    setIsEditing(true);
  };

  const handleDelete = () => {
    setDeleteError(null);
    deleteTeam(teamId!, {
      onSuccess: () => navigate(`/clubs/${clubId}/members?tab=teams`),
      onError: (err) => setDeleteError(getClubErrorMessage(err)),
    });
  };

  if (isLoadingTeam || !team) {
    return (
      <PageContainer size="lg">
        <Loader>Chargement...</Loader>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="lg">
      <Button
        variant="ghost"
        className="self-start"
        onClick={() => navigate(`/clubs/${clubId}/members?tab=teams`)}
      >
        ← Retour à l'effectif
      </Button>

      {isEditing ? (
        <div className="flex flex-col gap-4">
          {editError && (
            <Alert variant="destructive">
              <AlertDescription>{editError}</AlertDescription>
            </Alert>
          )}
          <FormField
            label="Nom de l'équipe"
            id="team-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <SelectField
            label="Catégorie"
            id="team-edit-category-select"
            options={TEAM_CATEGORY_OPTIONS}
            value={category}
            onValueChange={(value) => setCategory(value as TeamCategory)}
          />

          <SelectField
            label="Genre"
            id="team-edit-gender-select"
            options={TEAM_GENDER_OPTIONS}
            value={gender}
            onValueChange={(value) => setGender(value as TeamGender)}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isUpdating}
              onClick={() =>
                updateTeam(
                  { name, category, gender },
                  {
                    onSuccess: () => setIsEditing(false),
                    onError: (err) => setEditError(getClubErrorMessage(err)),
                  },
                )
              }
            >
              Enregistrer
            </Button>
            <Button variant="ghost" onClick={() => setIsEditing(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
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
              <Button variant="outline" onClick={startEditing}>
                Modifier
              </Button>
              {isAdmin && isOwner && (
                <Button variant="outline" disabled={isDeleting} onClick={handleDelete}>
                  Supprimer
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {deleteError && (
        <Alert variant="destructive">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Heading as="h2" size="2xl" className="m-0">
            Clubs partenaires (CTC)
          </Heading>
          {isAdmin && isOwner && (
            <Dialog open={isAddClubOpen} onOpenChange={setIsAddClubOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Associer un club</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Associer un club partenaire</DialogTitle>
                  <DialogDescription>
                    Ajoutez un club partenaire à cette équipe CTC pour partager son effectif et son
                    encadrement.
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
        </div>

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
            {isLoadingClubs ? (
              <Loader>Chargement...</Loader>
            ) : (
              <>
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
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Heading as="h2" size="2xl" className="m-0">
            Effectif
          </Heading>
          {canManageTeam && (
            <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Ajouter un joueur</Button>
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
        </div>

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

        <Card>
          <CardContent className="pt-6 flex flex-col gap-4">
            {isLoadingPlayers ? (
              <Loader>Chargement...</Loader>
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
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Heading as="h2" size="2xl" className="m-0">
            Événements
          </Heading>
          {canManageTeam && (
            <Dialog open={isAddEventOpen} onOpenChange={setIsAddEventOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Créer un événement</Button>
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
        </div>

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

        <Card>
          <CardContent className="pt-6 flex flex-col gap-4">
            {isLoadingEvents ? (
              <Loader>Chargement...</Loader>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Lieu</TableHead>
                      <TableHead>Notes</TableHead>
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
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Heading as="h2" size="2xl" className="m-0">
            Administrateurs de l'équipe
          </Heading>
          {canManageTeam && (
            <Dialog open={isAddAdminOpen} onOpenChange={setIsAddAdminOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Ajouter un administrateur</Button>
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
          )}
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoadingAdmins ? (
              <Loader>Chargement...</Loader>
            ) : (
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
            )}
          </CardContent>
        </Card>
      </section>
    </PageContainer>
  );
}
