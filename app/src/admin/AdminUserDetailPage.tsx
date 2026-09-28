import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Card, CardContent } from '@basketeasy/ui/card';
import { Loader } from '@basketeasy/ui/loader';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import type { PlatformUserDetail } from '@basketeasy/types/platform-admin';
import { usePlatformUser } from './useAdminQueries';
import { AdminEraseDialog } from './AdminEraseDialog';
import { AdminUserExportDialog } from './AdminUserExportDialog';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  });
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <Text variant="eyebrow" size="xs" tone="secondary" className="sm:w-48 sm:shrink-0">
        {label}
      </Text>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function UserDetail({ user, onErased }: { user: PlatformUserDetail; onErased: () => void }) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-6">
      <Card variant="panel">
        <CardContent className="flex flex-col gap-3">
          <DetailRow label="Adresse e-mail">
            <Text variant="label">{user.email}</Text>
          </DetailRow>
          <DetailRow label="Nom">
            <Text>{fullName || '—'}</Text>
          </DetailRow>
          <DetailRow label="Adresse vérifiée">
            <Badge variant="soft" tone={user.emailVerified ? 'success' : 'muted'} size="sm">
              {user.emailVerified ? 'Oui' : 'Non'}
            </Badge>
          </DetailRow>
          <DetailRow label="Compte créé le">
            <Text className="tabular">{formatDate(user.createdAt)}</Text>
          </DetailRow>
          <DetailRow label="Dernière activité">
            <Text className="tabular">{formatDate(user.lastActiveAt)}</Text>
          </DetailRow>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <SectionHeading count={user.clubs.length}>Clubs</SectionHeading>
        {user.clubs.length === 0 ? (
          <Text variant="meta">Ce compte n’appartient à aucun club.</Text>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {user.clubs.map((club) => (
              <li key={club.id}>
                <Badge variant="soft" tone="structure" size="md">
                  {club.name} · {club.role === 'ADMIN' ? 'admin' : 'membre'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading count={user.linkedPlayers.length}>Fiches joueur liées</SectionHeading>
        <Text variant="meta">
          Conservées après l’effacement du compte, simplement détachées : l’historique et les
          statistiques du club restent intacts.
        </Text>
        {user.linkedPlayers.length === 0 ? (
          <Text variant="meta">Aucune fiche joueur liée.</Text>
        ) : (
          <ul className="flex flex-col gap-1">
            {user.linkedPlayers.map((player) => (
              <li key={player.id}>
                {/* Both spans: Text renders a <p> by default, which would
                    break the club name onto its own line. */}
                <Text as="span">
                  {player.firstName} {player.lastName}
                </Text>{' '}
                <Text variant="meta" as="span">
                  · {player.clubName}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Above the erase section deliberately, not for visual balance:
          erasure detaches the roster entries rather than deleting them, so
          once it has run nothing links those rows back to the person and the
          export can never be produced. It has to be generated first. */}
      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <SectionHeading>Export RGPD</SectionHeading>
        <Text variant="meta">
          Copie machine-lisible des données traitées, pour répondre à une demande d’accès ou de
          portabilité. La génération est journalisée.
        </Text>
        <div>
          <AdminUserExportDialog userId={user.id} email={user.email} />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <SectionHeading>Effacement</SectionHeading>
        <Text variant="meta">
          À utiliser pour une demande d’effacement RGPD nommée, avant que la purge automatique des
          12&nbsp;mois n’intervienne. L’action est irréversible et journalisée.
        </Text>
        <div>
          <AdminEraseDialog userId={user.id} email={user.email} onErased={onErased} />
        </div>
      </div>
    </div>
  );
}

/**
 * The one screen that shows a data subject's PII, and therefore the one whose
 * every load writes an ADMIN_PII_VIEWED row naming both the admin and the
 * subject. That is why the query behind it never refetches on window focus:
 * "who looked at this person's data" must not be padded with rows produced by
 * a tab regaining focus.
 */
export function AdminUserDetailPage() {
  const { userId = '' } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isFetching } = usePlatformUser(userId);

  return (
    <div className="flex flex-col gap-4">
      <TextLink asChild>
        <Link to="/admin/users">← Comptes inactifs</Link>
      </TextLink>

      {isError ? (
        <QueryError
          title="Fiche indisponible"
          description="Ce compte n’a pas pu être chargé. Il a peut-être déjà été effacé."
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      ) : isLoading || !data ? (
        <Loader>Chargement de la fiche…</Loader>
      ) : (
        <UserDetail user={data} onErased={() => void navigate('/admin/users', { replace: true })} />
      )}
    </div>
  );
}
