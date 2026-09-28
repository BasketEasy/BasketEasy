import { Link, useParams } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Text } from '@basketeasy/ui/text';
import type { AdminPlayerDetail } from '@basketeasy/types/platform-admin-browse';
import { teamGenderLabel, teamMemberRoleLabel } from '../clubs/teamLabels';
import { useAdminPlayer } from './useAdminQueries';
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
  CONSENT_SOURCE_LABELS,
  CONSENT_STATE_LABELS,
  CONSENT_STATE_TONES,
  INVITE_STATE_LABELS,
  INVITE_STATE_TONES,
  formatAdminDate,
} from './shared/adminFormat';

function PlayerDetail({ player }: { player: AdminPlayerDetail }) {
  const { session } = usePlatformSession();
  const isDataOfficer = session?.role === 'DATA_OFFICER';
  const invites = [
    ...(player.playerInvite ? [{ id: 'player', kind: 'Joueur', ...player.playerInvite }] : []),
    ...player.guardianInvites.map((invite) => ({ ...invite, kind: 'Parent' })),
  ];
  // Birth date and licence are DATA_OFFICER-only; the server sends null to
  // SUPPORT, which reads "masqué" here rather than "unknown".
  const restricted = (value: string | null) =>
    value ?? (isDataOfficer ? '—' : 'Masqué (profil support)');

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={player.person.displayName}
        parent={{ to: adminPaths.players, label: 'Joueurs' }}
        badges={
          <>
            {player.person.redacted && (
              <Badge variant="outline" tone="muted">
                masqué
              </Badge>
            )}
            {player.isMinor && (
              <Badge variant="soft" tone="muted">
                Mineur
              </Badge>
            )}
            <Badge variant="soft" tone={CONSENT_STATE_TONES[player.consentState]}>
              {CONSENT_STATE_LABELS[player.consentState]}
            </Badge>
            {!player.linkedUser && (
              <Badge variant="soft" tone="muted">
                Sans compte
              </Badge>
            )}
            {isDataOfficer && (
              <Text as="span" variant="meta" size="sm">
                Consultation journalisée
              </Text>
            )}
          </>
        }
        actions={
          isDataOfficer && (
            <Button variant="outline" asChild>
              <Link to={`${adminPaths.auditLog}?playerId=${player.person.id}`}>
                Journal d’audit de ce joueur
              </Link>
            </Button>
          )
        }
      />

      <AdminTwoColumn
        main={
          <>
            <AdminSection title="Équipes" count={player.teams.length}>
              <AdminLinkedList
                empty="Inscrit dans aucune équipe."
                items={player.teams.map((entry) => ({
                  key: entry.teamPlayerId,
                  primary: <AdminTeamLink team={entry.team} />,
                  trailing: (
                    <Badge variant="soft" tone={entry.role === 'COACH' ? 'brand' : 'muted'}>
                      {teamMemberRoleLabel(entry.role)}
                    </Badge>
                  ),
                }))}
              />
            </AdminSection>

            <AdminSection title="Parents" count={player.guardians.length}>
              <AdminLinkedList
                empty="Aucun parent lié."
                items={player.guardians.map((guardian) => ({
                  key: guardian.person.id,
                  primary: <AdminPersonLink person={guardian.person} withContact />,
                  secondary: `Lié le ${formatAdminDate(guardian.linkedAt)}`,
                }))}
              />
            </AdminSection>

            <AdminSection title="Invitations" count={invites.length}>
              <AdminLinkedList
                empty="Aucune invitation envoyée."
                items={invites.map((invite) => ({
                  key: invite.id,
                  primary: <Text as="span">{invite.kind}</Text>,
                  secondary: `Créée le ${formatAdminDate(invite.createdAt)} · expire le ${formatAdminDate(invite.expiresAt)}`,
                  trailing: (
                    <Badge variant="soft" tone={INVITE_STATE_TONES[invite.state]}>
                      {INVITE_STATE_LABELS[invite.state]}
                    </Badge>
                  ),
                }))}
              />
            </AdminSection>

            <AdminSection title="Autorisations parentales" count={player.consents.length}>
              <AdminLinkedList
                empty="Aucune autorisation enregistrée."
                items={player.consents.map((consent) => ({
                  key: consent.id,
                  primary: <Text as="span">{consent.attestedBy}</Text>,
                  secondary: formatAdminDate(consent.consentGivenAt),
                  trailing: (
                    <Badge variant="soft" tone="structure">
                      {CONSENT_SOURCE_LABELS[consent.source]}
                    </Badge>
                  ),
                }))}
              />
            </AdminSection>
          </>
        }
        aside={
          <AdminFacts
            facts={[
              { label: 'Club', value: <AdminClubLink club={player.club} /> },
              {
                label: 'Compte lié',
                value: player.linkedUser ? (
                  <AdminPersonLink person={player.linkedUser} withContact />
                ) : (
                  <Text variant="meta">Aucun</Text>
                ),
              },
              {
                label: 'Date de naissance',
                value: (
                  <Text className="tabular">
                    {restricted(player.birthDate ? formatAdminDate(player.birthDate) : null)}
                  </Text>
                ),
              },
              {
                label: 'Licence',
                value: <Text className="tabular">{restricted(player.licenseNumber)}</Text>,
              },
              {
                label: 'Genre',
                value: <Text>{player.gender ? teamGenderLabel(player.gender) : '—'}</Text>,
              },
              {
                label: 'Fiche créée le',
                value: <Text className="tabular">{formatAdminDate(player.createdAt)}</Text>,
              },
            ]}
          />
        }
      />
    </div>
  );
}

/** Same audit rule as the user page: a DATA_OFFICER's load is logged. */
export function AdminPlayerDetailPage() {
  const { playerId = '' } = useParams<{ playerId: string }>();
  const player = useAdminPlayer(playerId);

  return (
    <AdminQueryBranch
      query={player}
      errorTitle="Fiche indisponible"
      loadingLabel="Chargement de la fiche…"
    >
      {(data) => <PlayerDetail player={data} />}
    </AdminQueryBranch>
  );
}
