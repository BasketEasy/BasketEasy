import { useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@basketeasy/ui/tabs';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import type { ClubRole } from '@basketeasy/types/club-members';
import type {
  AdminClubDetail,
  AdminClubMember,
  AdminClubRef,
} from '@basketeasy/types/platform-admin-browse';
import { useAdminClub, useAdminClubMembers } from './useAdminQueries';
import { AdminTeamsList } from './AdminTeamsPage';
import { AdminPlayersList } from './AdminPlayersPage';
import { AdminEventsList } from './AdminEventsPage';
import { AdminStatsPanel } from './stats/AdminStatsPanel';
import { AdminMemberDialog } from './actions/AdminMemberDialog';
import { useAdminListParams } from './shared/useAdminListParams';
import { AdminFilterBar, AdminSelectFilter } from './shared/AdminFilters';
import {
  AdminPageHeader,
  AdminPagination,
  AdminStat,
  AdminStats,
  AdminTable,
} from './shared/AdminLayout';
import { AdminPersonLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';
import { adminPaths } from './shared/adminPaths';
import { CLUB_ROLE_LABELS, CLUB_ROLE_TONES, formatAdminDate } from './shared/adminFormat';

type ClubTab = 'members' | 'teams' | 'players' | 'events' | 'stats';
const TABS: ClubTab[] = ['members', 'teams', 'players', 'events', 'stats'];

const MEMBER_FILTER_KEYS = ['role'] as const;
const ROLE_OPTIONS = (Object.keys(CLUB_ROLE_LABELS) as ClubRole[]).map((role) => ({
  value: role,
  label: CLUB_ROLE_LABELS[role],
}));

function MemberRow({ member, club }: { member: AdminClubMember; club: AdminClubRef }) {
  const layout = useTableLayout();
  const role = (
    <Badge variant="soft" tone={CLUB_ROLE_TONES[member.role]}>
      {CLUB_ROLE_LABELS[member.role]}
    </Badge>
  );

  const manage = <AdminMemberDialog clubId={club.id} clubName={club.name} member={member} />;

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <AdminPersonLink person={member.person} withContact />
        <div className="flex flex-wrap items-center gap-2">
          {role}
          <Text as="span" variant="meta" size="sm" className="tabular">
            Depuis le {formatAdminDate(member.joinedAt)}
          </Text>
        </div>
        <div>{manage}</div>
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <AdminPersonLink person={member.person} withContact />
      </TableCell>
      <TableCell>{role}</TableCell>
      <TableCell className="tabular">{formatAdminDate(member.joinedAt)}</TableCell>
      <TableCell className="text-right">{manage}</TableCell>
    </TableRow>
  );
}

function ClubMembers({ club }: { club: AdminClubRef }) {
  const clubId = club.id;
  const { filters, page, setFilters, setPage, pageSize } = useAdminListParams(
    MEMBER_FILTER_KEYS,
    'm.',
  );
  const members = useAdminClubMembers(clubId, {
    role: filters.role as ClubRole | undefined,
    page,
    pageSize,
  });

  return (
    <div className="flex flex-col gap-4">
      <AdminFilterBar>
        <AdminSelectFilter
          label="Rôle"
          allLabel="Tous"
          options={ROLE_OPTIONS}
          value={filters.role as ClubRole | undefined}
          onChange={(role) => setFilters({ role })}
        />
      </AdminFilterBar>
      <AdminQueryBranch
        query={members}
        isEmpty={(data) => data.items.length === 0}
        emptyTitle="Aucun membre"
        loadingLabel="Chargement des membres…"
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <AdminTable
              columns={[
                'Personne',
                'Rôle',
                'Membre depuis',
                <span key="actions" className="sr-only">
                  Actions
                </span>,
              ]}
            >
              {data.items.map((member) => (
                <MemberRow key={member.person.id} member={member} club={club} />
              ))}
            </AdminTable>
            <AdminPagination
              page={page}
              pageSize={pageSize}
              total={data.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </AdminQueryBranch>
    </div>
  );
}

function ClubDetail({ club }: { club: AdminClubDetail }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ClubTab | null;
  const tab: ClubTab = tabParam && TABS.includes(tabParam) ? tabParam : 'members';
  const meetingPoint = club.meetingPointName
    ? `RDV par défaut : ${club.meetingPointName}, ${club.arrivalBufferMinutes} min avant`
    : 'Pas de point de rendez-vous par défaut';

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={club.name}
        parent={{ to: adminPaths.clubs, label: 'Clubs' }}
        badges={
          club.ffbbClubCode && (
            <Badge variant="soft" tone="structure">
              FFBB {club.ffbbClubCode}
            </Badge>
          )
        }
        subtitle={`Créé le ${formatAdminDate(club.createdAt)} · ${meetingPoint}`}
      />

      <AdminStats>
        <AdminStat label="Membres" value={club.memberCount} />
        <AdminStat label="Admins" value={club.adminCount} />
        <AdminStat label="Équipes" value={club.teamCount} />
        <AdminStat label="Joueurs" value={club.playerCount} />
      </AdminStats>

      {/* `?tab=` triggers, the documented exception to "every URL-changing
          control is a link": role="tab" is the right ARIA, and replace keeps
          tab switches out of the history. */}
      <Tabs
        value={tab}
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
          <TabsTrigger value="members">Membres</TabsTrigger>
          <TabsTrigger value="teams">Équipes</TabsTrigger>
          <TabsTrigger value="players">Joueurs</TabsTrigger>
          <TabsTrigger value="events">Événements</TabsTrigger>
          <TabsTrigger value="stats">Statistiques</TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="mt-4">
          <ClubMembers club={club} />
        </TabsContent>
        <TabsContent value="teams" className="mt-4">
          <AdminTeamsList clubId={club.id} prefix="t." />
        </TabsContent>
        <TabsContent value="players" className="mt-4">
          <AdminPlayersList clubId={club.id} prefix="p." />
        </TabsContent>
        <TabsContent value="events" className="mt-4">
          <AdminEventsList clubId={club.id} prefix="e." />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <AdminStatsPanel clubId={club.id} prefix="s." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function AdminClubDetailPage() {
  const { clubId = '' } = useParams<{ clubId: string }>();
  const club = useAdminClub(clubId);

  return (
    <AdminQueryBranch
      query={club}
      errorTitle="Club indisponible"
      loadingLabel="Chargement du club…"
    >
      {(data) => <ClubDetail club={data} />}
    </AdminQueryBranch>
  );
}
