import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import { useTableLayout } from '@basketeasy/ui/responsive-table';
import { Text } from '@basketeasy/ui/text';
import type { ClubRole } from '@basketeasy/types/club-members';
import type { AuditEventType, AuditLogEntry } from '@basketeasy/types/platform-admin';
import {
  ADMIN_SUPPORT_ACTION_KINDS,
  type AdminSupportActionKind,
} from '@basketeasy/types/platform-admin-actions';
import { useAdminAuditLog } from './useAdminQueries';
import { useAdminListParams } from './shared/useAdminListParams';
import { AdminPageHeader, AdminPagination, AdminTable } from './shared/AdminLayout';
import { AdminLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';
import { adminPaths } from './shared/adminPaths';
import { AdminFilterBar, AdminSelectFilter } from './shared/AdminFilters';
import {
  CLUB_ROLE_LABELS,
  SCORESHEET_STATUS_LABELS,
  SUPPORT_ACTION_LABELS,
  formatAdminDateTime,
} from './shared/adminFormat';

const FILTER_KEYS = ['userId', 'playerId', 'action'] as const;

const ACTION_OPTIONS = ADMIN_SUPPORT_ACTION_KINDS.map((kind) => ({
  value: kind,
  label: SUPPORT_ACTION_LABELS[kind],
}));

const TYPE_LABELS: Record<AuditEventType, string> = {
  LOGIN_SUCCESS: 'Connexion',
  LOGIN_FAILURE: 'Connexion refusée',
  LOGOUT: 'Déconnexion',
  PASSWORD_RESET_REQUESTED: 'Réinitialisation demandée',
  PASSWORD_RESET_COMPLETED: 'Mot de passe réinitialisé',
  REFRESH_TOKEN_REUSE_DETECTED: 'Réutilisation de session détectée',
  EMAIL_VERIFIED: 'Adresse vérifiée',
  GUARDIAN_INVITE_ACCEPTED: 'Invitation parent acceptée',
  GUARDIAN_INVITE_CREATED: 'Invitation parent créée',
  GUARDIAN_INVITE_CANCELLED: 'Invitation parent annulée',
  GUARDIAN_LINK_REMOVED: 'Lien parent retiré',
  ADMIN_LOGIN_SUCCESS: 'Accès back-office',
  ADMIN_LOGIN_FAILURE: 'Accès back-office refusé',
  ADMIN_PII_VIEWED: 'Fiche consultée',
  ADMIN_PII_LISTED: 'Liste consultée',
  ADMIN_USER_ERASED: 'Compte effacé',
  ADMIN_EXPORT_GENERATED: 'Export RGPD généré',
  ADMIN_SUPPORT_ACTION: 'Action support',
  ADMIN_IMPERSONATION_STARTED: 'Consultation en tant que',
  ADMIN_IMPERSONATION_ENDED: 'Fin de consultation',
  ADMIN_GRANT_CHANGED: 'Accès back-office modifié',
};

function metadataString(entry: AuditLogEntry, key: string): string | null {
  const value = entry.metadata?.[key];
  return typeof value === 'string' ? value : null;
}

function supportAction(entry: AuditLogEntry): AdminSupportActionKind | null {
  const action = metadataString(entry, 'action');
  return action && (ADMIN_SUPPORT_ACTION_KINDS as readonly string[]).includes(action)
    ? (action as AdminSupportActionKind)
    : null;
}

function metadataRecord(entry: AuditLogEntry, key: string): Record<string, unknown> | null {
  const value = entry.metadata?.[key];
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function isClubRole(value: unknown): value is ClubRole {
  return value === 'ADMIN' || value === 'MEMBER';
}

/** What a support action changed, from its `before`/`after`, in one line. */
function changeSummary(entry: AuditLogEntry): string | null {
  const before = metadataRecord(entry, 'before');
  const after = metadataRecord(entry, 'after');
  if (isClubRole(before?.role) && isClubRole(after?.role)) {
    return `${CLUB_ROLE_LABELS[before.role]} → ${CLUB_ROLE_LABELS[after.role]}`;
  }
  if (isClubRole(before?.role)) return `Était ${CLUB_ROLE_LABELS[before.role]}`;
  if (typeof after?.revokedSessions === 'number') {
    const count = after.revokedSessions;
    return `${count} session${count > 1 ? 's' : ''} fermée${count > 1 ? 's' : ''}`;
  }
  const status = before?.status;
  if (typeof status === 'string' && status in SCORESHEET_STATUS_LABELS) {
    return `Était ${SCORESHEET_STATUS_LABELS[status as keyof typeof SCORESHEET_STATUS_LABELS]}`;
  }
  return null;
}

/** Who or what the row is about: the records named in its metadata. */
function Subject({ entry }: { entry: AuditLogEntry }) {
  const subjectUserId = metadataString(entry, 'subjectUserId');
  const subjectPlayerId = metadataString(entry, 'subjectPlayerId');
  const clubId = metadataString(entry, 'clubId');
  const teamId = metadataString(entry, 'teamId');
  const eventId = metadataString(entry, 'eventId');
  const previousOwner = metadataRecord(entry, 'before')?.ownerClubId;
  if (!subjectUserId && !subjectPlayerId && !clubId && !teamId && !eventId) {
    return (
      <Text as="span" variant="meta" size="sm">
        —
      </Text>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {clubId && <AdminLink to={adminPaths.club(clubId)}>Club</AdminLink>}
      {teamId && <AdminLink to={adminPaths.team(teamId)}>Équipe</AdminLink>}
      {eventId && <AdminLink to={adminPaths.event(eventId)}>Match</AdminLink>}
      {subjectPlayerId && <AdminLink to={adminPaths.player(subjectPlayerId)}>Joueur</AdminLink>}
      {subjectUserId && <AdminLink to={adminPaths.user(subjectUserId)}>Compte</AdminLink>}
      {typeof previousOwner === 'string' && (
        <AdminLink to={adminPaths.club(previousOwner)}>Ancien propriétaire</AdminLink>
      )}
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
  const action = supportAction(entry);
  const change = changeSummary(entry);
  const type = (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="soft" tone={entry.type.startsWith('ADMIN_') ? 'brand' : 'muted'}>
        {action ? SUPPORT_ACTION_LABELS[action] : (TYPE_LABELS[entry.type] ?? entry.type)}
      </Badge>
      {change && (
        <Text as="span" variant="meta" size="xs">
          {change}
        </Text>
      )}
    </div>
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

/** A hand-edited `?action=` that isn't a known kind is dropped, not sent. */
function supportActionFilter(value: string | undefined): AdminSupportActionKind | undefined {
  return value && (ADMIN_SUPPORT_ACTION_KINDS as readonly string[]).includes(value)
    ? (value as AdminSupportActionKind)
    : undefined;
}

/**
 * « Who accessed this person's data ». DATA_OFFICER-only on the server; the
 * nav hides it from SUPPORT, and a SUPPORT caller who types the URL gets the
 * error branch from the 403.
 */
export function AdminAuditLogPage() {
  const { filters, page, setFilters, setPage, pageSize } = useAdminListParams(FILTER_KEYS);
  const log = useAdminAuditLog({
    userId: filters.userId,
    playerId: filters.playerId,
    action: supportActionFilter(filters.action),
    page,
    pageSize,
  });
  const scoped = filters.userId ?? filters.playerId;
  const action = supportActionFilter(filters.action);

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Journal d’audit"
        subtitle="Connexions, consultations et actions du back-office, conservées 12 mois."
      />
      <AdminFilterBar>
        <AdminSelectFilter
          label="Action"
          allLabel="Tous les événements"
          options={ACTION_OPTIONS}
          value={action}
          onChange={(next) => setFilters({ action: next })}
        />
      </AdminFilterBar>
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
