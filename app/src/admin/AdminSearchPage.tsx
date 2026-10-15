import { useSearchParams } from 'react-router-dom';
import { Card } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { Text } from '@basketeasy/ui/text';
import {
  ADMIN_SEARCH_MIN_LENGTH,
  type AdminSearchHit,
  type AdminSearchResult,
} from '@basketeasy/types/platform-admin-search';
import { useAdminSearch } from './useAdminQueries';
import { usePlatformSession } from './platformSession';
import { AdminLinkedList, AdminPageHeader, AdminSection } from './shared/AdminLayout';
import { AdminLink } from './shared/AdminLinks';
import { AdminQueryBranch } from './shared/AdminQueryBranch';
import { adminPathOf, adminPaths } from './shared/adminPaths';
import { SEARCH_GROUPS } from './shared/adminFormat';

/** Where each group's full, filterable list lives; `q` is the same filter. */
const LIST_PATHS: Record<(typeof SEARCH_GROUPS)[number]['kind'], string> = {
  user: adminPaths.users,
  player: adminPaths.players,
  club: adminPaths.clubs,
  team: adminPaths.teams,
};

function hitItems(hits: AdminSearchHit[]) {
  return hits.map((hit) => ({
    key: hit.id,
    primary: <AdminLink to={adminPathOf(hit)}>{hit.label}</AdminLink>,
    trailing: hit.sublabel && (
      <Text as="span" variant="meta" size="sm">
        {hit.sublabel}
      </Text>
    ),
  }));
}

function Results({ result, isDataOfficer }: { result: AdminSearchResult; isDataOfficer: boolean }) {
  if (result.exactId) {
    return (
      <AdminSection title="Identifiant reconnu">
        <AdminLinkedList empty="" items={hitItems([result.exactId])} />
      </AdminSection>
    );
  }

  if (result.unknownId) {
    return (
      <Card variant="panel" className="flex flex-col gap-2">
        <Text variant="label">
          Aucun club, équipe, compte, joueur ou événement avec cet identifiant
        </Text>
        <Text variant="meta" size="sm">
          Il a peut-être été supprimé : un compte effacé ne laisse que ses traces dans le journal
          d’audit.
        </Text>
        {isDataOfficer && (
          <AdminLink to={`${adminPaths.auditLog}?userId=${encodeURIComponent(result.query)}`}>
            Chercher cet identifiant dans le journal d’audit
          </AdminLink>
        )}
      </Card>
    );
  }

  const total = SEARCH_GROUPS.reduce((sum, group) => sum + result.groups[group.kind].length, 0);
  if (total === 0) {
    return (
      <EmptyState
        title={`Aucun résultat pour « ${result.query} »`}
        description={
          isDataOfficer
            ? 'Essayez un nom de club, le nom ou l’e-mail d’une personne, ou collez un identifiant.'
            : 'Profil support : les personnes se trouvent par leur adresse e-mail complète, pas par leur nom.'
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {SEARCH_GROUPS.map((group) => {
        const hits = result.groups[group.kind];
        return (
          <AdminSection key={group.kind} title={group.label} count={hits.length}>
            <AdminLinkedList
              empty={`Aucun résultat parmi les ${group.label.toLowerCase()}.`}
              items={hitItems(hits)}
            />
            {hits.length > 0 && (
              <div>
                <AdminLink to={`${LIST_PATHS[group.kind]}?q=${encodeURIComponent(result.query)}`}>
                  Ouvrir dans la liste des {group.label.toLowerCase()}
                </AdminLink>
              </div>
            )}
          </AdminSection>
        );
      })}
    </div>
  );
}

/** `/admin/search?q=`: every group in full view, each linking to its filterable list. */
export function AdminSearchPage() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q')?.trim() ?? '';
  const { session } = usePlatformSession();
  const search = useAdminSearch(q);

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Recherche"
        subtitle={q ? `« ${q} » · 5 résultats au plus par catégorie` : undefined}
      />
      {q.length < ADMIN_SEARCH_MIN_LENGTH ? (
        <Text variant="meta">Saisissez au moins deux caractères dans la recherche.</Text>
      ) : (
        <AdminQueryBranch query={search} loadingLabel="Recherche…">
          {(result) => <Results result={result} isDataOfficer={session?.role === 'DATA_OFFICER'} />}
        </AdminQueryBranch>
      )}
    </div>
  );
}
