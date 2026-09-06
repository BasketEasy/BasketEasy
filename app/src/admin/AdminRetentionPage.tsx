import { Button } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { Badge } from '@basketeasy/ui/badge';
import { Loader } from '@basketeasy/ui/loader';
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
import { toast } from '@basketeasy/ui/toast-store';
import type { RetentionRunSummary } from '@basketeasy/types/platform-admin';
import { useRetentionRuns } from './useAdminQueries';
import { useRetentionDryRun } from './useAdminMutations';
import { usePlatformSession } from './platformSession';

const STEP_LABELS: Record<string, string> = {
  'inactive-accounts': 'Comptes inactifs',
  'audit-logs': 'Journaux de sécurité',
};

function formatRanAt(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  });
}

function stepsLabel(run: RetentionRunSummary): string {
  if (run.steps.length === 0) return '—';
  return run.steps
    .map((step) => `${STEP_LABELS[step.step] ?? step.step} : ${step.error ? 'échec' : step.count}`)
    .join(' · ');
}

/**
 * The evidence that the retention policy actually executes — which is itself
 * part of RGPD accountability (art. 5.2), not just an operator convenience.
 */
export function AdminRetentionPage() {
  const { session } = usePlatformSession();
  const { data, isLoading, isError, refetch, isFetching } = useRetentionRuns();
  const { mutate: runDryRun, isPending } = useRetentionDryRun();

  const canTriggerDryRun = session?.role === 'DATA_OFFICER';

  const onDryRun = () => {
    runDryRun(undefined, {
      onSuccess: (run) =>
        toast({
          variant: 'success',
          title: 'Simulation enregistrée',
          description: stepsLabel(run),
        }),
      onError: () =>
        toast({
          variant: 'destructive',
          title: 'La simulation a échoué',
          description: 'Aucune purge n’a été déclenchée.',
        }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <SectionHeading className="min-w-0 flex-1">Purges de données</SectionHeading>
        {canTriggerDryRun && (
          <Button size="sm" className="shrink-0 self-start" disabled={isPending} onClick={onDryRun}>
            {isPending ? 'Simulation…' : 'Lancer une simulation'}
          </Button>
        )}
      </div>

      {isError ? (
        <QueryError onRetry={() => void refetch()} isRetrying={isFetching} />
      ) : isLoading ? (
        <Loader>Chargement des purges…</Loader>
      ) : data && data.length === 0 ? (
        <EmptyState
          title="Aucune purge enregistrée"
          description="La purge nocturne n’a pas encore tourné sur ce déploiement."
        />
      ) : (
        <Card variant="panel">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Résultat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="tabular whitespace-nowrap">
                      {formatRanAt(run.ranAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="soft" tone={run.dryRun ? 'muted' : 'structure'} size="sm">
                        {run.dryRun ? 'Simulation' : 'Purge réelle'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Text variant="meta">{stepsLabel(run)}</Text>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
