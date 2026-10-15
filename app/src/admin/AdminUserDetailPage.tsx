import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
import { Link } from 'react-router-dom';
import type { AdminUserDetail } from '@basketeasy/types/platform-admin-browse';
import { useAdminUser } from './useAdminQueries';
import { AdminEraseDialog } from './AdminEraseDialog';
import { AdminUserExportDialog } from './AdminUserExportDialog';
import { AdminUserActions } from './actions/AdminUserActions';
import { AdminImpersonateCard } from './AdminImpersonateDialog';
import { usePlatformSession } from './platformSession';
import {
  AdminFacts,
  AdminLinkedList,
  AdminPageHeader,
  AdminSection,
  AdminTwoColumn,
} from './shared/AdminLayout';
import { AdminClubLink, AdminPersonLink, AdminTeamLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';
import { adminPaths } from './shared/adminPaths';
import {
  CLUB_ROLE_LABELS,
  CLUB_ROLE_TONES,
  formatAdminDate,
  formatAdminDateTime,
} from './shared/adminFormat';

function erasureLabel(days: number): string {
  if (days < 0) return 'Échéance dépassée, en attente de la purge';
  return `Dans ${days} jour${days > 1 ? 's' : ''}`;
}

function UserDetail({ user, onErased }: { user: AdminUserDetail; onErased: () => void }) {
  const { session } = usePlatformSession();
  // The server decides what is redacted. This only hides what a SUPPORT
  // caller can't use: the export and erase routes and the audit log are
  // DATA_OFFICER-only, and the dialogs are titled with an address SUPPORT
  // never receives.
  const email = session?.role === 'DATA_OFFICER' ? user.person.email : null;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={user.person.displayName}
        eyebrow="Utilisateur"
        parent={{ to: adminPaths.users, label: 'Utilisateurs' }}
        badges={
          <>
            {user.person.redacted && (
              <Badge variant="outline" tone="muted">
                masqué
              </Badge>
            )}
            <Badge variant="soft" tone={user.emailVerified ? 'success' : 'muted'}>
              {user.emailVerified ? 'Adresse vérifiée' : 'Adresse non vérifiée'}
            </Badge>
            {user.guardianOfCount > 0 && (
              <Badge variant="soft" tone="structure">
                Parent de {user.guardianOfCount} joueur{user.guardianOfCount > 1 ? 's' : ''}
              </Badge>
            )}
            {email && (
              <Text as="span" variant="meta" size="sm">
                Consultation journalisée
              </Text>
            )}
          </>
        }
        actions={
          email && (
            <Button variant="outline" asChild>
              <Link to={`${adminPaths.auditLog}?userId=${user.person.id}`}>
                Journal d’audit de ce compte
              </Link>
            </Button>
          )
        }
      />

      <AdminTwoColumn
        main={
          <>
            <AdminSection title="Clubs" count={user.memberships.length}>
              <AdminLinkedList
                empty="Ce compte n’appartient à aucun club."
                items={user.memberships.map((membership) => ({
                  key: membership.club.id,
                  primary: <AdminClubLink club={membership.club} />,
                  secondary: `Depuis le ${formatAdminDate(membership.joinedAt)}`,
                  trailing: (
                    <Badge variant="soft" tone={CLUB_ROLE_TONES[membership.role]}>
                      {CLUB_ROLE_LABELS[membership.role]}
                    </Badge>
                  ),
                }))}
              />
            </AdminSection>

            <AdminSection title="Équipes gérées" count={user.teamAdminOf.length}>
              <AdminLinkedList
                empty="Aucune équipe gérée."
                items={user.teamAdminOf.map((grant) => ({
                  key: grant.team.id,
                  primary: <AdminTeamLink team={grant.team} />,
                  secondary: `Accordé le ${formatAdminDate(grant.grantedAt)}`,
                }))}
              />
            </AdminSection>

            <AdminSection
              title="Fiches joueur liées"
              count={user.linkedPlayers.length}
              description="Conservées après un effacement du compte, simplement détachées : l’historique et les statistiques du club restent intacts."
            >
              <AdminLinkedList
                empty="Aucune fiche joueur liée."
                items={user.linkedPlayers.map((linked) => ({
                  key: linked.player.id,
                  primary: (
                    <>
                      <AdminPersonLink person={linked.player} />
                      <Text as="span" variant="meta" size="sm">
                        · <AdminClubLink club={linked.club} />
                      </Text>
                    </>
                  ),
                  trailing: linked.teams.map((team) => <AdminTeamLink key={team.id} team={team} />),
                }))}
              />
            </AdminSection>

            <AdminSection title="Enfants suivis" count={user.guardianOf.length}>
              <AdminLinkedList
                empty="Ce compte ne suit aucun enfant."
                items={user.guardianOf.map((link) => ({
                  key: link.player.id,
                  primary: (
                    <>
                      <AdminPersonLink person={link.player} />
                      <Text as="span" variant="meta" size="sm">
                        · <AdminClubLink club={link.club} />
                      </Text>
                    </>
                  ),
                  secondary: `Lié le ${formatAdminDate(link.linkedAt)}`,
                }))}
              />
            </AdminSection>
          </>
        }
        aside={
          <>
            <AdminFacts
              facts={[
                {
                  label: 'Adresse e-mail',
                  value: (
                    <Text variant="label" className="break-all">
                      {user.person.email ?? `…@${user.person.emailDomain ?? ''}`}
                    </Text>
                  ),
                },
                {
                  label: 'Compte créé le',
                  value: <Text className="tabular">{formatAdminDateTime(user.createdAt)}</Text>,
                },
                {
                  label: 'Dernière activité',
                  value: <Text className="tabular">{formatAdminDateTime(user.lastActiveAt)}</Text>,
                },
                {
                  label: 'Effacement automatique',
                  value: <Text className="tabular">{erasureLabel(user.daysUntilErasure)}</Text>,
                },
                {
                  label: 'Sessions actives',
                  value: <Text className="tabular">{user.activeSessionCount}</Text>,
                },
                {
                  label: 'Rôle plateforme',
                  value: (
                    <Text>
                      {user.platformRole === 'DATA_OFFICER'
                        ? 'Délégué à la protection'
                        : user.platformRole === 'SUPPORT'
                          ? 'Support'
                          : '—'}
                    </Text>
                  ),
                },
              ]}
            />

            <AdminUserActions user={user} />

            {email && user.platformRole === null && (
              <AdminImpersonateCard userId={user.person.id} displayName={user.person.displayName} />
            )}

            {/* Export above erasure deliberately, not for visual balance:
                erasure detaches the roster entries rather than deleting
                them, so once it has run nothing links those rows back to the
                person and the export can never be produced. */}
            {email && (
              <>
                <Card variant="panel" className="flex flex-col gap-3">
                  <SectionHeading as="h2">Export RGPD</SectionHeading>
                  <Text variant="meta" size="sm">
                    Copie machine-lisible pour une demande d’accès ou de portabilité. À générer
                    avant tout effacement. La génération est journalisée.
                  </Text>
                  <AdminUserExportDialog userId={user.person.id} email={email} />
                </Card>
                <Card variant="panel" className="flex flex-col gap-3">
                  <SectionHeading as="h2">Effacement</SectionHeading>
                  <Text variant="meta" size="sm">
                    Pour une demande d’effacement RGPD nommée, avant la purge automatique des
                    12&nbsp;mois. Irréversible et journalisé.
                  </Text>
                  <AdminEraseDialog userId={user.person.id} email={email} onErased={onErased} />
                </Card>
              </>
            )}
          </>
        }
      />
    </div>
  );
}

/**
 * One account and everything it is linked to. For a DATA_OFFICER every load
 * writes an ADMIN_PII_VIEWED row naming both the admin and the subject; a
 * SUPPORT caller gets the redacted record and nothing is logged.
 */
export function AdminUserDetailPage() {
  const { userId = '' } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const user = useAdminUser(userId);

  return (
    <AdminQueryBranch
      query={user}
      errorTitle="Fiche indisponible"
      loadingLabel="Chargement de la fiche…"
    >
      {(data) => (
        <UserDetail
          user={data}
          onErased={() => void navigate(adminPaths.users, { replace: true })}
        />
      )}
    </AdminQueryBranch>
  );
}
