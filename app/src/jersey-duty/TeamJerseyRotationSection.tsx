import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { IconBadge } from '@basketeasy/ui/icon-badge';
import { QueryError } from '@basketeasy/ui/query-error';
import { ResponsiveTable } from '@basketeasy/ui/responsive-table';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { SkeletonList } from '@basketeasy/ui/skeleton';
import { Switch } from '@basketeasy/ui/switch';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { Controller, useForm } from 'react-hook-form';
import type { JerseyRotationOverview } from '@basketeasy/types/jersey-duty';
import { formatEventDayShort } from '../clubs/eventDateFormat';
import { JerseyIcon } from '../clubs/eventLogisticsIcons';
import { JerseyRotationRow } from './JerseyRotationRow';
import {
  emptyRosterTitle,
  exemptLabel,
  nextMatchLine,
  rosterColumnLabel,
  seasonLabel,
} from './jerseyDutyCopy';
import { useJerseyRotation } from './useJerseyDuty';
import { useJerseyRotationSwitch } from './useJerseyRotationMutations';

const ORDER_FOOTNOTE = 'Ordre de suggestion : le moins de lavages, puis le plus ancien.';

/** The manager's per-team switch: off hands the match back to « Qui apporte les maillots ? ». */
function RotationSwitchCard({
  clubId,
  teamId,
  enabled,
}: {
  clubId: string;
  teamId: string;
  enabled: boolean;
}) {
  const { setEnabled } = useJerseyRotationSwitch(clubId, teamId);
  const { control, handleSubmit, reset } = useForm<{ enabled: boolean }>({ values: { enabled } });
  const submit = handleSubmit(async (values) => {
    if (!(await setEnabled(values.enabled))) reset({ enabled: !values.enabled });
  });

  return (
    <Card>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <Text as="span" variant="label">
            Rotation activée
          </Text>
          <Text as="span" variant="meta">
            Désactivez si le club lave les maillots.
          </Text>
        </div>
        <Controller
          control={control}
          name="enabled"
          render={({ field }) => (
            <Switch
              aria-label="Rotation activée"
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked);
                void submit();
              }}
            />
          )}
        />
      </div>
    </Card>
  );
}

function NextMatchTile({
  clubId,
  teamId,
  nextMatch,
}: {
  clubId: string;
  teamId: string;
  nextMatch: NonNullable<JerseyRotationOverview['nextMatch']>;
}) {
  const { state: navState } = useLocation();
  return (
    <Card variant="inset" tone="structure" className="flex items-center gap-3">
      <IconBadge tone="onTint">
        <JerseyIcon size="lg" />
      </IconBadge>
      <div className="flex min-w-0 flex-col">
        <Text as="span" variant="meta">
          Prochain match · {formatEventDayShort(nextMatch.startsAt)}
        </Text>
        <TextLink asChild size="md">
          <Link
            to={`/clubs/${clubId}/teams/${teamId}/events/${nextMatch.eventId}`}
            state={navState}
          >
            {nextMatchLine(nextMatch)}
          </Link>
        </TextLink>
      </div>
    </Card>
  );
}

/**
 * The team page's « Maillots » tab: who has washed the jerseys this season
 * and who is next. Everyone on the team reads it (a guardian for their child);
 * a manager also exempts players and turns the rotation on or off.
 */
export function TeamJerseyRotationSection({ clubId, teamId }: { clubId: string; teamId: string }) {
  const query = useJerseyRotation(clubId, teamId);
  const overview = query.data;

  let body: ReactNode;
  if (query.isError) {
    return (
      <QueryError
        onRetry={() => void query.refetch()}
        isRetrying={query.isFetching}
        title="Lavage indisponible"
      />
    );
  }
  if (query.isLoading || !overview) {
    return <SkeletonList rows={4} variant="card" />;
  }

  const { canManage, enabled, teamGender, rows, nextMatch } = overview;
  // Off, there is nothing to rank: a manager keeps the switch to turn it back on.
  if (!enabled && !canManage) return null;

  const columns = canManage
    ? [rosterColumnLabel(teamGender), 'Lavages', 'Dernier lavage', exemptLabel(teamGender)]
    : [rosterColumnLabel(teamGender), 'Lavages', 'Dernier lavage'];

  if (!enabled) {
    body = null;
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={<JerseyIcon size="3xl" tone="secondary" />}
        title={emptyRosterTitle(teamGender)}
      />
    );
  } else {
    body = (
      <>
        {nextMatch && <NextMatchTile clubId={clubId} teamId={teamId} nextMatch={nextMatch} />}
        <Card variant="flush">
          <ResponsiveTable
            columns={columns}
            list
            listHeader={canManage ? false : [rosterColumnLabel(teamGender), 'Lavages']}
          >
            {rows.map((row) => (
              <JerseyRotationRow
                key={row.teamPlayerId}
                clubId={clubId}
                teamId={teamId}
                teamGender={teamGender}
                row={row}
                canManage={canManage}
              />
            ))}
          </ResponsiveTable>
        </Card>
        {!canManage && (
          <Text variant="meta" size="xs">
            {ORDER_FOOTNOTE}
          </Text>
        )}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <SectionHeading as="h2">Lavage des maillots</SectionHeading>
        <Text variant="meta">{seasonLabel(overview.seasonYear)}</Text>
      </div>
      {body}
      {canManage && <RotationSwitchCard clubId={clubId} teamId={teamId} enabled={enabled} />}
    </section>
  );
}
