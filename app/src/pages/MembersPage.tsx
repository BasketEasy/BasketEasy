import { useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@basketeasy/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@basketeasy/ui/tabs';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Heading } from '@basketeasy/ui/heading';
import { Loader } from '@basketeasy/ui/loader';
import { Input } from '@basketeasy/ui/input';
import { SelectField } from '@basketeasy/ui/select-field';
import { Pagination } from '@basketeasy/ui/pagination';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import type { ClubMember, ClubMemberSortBy } from '@basketeasy/types/club-members';
import type { PlayerSortBy } from '@basketeasy/types/players';
import type { TeamCategory, TeamGender, TeamSortBy } from '@basketeasy/types/teams';
import type { SortOrder } from '@basketeasy/types/pagination';
import { useClubMemberList } from '../clubs/useClubMemberList';
import { useClubMemberRemove } from '../clubs/useClubMemberRemove';
import { usePlayerList } from '../clubs/usePlayerList';
import { useTeamList } from '../clubs/useTeamList';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ClubMemberAddForm } from '../clubs/ClubMemberAddForm';
import { PlayerCreateForm } from '../clubs/PlayerCreateForm';
import { PlayerRow } from '../clubs/PlayerRow';
import { TeamCreateForm } from '../clubs/TeamCreateForm';
import { TeamRow } from '../clubs/TeamRow';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import {
  TEAM_CATEGORY_OPTIONS,
  TEAM_GENDER_OPTIONS,
} from '../clubs/teamLabels';

type MembersTab = 'members' | 'players' | 'teams';

// The member/player picker <select>s (add-member exclusion, player-account
// linking) need the full roster, not one paginated table page — capped at
// the server's MAX_PAGE_SIZE rather than becoming searchable comboboxes,
// see docs/superpowers/specs/2026-08-11-table-filters-pagination-design.md.
const LINKING_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const MEMBER_SORT_OPTIONS: {
  value: string;
  label: string;
  sortBy: ClubMemberSortBy;
  sortOrder: SortOrder;
}[] = [
  { value: 'name:asc', label: 'Nom (A → Z)', sortBy: 'name', sortOrder: 'asc' },
  { value: 'name:desc', label: 'Nom (Z → A)', sortBy: 'name', sortOrder: 'desc' },
  { value: 'email:asc', label: 'E-mail (A → Z)', sortBy: 'email', sortOrder: 'asc' },
  { value: 'email:desc', label: 'E-mail (Z → A)', sortBy: 'email', sortOrder: 'desc' },
  { value: 'joinedAt:desc', label: 'Adhésion la plus récente', sortBy: 'joinedAt', sortOrder: 'desc' },
  { value: 'joinedAt:asc', label: 'Adhésion la plus ancienne', sortBy: 'joinedAt', sortOrder: 'asc' },
];

const PLAYER_SORT_OPTIONS: {
  value: string;
  label: string;
  sortBy: PlayerSortBy;
  sortOrder: SortOrder;
}[] = [
  { value: 'name:asc', label: 'Nom (A → Z)', sortBy: 'name', sortOrder: 'asc' },
  { value: 'name:desc', label: 'Nom (Z → A)', sortBy: 'name', sortOrder: 'desc' },
  { value: 'createdAt:desc', label: 'Ajout le plus récent', sortBy: 'createdAt', sortOrder: 'desc' },
  { value: 'createdAt:asc', label: 'Ajout le plus ancien', sortBy: 'createdAt', sortOrder: 'asc' },
];

const TEAM_SORT_OPTIONS: {
  value: string;
  label: string;
  sortBy: TeamSortBy;
  sortOrder: SortOrder;
}[] = [
  { value: 'name:asc', label: 'Nom (A → Z)', sortBy: 'name', sortOrder: 'asc' },
  { value: 'name:desc', label: 'Nom (Z → A)', sortBy: 'name', sortOrder: 'desc' },
  { value: 'category:asc', label: 'Catégorie (croissante)', sortBy: 'category', sortOrder: 'asc' },
  { value: 'category:desc', label: 'Catégorie (décroissante)', sortBy: 'category', sortOrder: 'desc' },
  { value: 'createdAt:desc', label: 'Création la plus récente', sortBy: 'createdAt', sortOrder: 'desc' },
];

const ALL_ROLES = 'ALL';
const ALL_CATEGORIES = 'ALL';
const ALL_GENDERS = 'ALL';

function MemberRow({
  member,
  isAdmin,
  linkedPlayerName,
  onRemove,
}: {
  member: ClubMember;
  isAdmin: boolean;
  linkedPlayerName: string | null;
  onRemove: (userId: string) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <TableRow>
      <TableCell>{member.email}</TableCell>
      <TableCell>{member.role === 'ADMIN' ? 'Administrateur' : 'Membre'}</TableCell>
      <TableCell>{linkedPlayerName ?? '—'}</TableCell>
      {isAdmin && (
        <TableCell>
          {isConfirming ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">
                Fiche joueur liée : {linkedPlayerName}. Elle sera conservée, seul le lien avec ce
                compte sera supprimé.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsConfirming(false);
                    onRemove(member.userId);
                  }}
                >
                  Confirmer
                </Button>
                <Button variant="ghost" onClick={() => setIsConfirming(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => (linkedPlayerName ? setIsConfirming(true) : onRemove(member.userId))}
            >
              Retirer
            </Button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

export function MembersPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: MembersTab =
    tabParam === 'players' ? 'players' : tabParam === 'teams' ? 'teams' : 'members';

  const isAdmin = useIsClubAdmin(clubId);

  // Membres tab filters
  const [membersSearch, setMembersSearch] = useState('');
  const debouncedMembersSearch = useDebouncedValue(membersSearch);
  const [membersRole, setMembersRole] = useState(ALL_ROLES);
  const [membersSort, setMembersSort] = useState(MEMBER_SORT_OPTIONS[0].value);
  const [membersPage, setMembersPage] = useState(1);
  const [membersPageSize, setMembersPageSize] = useState(DEFAULT_PAGE_SIZE);
  const membersSortOption =
    MEMBER_SORT_OPTIONS.find((o) => o.value === membersSort) ?? MEMBER_SORT_OPTIONS[0];

  // Joueurs tab filters
  const [playersSearch, setPlayersSearch] = useState('');
  const debouncedPlayersSearch = useDebouncedValue(playersSearch);
  const [playersSort, setPlayersSort] = useState(PLAYER_SORT_OPTIONS[0].value);
  const [playersPage, setPlayersPage] = useState(1);
  const [playersPageSize, setPlayersPageSize] = useState(DEFAULT_PAGE_SIZE);
  const playersSortOption =
    PLAYER_SORT_OPTIONS.find((o) => o.value === playersSort) ?? PLAYER_SORT_OPTIONS[0];

  // Équipes tab filters
  const [teamsSearch, setTeamsSearch] = useState('');
  const debouncedTeamsSearch = useDebouncedValue(teamsSearch);
  const [teamsCategory, setTeamsCategory] = useState(ALL_CATEGORIES);
  const [teamsGender, setTeamsGender] = useState(ALL_GENDERS);
  const [teamsSort, setTeamsSort] = useState(TEAM_SORT_OPTIONS[0].value);
  const [teamsPage, setTeamsPage] = useState(1);
  const [teamsPageSize, setTeamsPageSize] = useState(DEFAULT_PAGE_SIZE);
  const teamsSortOption =
    TEAM_SORT_OPTIONS.find((o) => o.value === teamsSort) ?? TEAM_SORT_OPTIONS[0];

  const { data: membersResult, isLoading: isLoadingMembers } = useClubMemberList(
    clubId!,
    {
      search: debouncedMembersSearch || undefined,
      role: membersRole === ALL_ROLES ? undefined : (membersRole as ClubMember['role']),
      sortBy: membersSortOption.sortBy,
      sortOrder: membersSortOption.sortOrder,
      page: membersPage,
      pageSize: membersPageSize,
    },
    { enabled: isAdmin },
  );
  // Unfiltered, capped fetch backing the member-linking pickers below.
  const { data: allMembersResult } = useClubMemberList(
    clubId!,
    { pageSize: LINKING_PAGE_SIZE },
    { enabled: isAdmin },
  );

  const { data: playersResult, isLoading: isLoadingPlayers } = usePlayerList(
    clubId!,
    {
      search: debouncedPlayersSearch || undefined,
      sortBy: playersSortOption.sortBy,
      sortOrder: playersSortOption.sortOrder,
      page: playersPage,
      pageSize: playersPageSize,
    },
    { enabled: isAdmin },
  );
  // Unfiltered, capped fetch backing the "already linked" computation below.
  const { data: allPlayersResult } = usePlayerList(
    clubId!,
    { pageSize: LINKING_PAGE_SIZE },
    { enabled: isAdmin },
  );

  const { data: teamsResult, isLoading: isLoadingTeams } = useTeamList(
    clubId!,
    {
      search: debouncedTeamsSearch || undefined,
      category: teamsCategory === ALL_CATEGORIES ? undefined : (teamsCategory as TeamCategory),
      gender: teamsGender === ALL_GENDERS ? undefined : (teamsGender as TeamGender),
      sortBy: teamsSortOption.sortBy,
      sortOrder: teamsSortOption.sortOrder,
      page: teamsPage,
      pageSize: teamsPageSize,
    },
    { enabled: isAdmin },
  );

  const { mutate: removeMember } = useClubMemberRemove(clubId!);

  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAddTeamOpen, setIsAddTeamOpen] = useState(false);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);

  const members = membersResult?.items;
  const allMembers = allMembersResult?.items ?? [];
  const players = playersResult?.items;
  const allPlayers = allPlayersResult?.items ?? [];
  const teams = teamsResult?.items;

  const linkedUserIds = useMemo(
    () => new Set(allPlayers.flatMap((p) => (p.userId ? [p.userId] : []))),
    [allPlayers],
  );
  const emailByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of allMembers) map.set(member.userId, member.email);
    return map;
  }, [allMembers]);
  const linkedPlayerNameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of allPlayers) {
      if (player.userId) map.set(player.userId, `${player.firstName} ${player.lastName}`);
    }
    return map;
  }, [allPlayers]);

  const handleRemove = (userId: string) => {
    setRemoveError(null);
    removeMember(userId, { onError: (err) => setRemoveError(getClubErrorMessage(err)) });
  };

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <PageContainer size="lg">
      <Heading as="h1" className="m-0">
        Effectif du club
      </Heading>

      {removeError && (
        <Alert variant="destructive">
          <AlertDescription>{removeError}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="members">Membres</TabsTrigger>
          <TabsTrigger value="players">Joueurs</TabsTrigger>
          <TabsTrigger value="teams">Équipes</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4 flex flex-col gap-4">
          {isAdmin && (
            <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
              <DialogTrigger asChild>
                <Button className="self-start">Ajouter un membre</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajouter un membre</DialogTitle>
                  <DialogDescription>
                    Invitez une personne ayant déjà un compte BasketEasy à rejoindre le club.
                  </DialogDescription>
                </DialogHeader>
                <ClubMemberAddForm clubId={clubId!} onSuccess={() => setIsAddMemberOpen(false)} />
              </DialogContent>
            </Dialog>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <Input
              aria-label="Rechercher un membre"
              placeholder="Rechercher un membre (nom, e-mail)…"
              value={membersSearch}
              onChange={(e) => {
                setMembersSearch(e.target.value);
                setMembersPage(1);
              }}
              className="max-w-xs"
            />
            <SelectField
              label="Rôle"
              containerClassName="w-48"
              value={membersRole}
              onValueChange={(value) => {
                setMembersRole(value);
                setMembersPage(1);
              }}
              options={[
                { value: ALL_ROLES, label: 'Tous les rôles' },
                { value: 'ADMIN', label: 'Administrateur' },
                { value: 'MEMBER', label: 'Membre' },
              ]}
            />
            <SelectField
              label="Trier par"
              containerClassName="w-56"
              value={membersSort}
              onValueChange={(value) => {
                setMembersSort(value);
                setMembersPage(1);
              }}
              options={MEMBER_SORT_OPTIONS}
            />
          </div>

          <Card>
            <CardContent className="pt-6 flex flex-col gap-4">
              {isLoadingMembers ? (
                <Loader>Chargement...</Loader>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>E-mail</TableHead>
                        <TableHead>Rôle</TableHead>
                        <TableHead>Fiche joueur liée</TableHead>
                        {isAdmin && <TableHead />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members?.map((member) => (
                        <MemberRow
                          key={member.userId}
                          member={member}
                          isAdmin={isAdmin}
                          linkedPlayerName={linkedPlayerNameByUserId.get(member.userId) ?? null}
                          onRemove={handleRemove}
                        />
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    page={membersResult?.page ?? 1}
                    pageSize={membersResult?.pageSize ?? membersPageSize}
                    total={membersResult?.total ?? 0}
                    onPageChange={setMembersPage}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageSizeChange={(size) => {
                      setMembersPageSize(size);
                      setMembersPage(1);
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="players" className="mt-4 flex flex-col gap-4">
          {isAdmin && (
            <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
              <DialogTrigger asChild>
                <Button className="self-start">Ajouter un joueur</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajouter un joueur</DialogTitle>
                  <DialogDescription>
                    Créez une fiche joueur pour le club, avec un lien optionnel vers un compte
                    membre existant.
                  </DialogDescription>
                </DialogHeader>
                <PlayerCreateForm
                  clubId={clubId!}
                  linkableMembers={allMembers.filter((m) => !linkedUserIds.has(m.userId))}
                  onSuccess={() => setIsAddPlayerOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <Input
              aria-label="Rechercher un joueur"
              placeholder="Rechercher un joueur…"
              value={playersSearch}
              onChange={(e) => {
                setPlayersSearch(e.target.value);
                setPlayersPage(1);
              }}
              className="max-w-xs"
            />
            <SelectField
              label="Trier par"
              containerClassName="w-56"
              value={playersSort}
              onValueChange={(value) => {
                setPlayersSort(value);
                setPlayersPage(1);
              }}
              options={PLAYER_SORT_OPTIONS}
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
                        <TableHead>Compte lié</TableHead>
                        {isAdmin && <TableHead />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {players?.map((player) => (
                        <PlayerRow
                          key={player.id}
                          clubId={clubId!}
                          player={player}
                          isAdmin={isAdmin}
                          linkedMemberEmail={
                            player.userId ? (emailByUserId.get(player.userId) ?? null) : null
                          }
                          linkableMembers={allMembers.filter(
                            (m) => !linkedUserIds.has(m.userId) || m.userId === player.userId,
                          )}
                        />
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    page={playersResult?.page ?? 1}
                    pageSize={playersResult?.pageSize ?? playersPageSize}
                    total={playersResult?.total ?? 0}
                    onPageChange={setPlayersPage}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageSizeChange={(size) => {
                      setPlayersPageSize(size);
                      setPlayersPage(1);
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="mt-4 flex flex-col gap-4">
          {isAdmin && (
            <Dialog open={isAddTeamOpen} onOpenChange={setIsAddTeamOpen}>
              <DialogTrigger asChild>
                <Button className="self-start">Créer une équipe</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Créer une équipe</DialogTitle>
                  <DialogDescription>
                    Créez une équipe du club, avec sa catégorie d'âge et son genre.
                  </DialogDescription>
                </DialogHeader>
                <TeamCreateForm clubId={clubId!} onSuccess={() => setIsAddTeamOpen(false)} />
              </DialogContent>
            </Dialog>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <Input
              aria-label="Rechercher une équipe"
              placeholder="Rechercher une équipe…"
              value={teamsSearch}
              onChange={(e) => {
                setTeamsSearch(e.target.value);
                setTeamsPage(1);
              }}
              className="max-w-xs"
            />
            <SelectField
              label="Catégorie"
              containerClassName="w-40"
              value={teamsCategory}
              onValueChange={(value) => {
                setTeamsCategory(value);
                setTeamsPage(1);
              }}
              options={[
                { value: ALL_CATEGORIES, label: 'Toutes' },
                ...TEAM_CATEGORY_OPTIONS,
              ]}
            />
            <SelectField
              label="Genre"
              containerClassName="w-40"
              value={teamsGender}
              onValueChange={(value) => {
                setTeamsGender(value);
                setTeamsPage(1);
              }}
              options={[{ value: ALL_GENDERS, label: 'Tous' }, ...TEAM_GENDER_OPTIONS]}
            />
            <SelectField
              label="Trier par"
              containerClassName="w-56"
              value={teamsSort}
              onValueChange={(value) => {
                setTeamsSort(value);
                setTeamsPage(1);
              }}
              options={TEAM_SORT_OPTIONS}
            />
          </div>

          <Card>
            <CardContent className="pt-6 flex flex-col gap-4">
              {isLoadingTeams ? (
                <Loader>Chargement...</Loader>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Genre</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teams?.map((team) => (
                        <TeamRow key={team.id} clubId={clubId!} team={team} />
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    page={teamsResult?.page ?? 1}
                    pageSize={teamsResult?.pageSize ?? teamsPageSize}
                    total={teamsResult?.total ?? 0}
                    onPageChange={setTeamsPage}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageSizeChange={(size) => {
                      setTeamsPageSize(size);
                      setTeamsPage(1);
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
