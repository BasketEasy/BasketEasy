import { useState } from 'react';
import { FormProvider, useFieldArray, useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Avatar, AvatarFallback } from '@basketeasy/ui/avatar';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@basketeasy/ui/dialog';
import { FieldError } from '@basketeasy/ui/field-error';
import { FormField } from '@basketeasy/ui/form-field';
import { ChevronDownIcon } from '@basketeasy/ui/icons/chevron-down';
import { PlusIcon } from '@basketeasy/ui/icons/plus';
import { TrashIcon } from '@basketeasy/ui/icons/trash';
import { Input } from '@basketeasy/ui/input';
import { QueryError } from '@basketeasy/ui/query-error';
import { ResponsiveTable, useTableLayout } from '@basketeasy/ui/responsive-table';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SelectField } from '@basketeasy/ui/select-field';
import { SkeletonList } from '@basketeasy/ui/skeleton';
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
import { useIsDesktopViewport } from '@basketeasy/ui/use-is-desktop-viewport';
import { MAX_MATCH_PERIODS, type MatchStats } from '@basketeasy/types/team-stats';
import type { TeamEvent } from '@basketeasy/types/events';
import { ApiError } from '../api/client';
import { getClubErrorMessage } from './clubErrorMessages';
import { getInitials } from './getInitials';
import {
  emptyLine,
  matchStatsEditSchema,
  scoreGap,
  toFormValues,
  toRequest,
  type MatchStatsEditValues,
} from './matchStatsEditForm';
import { useMatchStats } from './useMatchStats';
import { useTeamPlayerList } from './useTeamPlayerList';
import { useUpdateMatchStats } from './useUpdateMatchStats';

// Well past any real roster, so « Ajouter un joueur » offers the whole squad:
// the same reasoning ScoresheetExtractionCard's mapping uses.
const ROSTER_PAGE_SIZE = 100;
const REGULATION_PERIODS = 4;

type Splits = { split?: { message?: string } };

// A refusal the server worded for this route (400, 409) is shown as it is; the
// shared table words 409 for club membership and would mislead here.
function updateErrorMessage(err: unknown): string {
  return err instanceof ApiError && (err.status === 400 || err.status === 409)
    ? err.message
    : getClubErrorMessage(err);
}

function periodLabel(index: number): string {
  return index < REGULATION_PERIODS ? `QT ${index + 1}` : `PROL ${index - REGULATION_PERIODS + 1}`;
}

function useLineErrors(index: number) {
  const {
    formState: { errors },
  } = useFormContext<MatchStatsEditValues>();
  const lineErrors = errors.lines?.[index];
  return {
    jerseyNumber: lineErrors?.jerseyNumber?.message,
    points: lineErrors?.points?.message,
    fouls: lineErrors?.fouls?.message,
    freeThrowPoints: lineErrors?.freeThrowPoints?.message,
    twoPointPoints: lineErrors?.twoPointPoints?.message,
    threePointPoints: lineErrors?.threePointPoints?.message,
    split: (lineErrors as Splits | undefined)?.split?.message,
  };
}

/**
 * One player's line: a table row on desktop, a card below it
 * (responsive-table convention), one set of fields and one set of rules. The
 * 3 PTS / 2 PTS / LF split is folded behind « Détail par panier » on a phone
 * and stays open when it holds an error.
 */
function MatchStatsEditRow({
  index,
  name,
  onRemove,
}: {
  index: number;
  name: string;
  onRemove: () => void;
}) {
  const layout = useTableLayout();
  const { register } = useFormContext<MatchStatsEditValues>();
  const [splitOpen, setSplitOpen] = useState(false);
  const errors = useLineErrors(index);
  const [firstName = '', lastName = ''] = name.split(' ');
  const prefix = `lines.${index}` as const;
  const label = (field: string) => `${field} ${name}`;
  const removeButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Retirer ${name} du match`}
      onClick={onRemove}
    >
      <TrashIcon size="md" />
    </Button>
  );
  const identity = (
    <>
      <Avatar size="sm">
        <AvatarFallback>{getInitials(firstName, lastName)}</AvatarFallback>
      </Avatar>
      <Text as="span" variant="label" size="sm" className="whitespace-nowrap">
        {name}
      </Text>
    </>
  );
  const rowError = errors.split ?? errors.jerseyNumber;

  if (layout === 'card') {
    const showSplit = splitOpen || !!errors.split;
    return (
      <Card variant="inset" className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex min-w-0 flex-1 items-center gap-2.5">{identity}</span>
          {removeButton}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <FormField
            label="N°"
            aria-label={label('N°')}
            inputMode="numeric"
            error={errors.jerseyNumber}
            {...register(`${prefix}.jerseyNumber`)}
          />
          <FormField
            label="PTS"
            aria-label={label('PTS')}
            inputMode="numeric"
            error={errors.points}
            {...register(`${prefix}.points`)}
          />
          <FormField
            label="Fautes"
            aria-label={label('Fautes')}
            inputMode="numeric"
            error={errors.fouls}
            {...register(`${prefix}.fouls`)}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          aria-expanded={showSplit}
          onClick={() => setSplitOpen((current) => !current)}
        >
          <ChevronDownIcon size="md" className={showSplit ? 'rotate-180' : undefined} />
          Détail par panier
        </Button>
        {showSplit && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2.5">
              <FormField
                label="3 PTS"
                aria-label={label('3 PTS')}
                inputMode="numeric"
                error={errors.threePointPoints}
                {...register(`${prefix}.threePointPoints`)}
              />
              <FormField
                label="2 PTS"
                aria-label={label('2 PTS')}
                inputMode="numeric"
                error={errors.twoPointPoints}
                {...register(`${prefix}.twoPointPoints`)}
              />
              <FormField
                label="LF"
                aria-label={label('LF')}
                inputMode="numeric"
                error={errors.freeThrowPoints}
                {...register(`${prefix}.freeThrowPoints`)}
              />
            </div>
            {errors.split && <FieldError>{errors.split}</FieldError>}
          </div>
        )}
      </Card>
    );
  }

  const cell = (
    field:
      | 'jerseyNumber'
      | 'points'
      | 'fouls'
      | 'threePointPoints'
      | 'twoPointPoints'
      | 'freeThrowPoints',
    title: string,
  ) => (
    <TableCell className="p-1">
      <Input
        aria-label={label(title)}
        aria-invalid={!!errors[field] || (field === 'freeThrowPoints' && !!errors.split)}
        inputMode="numeric"
        className="text-center tabular"
        {...register(`${prefix}.${field}`)}
      />
    </TableCell>
  );
  return (
    <>
      <TableRow>
        <TableCell>
          <span className="flex items-center gap-2.5">{identity}</span>
        </TableCell>
        {cell('jerseyNumber', 'N°')}
        {cell('points', 'PTS')}
        {cell('fouls', 'Fautes')}
        {cell('threePointPoints', '3 PTS')}
        {cell('twoPointPoints', '2 PTS')}
        {cell('freeThrowPoints', 'LF')}
        <TableCell className="p-1">{removeButton}</TableCell>
      </TableRow>
      {rowError && (
        <TableRow>
          <TableCell colSpan={8} className="pt-0">
            <FieldError>{`${name} : ${rowError}`}</FieldError>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ScoreSection({ opponent }: { opponent: string }) {
  const isDesktop = useIsDesktopViewport();
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<MatchStatsEditValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'periods' });
  const extraPeriods = fields.length > REGULATION_PERIODS;

  return (
    <div className="flex flex-col gap-3">
      <SectionHeading as="h3">Score</SectionHeading>
      {isDesktop ? (
        <Table aria-label="Score par quart-temps">
          <TableHeader>
            <TableRow>
              <TableHead scope="col" />
              {fields.map((field, index) => (
                <TableHead key={field.id} scope="col" className="text-center">
                  {periodLabel(index)}
                </TableHead>
              ))}
              <TableHead scope="col" className="text-center">
                Score final
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(['ours', 'theirs'] as const).map((side) => {
              const who = side === 'ours' ? 'Nous' : opponent;
              return (
                <TableRow key={side}>
                  <TableCell>
                    <Text as="span" variant="label" size="sm">
                      {who}
                    </Text>
                  </TableCell>
                  {fields.map((field, index) => (
                    <TableCell key={field.id} className="p-1">
                      <Input
                        aria-label={`${periodLabel(index)} ${who}`}
                        aria-invalid={!!errors.periods?.[index]?.[side]}
                        inputMode="numeric"
                        className="text-center tabular"
                        {...register(`periods.${index}.${side}`)}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="p-1">
                    <Input
                      aria-label={`Score final ${who}`}
                      aria-invalid={!!errors[side === 'ours' ? 'ourScore' : 'theirScore']}
                      inputMode="numeric"
                      className="text-center tabular"
                      {...register(side === 'ours' ? 'ourScore' : 'theirScore')}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <>
          <div className="grid grid-cols-2 items-end gap-3">
            <FormField
              label="Nous"
              inputMode="numeric"
              error={errors.ourScore?.message}
              {...register('ourScore')}
            />
            <FormField
              label={opponent}
              aria-label={`Score ${opponent}`}
              inputMode="numeric"
              error={errors.theirScore?.message}
              {...register('theirScore')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-3">
              <Text as="span" variant="eyebrow">
                Quart
              </Text>
              <Text as="span" variant="eyebrow">
                Nous
              </Text>
              <Text as="span" variant="eyebrow">
                {opponent}
              </Text>
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-3 items-center gap-3">
                <Text as="span" variant="label" size="sm">
                  {periodLabel(index)}
                </Text>
                <Input
                  aria-label={`${periodLabel(index)} nous`}
                  aria-invalid={!!errors.periods?.[index]?.ours}
                  inputMode="numeric"
                  {...register(`periods.${index}.ours`)}
                />
                <Input
                  aria-label={`${periodLabel(index)} ${opponent}`}
                  aria-invalid={!!errors.periods?.[index]?.theirs}
                  inputMode="numeric"
                  {...register(`periods.${index}.theirs`)}
                />
              </div>
            ))}
          </div>
        </>
      )}
      {isDesktop && (errors.ourScore || errors.theirScore) && (
        <FieldError>Le score final de chaque équipe est requis (un nombre entier).</FieldError>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fields.length >= MAX_MATCH_PERIODS}
          onClick={() => append({ ours: '', theirs: '' })}
        >
          <PlusIcon size="sm" />
          Prolongation
        </Button>
        {extraPeriods && (
          <Button type="button" variant="ghost" size="sm" onClick={() => remove(fields.length - 1)}>
            Retirer {periodLabel(fields.length - 1)}
          </Button>
        )}
      </div>
    </div>
  );
}

function PlayersSection({ clubId, teamId }: { clubId: string; teamId: string }) {
  const { control } = useFormContext<MatchStatsEditValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const { data: roster } = useTeamPlayerList(clubId, teamId, { pageSize: ROSTER_PAGE_SIZE });
  const onSheet = new Set(fields.map((field) => field.teamPlayerId));
  const options = (roster?.items ?? [])
    .filter((member) => !onSheet.has(member.id))
    .map((member) => ({ value: member.id, label: `${member.firstName} ${member.lastName}` }));

  return (
    <div className="flex flex-col gap-3">
      <SectionHeading as="h3">Joueurs</SectionHeading>
      {fields.length > 0 && (
        <ResponsiveTable columns={['Joueur', 'N°', 'PTS', 'Fautes', '3 PTS', '2 PTS', 'LF', '']}>
          {fields.map((field, index) => (
            <MatchStatsEditRow
              key={field.id}
              index={index}
              name={field.name}
              onRemove={() => remove(index)}
            />
          ))}
        </ResponsiveTable>
      )}
      <SelectField
        label="Ajouter un joueur"
        placeholder="Choisir dans l'effectif"
        options={options}
        disabled={options.length === 0}
        // Always empty: choosing a player adds a line rather than holding a value.
        value=""
        onValueChange={(teamPlayerId) => {
          const member = roster?.items.find((candidate) => candidate.id === teamPlayerId);
          if (member) {
            append(
              emptyLine(
                member.id,
                `${member.firstName} ${member.lastName.charAt(0).toUpperCase()}.`,
              ),
            );
          }
        }}
      />
    </div>
  );
}

function MatchStatsEditForm({
  clubId,
  teamId,
  event,
  stats,
  onDone,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  stats: MatchStats;
  onDone: () => void;
}) {
  const { mutateAsync: save, isPending } = useUpdateMatchStats(clubId, teamId, event.id);
  const form = useForm<MatchStatsEditValues>({
    resolver: zodResolver(matchStatsEditSchema),
    defaultValues: toFormValues(stats),
  });
  const {
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = form;
  const gap = scoreGap(watch());

  const onSubmit = async (values: MatchStatsEditValues) => {
    try {
      await save(toRequest(values));
      toast({ variant: 'success', title: 'Stats du match enregistrées' });
      onDone();
    } catch (err) {
      setError('root', { message: updateErrorMessage(err) });
    }
  };

  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={(e) => {
          void handleSubmit(onSubmit)(e);
        }}
        className="flex flex-col gap-5"
      >
        {errors.root?.message && (
          <Alert variant="destructive">
            <AlertDescription>{errors.root.message}</AlertDescription>
          </Alert>
        )}
        <ScoreSection opponent={event.opponentName ?? 'Adversaire'} />
        <PlayersSection clubId={clubId} teamId={teamId} />
        {gap && (
          // Not an error: a licensed guest has no line, so the players' total
          // can honestly fall short of the score.
          <Card variant="inset" tone="accent" role="status" className="flex flex-col gap-0.5">
            <Text variant="label" size="sm" tone="accent">
              Écart avec le score
            </Text>
            <Text variant="body" size="sm" tone="accent">
              Total des joueurs : {gap.playersTotal} pts. Score du match : {gap.ourScore}. Un invité
              ou un joueur non listé ? Vous pouvez enregistrer ainsi.
            </Text>
          </Card>
        )}
        <div className="sticky -bottom-6 -mx-6 -mb-6 flex gap-3 border-t border-border bg-surface px-6 pb-5 pt-3 md:justify-end">
          <Button type="button" variant="outline" className="flex-1 md:flex-none" onClick={onDone}>
            Annuler
          </Button>
          <Button type="submit" className="flex-1 md:flex-none" loading={isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

/**
 * A manager's correction of a played match, or its first entry when no sheet
 * was ever confirmed: the score, the periods and every player's line in one
 * focused edit. The form is mounted only once the stats are loaded and
 * remounted with every open, so it always starts from what is stored.
 */
export function MatchStatsEditDialog({
  clubId,
  teamId,
  event,
  open,
  onOpenChange,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isError, refetch, isRefetching } = useMatchStats(clubId, teamId, event.id, {
    enabled: open,
  });
  const isEntry = data !== undefined && data.scoreboard === null && !data.hasStats;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-4xl">
        <DialogHeader className="mb-5">
          <DialogTitle>{isEntry ? 'Saisir les stats' : 'Modifier les stats'}</DialogTitle>
          <DialogDescription>
            {isEntry
              ? 'Saisissez le score et les lignes des joueurs de ce match.'
              : "Corrigez le score et les lignes des joueurs. La feuille de match d'origine n'est pas modifiée."}
          </DialogDescription>
        </DialogHeader>
        {isError ? (
          <QueryError onRetry={() => refetch()} isRetrying={isRefetching} />
        ) : data ? (
          <MatchStatsEditForm
            clubId={clubId}
            teamId={teamId}
            event={event}
            stats={data}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <SkeletonList rows={3} variant="card" />
        )}
      </DialogContent>
    </Dialog>
  );
}
