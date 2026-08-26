import { useMemo, useState, type RefObject } from 'react';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { useIsDesktopViewport } from '../../hooks/useIsDesktopViewport';
import type { ResolvedImportRow } from './resolveImportRows';

type ActionType = ResolvedImportRow['action']['type'];
type FilterValue = 'all' | 'create' | 'update' | 'conflict' | 'excluded';

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'create', label: 'Créer' },
  { value: 'update', label: 'Mettre à jour' },
  { value: 'conflict', label: 'Conflits' },
  { value: 'excluded', label: 'Ignorées' },
];

const ACTION_LABEL: Record<ActionType, string> = {
  create: 'Créer',
  update: 'Mettre à jour',
  conflict: 'Conflit',
  skip: 'Ignorée : nom manquant',
  ignored: 'Ignorée : type de licence',
};

function badgeVariant(type: ActionType): 'secondary' | 'outline' {
  return type === 'update' ? 'secondary' : 'outline';
}

function badgeClassName(type: ActionType): string | undefined {
  if (type === 'conflict') return 'border-error bg-error-tint text-error';
  if (type === 'skip' || type === 'ignored') return 'text-muted';
  return undefined;
}

function matchesFilter(filter: FilterValue, type: ActionType): boolean {
  if (filter === 'all') return true;
  if (filter === 'excluded') return type === 'skip' || type === 'ignored';
  return filter === type;
}

function countFor(filter: FilterValue, counts: Record<ActionType, number>, total: number): number {
  if (filter === 'all') return total;
  if (filter === 'excluded') return counts.skip + counts.ignored;
  return counts[filter];
}

export function PlayerImportPreviewStep({
  resolvedRows,
  isSubmitting,
  headingRef,
  onBack,
  onConfirm,
}: {
  resolvedRows: ResolvedImportRow[];
  isSubmitting: boolean;
  headingRef: RefObject<HTMLHeadingElement>;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const isDesktop = useIsDesktopViewport();
  const [filter, setFilter] = useState<FilterValue>('all');

  const counts = useMemo(
    () =>
      resolvedRows.reduce(
        (acc, { action }) => {
          acc[action.type]++;
          return acc;
        },
        { create: 0, update: 0, conflict: 0, skip: 0, ignored: 0 },
      ),
    [resolvedRows],
  );
  const committable = counts.create + counts.update;
  const excluded = counts.skip + counts.ignored;

  const filteredRows = useMemo(
    () => resolvedRows.filter(({ action }) => matchesFilter(filter, action.type)),
    [resolvedRows, filter],
  );

  const heading = (
    <h2
      ref={headingRef}
      tabIndex={-1}
      className="font-heading text-2xl font-bold text-charcoal outline-none"
    >
      Vérifier et confirmer
    </h2>
  );

  if (resolvedRows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {heading}
        <EmptyState
          title="Fichier vide"
          description="Le fichier ne contient aucune ligne de données après l'en-tête. Revenez à l'étape précédente pour vérifier le fichier ou le mappage."
          action={
            <Button variant="outline" onClick={onBack}>
              Retour
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {heading}

      <p aria-live="polite" className="text-sm text-muted">
        {counts.create} création{counts.create !== 1 ? 's' : ''}, {counts.update} mise
        {counts.update !== 1 ? 's' : ''} à jour, {counts.conflict} conflit
        {counts.conflict !== 1 ? 's' : ''}, {excluded} ligne{excluded !== 1 ? 's' : ''} ignorée
        {excluded !== 1 ? 's' : ''}.
      </p>

      {committable === 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            Aucune ligne ne sera importée avec le mappage actuel. Revenez à l&apos;étape
            précédente pour l&apos;ajuster, ou vérifiez les conflits ci-dessous.
          </AlertDescription>
        </Alert>
      )}

      <div
        role="group"
        aria-label="Filtrer l'aperçu"
        className="flex w-fit flex-wrap overflow-hidden rounded-md border border-border bg-sunk"
      >
        {FILTERS.map((option, index) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              'min-h-9 whitespace-nowrap px-3 text-sm font-medium transition-colors',
              focusRing,
              index > 0 && 'border-l border-border-strong',
              filter === option.value
                ? 'bg-blue-green text-cream shadow-segment-active'
                : 'bg-surface text-muted hover:bg-sunk',
            )}
          >
            {option.label} ({countFor(option.value, counts, resolvedRows.length)})
          </button>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <p className="text-sm text-muted">Aucune ligne ne correspond à ce filtre.</p>
      ) : isDesktop ? (
        <Table containerClassName="max-h-96 overflow-y-auto rounded-lg border border-border">
          <TableHeader className="sticky top-0 z-10 bg-surface">
            <TableRow>
              <TableHead>Prénom</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map(({ row, action }, index) => (
              <TableRow key={index}>
                <TableCell>{row.firstName || '—'}</TableCell>
                <TableCell>{row.lastName || '—'}</TableCell>
                <TableCell>
                  <Badge variant={badgeVariant(action.type)} className={badgeClassName(action.type)}>
                    {ACTION_LABEL[action.type]}
                  </Badge>
                  {action.type === 'conflict' && (
                    <span className="ml-2 text-xs text-muted">déjà licencié dans un autre club</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {filteredRows.map(({ row, action }, index) => (
            <Card key={index} className="flex flex-col gap-1.5 bg-surface-2 p-3">
              <span className="font-medium text-charcoal">
                {row.firstName || '—'} {row.lastName || '—'}
              </span>
              <div>
                <Badge variant={badgeVariant(action.type)} className={badgeClassName(action.type)}>
                  {ACTION_LABEL[action.type]}
                </Badge>
              </div>
              {action.type === 'conflict' && (
                <span className="text-xs text-muted">déjà licencié dans un autre club</span>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={onBack}>
          Retour
        </Button>
        <Button type="button" disabled={committable === 0} loading={isSubmitting} onClick={onConfirm}>
          Importer {committable} joueur{committable !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}
