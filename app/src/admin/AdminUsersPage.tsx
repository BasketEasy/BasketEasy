import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { Card, CardContent } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { Loader } from '@basketeasy/ui/loader';
import { Pagination } from '@basketeasy/ui/pagination';
import { QueryError } from '@basketeasy/ui/query-error';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@basketeasy/ui/table';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { usePlatformUsers } from './useAdminQueries';

const PAGE_SIZE = 25;

function formatLastActive(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    dateStyle: 'medium',
    timeZone: 'Europe/Paris',
  });
}

/**
 * The redacted list. No address, no name — only the e-mail domain, the last
 * activity date and how many clubs the account belongs to.
 *
 * That is not squeamishness: opening one record writes an ADMIN_PII_VIEWED
 * row naming the subject, and a list view that already showed who these
 * people are would make that audit trail a lie.
 */
export function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = usePlatformUsers({
    inactiveSoon: 'true',
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading count={data?.total}>Comptes inactifs</SectionHeading>
      <Text variant="meta">
        Comptes sans activité depuis 11&nbsp;mois ou plus. La purge automatique les supprime à
        12&nbsp;mois. Ouvrir une fiche est une consultation journalisée.
      </Text>

      {isError ? (
        <QueryError onRetry={() => void refetch()} isRetrying={isFetching} />
      ) : isLoading ? (
        <Loader>Chargement des comptes…</Loader>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title="Aucun compte concerné"
          description="Aucun compte n’approche du seuil d’inactivité de 12 mois."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Card variant="panel">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domaine</TableHead>
                    <TableHead>Dernière activité</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Clubs</TableHead>
                    <TableHead>
                      <span className="sr-only">Fiche</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((user) => (
                    <TableRow key={user.person.id}>
                      <TableCell>
                        <Text variant="label">{user.person.emailDomain}</Text>
                      </TableCell>
                      <TableCell className="tabular whitespace-nowrap">
                        {formatLastActive(user.lastActiveAt)}
                      </TableCell>
                      <TableCell>
                        {user.daysUntilErasure < 0 ? (
                          <Badge variant="soft" tone="danger" size="sm">
                            Dépassée
                          </Badge>
                        ) : (
                          <Badge variant="soft" tone="muted" size="sm">
                            <span className="tabular">{user.daysUntilErasure}</span>&nbsp;j
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular">{user.clubCount}</TableCell>
                      <TableCell>
                        <TextLink asChild>
                          <Link to={`/admin/users/${user.person.id}`}>Ouvrir la fiche</Link>
                        </TextLink>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data && data.total > PAGE_SIZE && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data.total}
              onPageChange={setPage}
            />
          )}
        </div>
      )}
    </div>
  );
}
