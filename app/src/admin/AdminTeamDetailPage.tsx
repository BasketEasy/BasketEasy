import { useParams } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import type { AdminRosterEntry, AdminTeamDetail } from '@basketeasy/types/platform-admin-browse';
import { teamCategoryLabel, teamGenderLabel, teamMemberRoleLabel } from '../clubs/teamLabels';
import { useAdminTeam, useAdminTeamRoster } from './useAdminQueries';
import { AdminEventsList } from './AdminEventsPage';
import { AdminActionDialog } from './actions/AdminActionDialog';
import { AdminActionRow, AdminActionsCard } from './actions/AdminActionsCard';
import { AdminAddTeamAdminDialog } from './actions/AdminAddTeamAdminDialog';
import {
  AdminLinkedList,
  AdminPageHeader,
  AdminSection,
  AdminTable,
  AdminTwoColumn,
} from './shared/AdminLayout';
import { AdminClubLink, AdminLink, AdminPersonLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';
import { adminPaths } from './shared/adminPaths';
import { usePlatformSession } from './platformSession';
import { formatAdminDate } from './shared/adminFormat';

function RosterRow({ entry }: { entry: AdminRosterEntry }) {
  const layout = useTableLayout();
  const role = (
    <Badge variant="soft" tone={entry.role === 'COACH' ? 'brand' : 'muted'}>
      {teamMemberRoleLabel(entry.role)}
    </Badge>
  );
  const account = entry.linkedUser ? (
    <AdminPersonLink person={entry.linkedUser} />
  ) : (
    <Text as="span" variant="meta" size="sm">
      Aucun
    </Text>
  );

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <AdminPersonLink person={entry.player} />
          {role}
        </div>
        <AdminClubLink club={entry.club} />
        <div className="flex flex-wrap items-center gap-2">
          <Text as="span" variant="meta" size="sm">
            Compte :
          </Text>
          {account}
        </div>
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <AdminPersonLink person={entry.player} />
      </TableCell>
      <TableCell>
        <AdminClubLink club={entry.club} />
      </TableCell>
      <TableCell>{role}</TableCell>
      <TableCell>{account}</TableCell>
    </TableRow>
  );
}

function TeamRoster({ teamId }: { teamId: string }) {
  const roster = useAdminTeamRoster(teamId);

  return (
    <AdminSection title="Effectif" count={roster.data?.length}>
      <AdminQueryBranch
        query={roster}
        isEmpty={(data) => data.length === 0}
        emptyTitle="Effectif vide"
        emptyDescription="Personne n’est encore inscrit dans cette équipe."
        loadingLabel="Chargement de l’effectif…"
      >
        {(data) => (
          <AdminTable columns={['Joueur', 'Club', 'Rôle', 'Compte lié']}>
            {data.map((entry) => (
              <RosterRow key={entry.teamPlayerId} entry={entry} />
            ))}
          </AdminTable>
        )}
      </AdminQueryBranch>
    </AdminSection>
  );
}

function TeamDetail({ team }: { team: AdminTeamDetail }) {
  const { session } = usePlatformSession();
  const isDataOfficer = session?.role === 'DATA_OFFICER';
  const clubs = [
    ...(team.ownerClub ? [{ club: team.ownerClub, isOwner: true }] : []),
    ...team.partnerClubs.map((club) => ({ club, isOwner: false })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={team.name}
        eyebrow="Équipe"
        parent={{ to: adminPaths.teams, label: 'Équipes' }}
        badges={
          <>
            <Badge variant="soft" tone="structure">
              {teamCategoryLabel(team.category)} · {teamGenderLabel(team.gender)}
            </Badge>
            {team.partnerClubs.length > 0 && (
              <Badge variant="soft" tone="structure">
                CTC · {clubs.length} clubs
              </Badge>
            )}
          </>
        }
        subtitle={`Créée le ${formatAdminDate(team.createdAt)}`}
      />

      <AdminTwoColumn
        main={
          <>
            <TeamRoster teamId={team.id} />
            <AdminSection title="Événements">
              <AdminEventsList teamId={team.id} prefix="e." />
            </AdminSection>
          </>
        }
        aside={
          <>
            <AdminSection title="Clubs" count={clubs.length}>
              <AdminLinkedList
                empty="Aucun club lié."
                items={clubs.map(({ club, isOwner }) => ({
                  key: club.id,
                  primary: <AdminClubLink club={club} />,
                  trailing: (
                    <Badge variant="soft" tone={isOwner ? 'brand' : 'muted'}>
                      {isOwner ? 'Propriétaire' : 'Partenaire'}
                    </Badge>
                  ),
                }))}
              />
            </AdminSection>
            <AdminSection title="Gestionnaires" count={team.teamAdmins.length}>
              <AdminLinkedList
                empty="Aucun gestionnaire d’équipe : seuls les admins des clubs la gèrent."
                items={team.teamAdmins.map((grant) => ({
                  key: grant.person.id,
                  primary: <AdminPersonLink person={grant.person} />,
                  secondary: `Depuis le ${formatAdminDate(grant.grantedAt)}`,
                  trailing: (
                    <AdminActionDialog
                      trigger={
                        <Button variant="outline" size="sm">
                          Retirer
                        </Button>
                      }
                      title="Retirer le gestionnaire"
                      description={`${grant.person.displayName} ne pourra plus gérer ${team.name}. S’il est admin d’un club lié, il garde ses droits de club.`}
                      confirmLabel="Retirer"
                      danger
                      path={`teams/${team.id}/admins/${grant.person.id}/remove`}
                    />
                  ),
                }))}
              />
            </AdminSection>
            <AdminActionsCard>
              <AdminActionRow
                title="Ajouter un gestionnaire"
                detail="Parmi les membres des clubs liés"
                action={
                  <AdminAddTeamAdminDialog
                    teamId={team.id}
                    clubs={clubs.map(({ club }) => club)}
                    currentAdminIds={new Set(team.teamAdmins.map((grant) => grant.person.id))}
                  />
                }
              />
              {/* DATA_OFFICER-only on the server: the owner decides who may
                  delete the team and its partners' shared data. */}
              {isDataOfficer && team.ownerClub && team.partnerClubs.length > 0 && (
                <AdminActionRow
                  title="Transférer la propriété"
                  detail={`Aujourd’hui : ${team.ownerClub.name}`}
                  action={
                    <AdminActionDialog
                      trigger={<Button variant="outline">Transférer</Button>}
                      title="Transférer la propriété"
                      description="Le club propriétaire peut ajouter ou retirer des clubs partenaires et supprimer l’équipe. L’effectif et les événements ne bougent pas."
                      facts={[{ label: 'Propriétaire actuel', value: team.ownerClub.name }]}
                      fields={[
                        {
                          name: 'clubId',
                          kind: 'select',
                          label: 'Nouveau club propriétaire',
                          placeholder: 'Choisir un club partenaire',
                          requiredMessage: 'Choisissez un club',
                          options: team.partnerClubs.map((club) => ({
                            value: club.id,
                            label: club.name,
                          })),
                        },
                      ]}
                      confirmLabel="Transférer"
                      path={`teams/${team.id}/owner`}
                    />
                  }
                />
              )}
            </AdminActionsCard>
            {team.ffbbLinks.length > 0 && (
              <AdminSection title="Engagements FFBB" count={team.ffbbLinks.length}>
                <AdminLinkedList
                  empty=""
                  items={team.ffbbLinks.map((link) => ({
                    key: link.id,
                    primary: <Text as="span">{link.label ?? link.engagementRef}</Text>,
                    secondary: link.label ? link.engagementRef : undefined,
                  }))}
                />
              </AdminSection>
            )}
            <Card variant="panel" className="flex flex-col gap-2">
              <SectionHeading as="h2">Voir aussi</SectionHeading>
              <AdminLink to={`${adminPaths.users}?teamId=${team.id}`}>
                Comptes liés à l’équipe
              </AdminLink>
            </Card>
          </>
        }
      />
    </div>
  );
}

export function AdminTeamDetailPage() {
  const { teamId = '' } = useParams<{ teamId: string }>();
  const team = useAdminTeam(teamId);

  return (
    <AdminQueryBranch
      query={team}
      errorTitle="Équipe indisponible"
      loadingLabel="Chargement de l’équipe…"
    >
      {(data) => <TeamDetail team={data} />}
    </AdminQueryBranch>
  );
}
