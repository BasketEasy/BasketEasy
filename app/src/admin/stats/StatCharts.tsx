import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@basketeasy/ui/card';
import { Text } from '@basketeasy/ui/text';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { BarListChart, ColumnChart, type ChartDatum } from '@basketeasy/ui/chart';
import type { AdminStatPoint } from '@basketeasy/types/platform-admin-stats';
import { formatWeek } from './statFormat';

// The dashboard's marks, drawn through @basketeasy/ui/chart. One hue for
// every series (blue-green, the colour that carries structure) with the
// current week in orange, the rare accent: no chart here compares categories
// by colour, so no categorical palette is needed, and small multiples replace
// what would have been a two-colour chart. The chart wrapper carries each
// chart's numbers as a visually hidden table.

/** A count or ratio tile; `to` makes it a link to the records behind it. */
export function StatTile({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <Text as="span" variant="eyebrow" size="xs" tone="secondary">
          {label}
        </Text>
        {to && (
          <Text as="span" variant="label" size="sm" tone="structure" aria-hidden="true">
            →
          </Text>
        )}
      </span>
      <Text as="span" variant="display" size="3xl" className="tabular">
        {value}
      </Text>
      {hint && (
        <Text as="span" variant="meta" size="sm">
          {hint}
        </Text>
      )}
    </>
  );

  if (to) {
    return (
      <Card variant="panel" className="relative flex flex-col gap-1.5 hover:shadow-lg">
        <Link to={to} className={cn('absolute inset-0 rounded-lg', focusRing)}>
          <span className="sr-only">
            {label} : {value}, voir le détail
          </span>
        </Link>
        {body}
      </Card>
    );
  }
  return (
    <Card variant="panel" className="flex flex-col gap-1.5">
      {body}
    </Card>
  );
}

function ChartCard({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <Card variant="panel" className="flex min-w-0 flex-col gap-3">
      <figure className="m-0 flex flex-col gap-3">
        <figcaption className="flex items-baseline justify-between gap-2">
          <Text as="span" variant="label">
            {title}
          </Text>
          {summary && (
            <Text as="span" variant="meta" size="sm" className="tabular whitespace-nowrap">
              {summary}
            </Text>
          )}
        </figcaption>
        {children}
      </figure>
    </Card>
  );
}

/**
 * Weekly columns, the current week in the brand accent. The first week and
 * « Semaine en cours » label the two ends, so the axis itself stays bare.
 */
export function WeeklyBars({
  title,
  summary,
  points,
  format,
}: {
  title: string;
  summary?: string;
  points: AdminStatPoint[];
  format: (value: number | null) => string;
}) {
  const last = points.length - 1;
  const data: ChartDatum[] = points.map((point, index) => ({
    key: point.weekStart,
    label: formatWeek(point.weekStart),
    tooltipLabel: `Semaine du ${formatWeek(point.weekStart)}`,
    value: point.value,
    display: format(point.value),
    tone: index === last ? 'brand' : 'structure',
  }));

  return (
    <ChartCard title={title} summary={summary}>
      <ColumnChart
        data={data}
        table={{ caption: title, labelHeader: 'Semaine du', valueHeader: 'Valeur' }}
      />
      {points.length > 0 && (
        <div className="flex justify-between" aria-hidden="true">
          <Text as="span" variant="meta" size="xs" className="tabular">
            {formatWeek(points[0].weekStart)}
          </Text>
          <Text as="span" variant="meta" size="xs">
            Semaine en cours
          </Text>
        </div>
      )}
    </ChartCard>
  );
}

/** Labelled horizontal bars: a breakdown read as a list, value at the end. */
export function BreakdownBars({
  title,
  rows,
  action,
}: {
  title: string;
  rows: { label: string; value: number; display: string }[];
  action?: ReactNode;
}) {
  return (
    <ChartCard title={title} summary={undefined}>
      <BarListChart
        data={rows.map((row) => ({ key: row.label, ...row }))}
        table={{ caption: title, labelHeader: 'Catégorie', valueHeader: 'Valeur' }}
      />
      {action}
    </ChartCard>
  );
}
