import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import type { AuditEventType, AuditLogEntry } from '@basketeasy/types/platform-admin';
import { useAdminAuditLog } from './useAdminQueries';
import { useAdminListParams } from './shared/useAdminListParams';
import { AdminPageHeader, AdminPagination, AdminTable } from './shared/AdminLayout';
import { AdminLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';
import { adminPaths } from './shared/adminPaths';
import { formatAdminDateTime } from './shared/adminFormat';

const FILTER_KEYS = ['userId', 'playerId'] as const;

const TYPE_LABELS: Record<AuditEventType, string> = {
  LOGIN_SUCCESS: 'Connexion',
  LOGIN_FAILURE: 'Connexion refusée',
  LOGOUT: 'Déconnexion',
  PASSWORD_RESET_REQUESTED: 'Réinitialisation demandée',
  PASSWORD_RESET_COMPLETED: 'Mot de passe réinitialisé',
  REFRESH_TOKEN_REUSE_DETECTED: 'Réutilisation de session détectée',
  EMAIL_VERIFIED: 'Adresse vérifiée',
  GUARDIAN_INVITE_ACCEPTED: 'Invitation parent acceptée',
  ADMIN_LOGIN_SUCCESS: 'Accès back-office',
  ADMIN_LOGIN_FAILURE: 'Accès back-office refusé',
  ADMIN_PII_VIEWED: 'Fiche consultée',
  ADMIN_USER_ERASED: 'Compte effacé',
  ADMIN_EXPORT_GENERATED: 'Export RGPD généré',
};

function metadataString(entry: AuditLogEntry, key: string): string | null {
  const value = entry.metadata?.[key];
  return typeof value === 'string' ? value : null;
}

/** Who the row is about when an admin acted: an account, a player, or both. */
function Subject({ entry }: { entry: AuditLogEntry }) {
  const subjectUserId = metadataString(entry, 'subjectUserId');
  const subjectPlayerId = metadataString(entry, 'subjectPlayerId');
  if (!subjectUserId && !subjectPlayerId) {
    return (
      <Text as="span" variant="meta" size="sm">
        —
      </Text>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {subjectPlayerId && <AdminLink to={adminPaths.player(subjectPlayerId)}>Joueur</AdminLink>}
      {subjectUserId && <AdminLink to={adminPaths.user(subjectUserId)}>Compte</AdminLink>}
    </span>
  );
}

function Actor({ entry }: { entry: AuditLogEntry }) {
  const label = entry.actorEmail ?? 'Adresse inconnue';
  return entry.userId ? (
    <AdminLink to={adminPaths.user(entry.userId)}>{label}</AdminLink>
  ) : (
    <Text as="span" variant="meta" size="sm" className="break-all">
      {label}
    </Text>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const layout = useTableLayout();
  const reason = metadataString(entry, 'reason');
  const type = (
    <Badge variant="soft" tone={entry.type.startsWith('ADMIN_') ? 'brand' : 'muted'}>
      {TYPE_LABELS[entry.type] ?? entry.type}
    </Badge>
  );

  if (layout === 'card') {
    return (
      <Card variant="inset" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {type}
          <Text as="span" variant="meta" size="sm" className="tabular">
            {formatAdminDateTime(entry.createdAt)}
          </Text>
        </div>
        <Actor entry={entry} />
        <Subject entry={entry} />
        {reason && (
          <Text variant="meta" size="sm">
            Motif : {reason}
          </Text>
        )}
      </Card>
    );
  }

  return (
    <TableRow>
      <TableCell className="tabular whitespace-nowrap">
        {formatAdminDateTime(entry.createdAt)}
      </TableCell>
      <TableCell>{type}</TableCell>
      <TableCell>
        <Actor entry={entry} />
      </TableCell>
      <TableCell>
        <Subject entry={entry} />
      </TableCell>
      <TableCell>
        <Text variant="meta" size="sm">
          {reason ?? '—'}
        </Text>
      </TableCell>
      <TableCell className="tabular">{entry.ipAddress ?? '—'}</TableCell>
    </TableRow>
  );
}

/**
 * « Who accessed this person's data ». DATA_OFFICER-only on the server; the
 * nav hides it from SUPPORT, and a SUPPORT caller who types the URL gets the
 * error branch from the 403.
 */
export function AdminAuditLogPage() {
  const { filters, page, setFilters, setPage, pageSize } = useAdminListParams(FILTER_KEYS);
  const log = useAdminAuditLog({ ...filters, page, pageSize });
  const scoped = filters.userId ?? filters.playerId;

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Journal d’audit"
        subtitle="Connexions, consultations et actions du back-office, conservées 12 mois."
      />
      {scoped && (
        <div className="flex flex-wrap items-center gap-2">
          <Text as="span" variant="meta" size="sm">
            {filters.userId ? 'Filtré sur un compte' : 'Filtré sur un joueur'}
          </Text>
          <AdminLink
            to={filters.userId ? adminPaths.user(filters.userId) : adminPaths.player(scoped)}
          >
            Ouvrir la fiche
          </AdminLink>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters({ userId: undefined, playerId: undefined })}
          >
            Tout afficher
          </Button>
        </div>
      )}
      <AdminQueryBranch
        query={log}
        isEmpty={(data) => data.items.length === 0}
        emptyTitle="Journal vide"
        emptyDescription="Aucune entrée ne correspond."
        errorTitle="Journal indisponible"
        loadingLabel="Chargement du journal…"
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <AdminTable columns={['Date', 'Événement', 'Auteur', 'Concerne', 'Motif', 'IP']}>
              {data.items.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
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
