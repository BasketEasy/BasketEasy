import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@basketeasy/ui/card';
import { Text } from '@basketeasy/ui/text';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
import type { AdminStatPoint } from '@basketeasy/types/platform-admin-stats';
import { formatWeek } from './statFormat';

// The dashboard's marks. One hue for every series (blue-green, the colour
// that carries structure) with the current week in orange, the rare accent:
// no chart here compares categories by colour, so no categorical palette is
// needed, and small multiples replace what would have been a two-colour
// chart. Every chart carries its numbers as a visually hidden table.

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
 * Weekly columns. Each bar carries its value in a tooltip (`title`), and the
 * whole series is repeated in a hidden table for assistive tech.
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
  const max = Math.max(0, ...points.map((point) => point.value ?? 0));
  const last = points.length - 1;

  return (
    <ChartCard title={title} summary={summary}>
      <div className="flex h-32 items-end gap-1 border-b border-border-strong" aria-hidden="true">
        {points.map((point, index) => (
          <div
            key={point.weekStart}
            title={`Semaine du ${formatWeek(point.weekStart)} : ${format(point.value)}`}
            className={cn(
              'min-h-0.5 flex-1 rounded-t-sm',
              index === last ? 'bg-orange' : 'bg-blue-green',
            )}
            style={{ height: max > 0 ? `${((point.value ?? 0) / max) * 100}%` : '0' }}
          />
        ))}
      </div>
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
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Semaine du</th>
            <th scope="col">Valeur</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.weekStart}>
              <td>{formatWeek(point.weekStart)}</td>
              <td>{format(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const max = Math.max(0, ...rows.map((row) => row.value));
  return (
    <ChartCard title={title} summary={undefined}>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2.5">
            <Text as="span" variant="body" size="sm" className="w-28 shrink-0">
              {row.label}
            </Text>
            <span className="h-3 flex-1 rounded-r-sm bg-surface-2" aria-hidden="true">
              <span
                className="block h-3 rounded-r-sm bg-blue-green"
                style={{ width: max > 0 ? `${(row.value / max) * 100}%` : '0' }}
              />
            </span>
            <Text as="span" variant="meta" size="sm" className="tabular w-14 shrink-0 text-right">
              {row.display}
            </Text>
          </li>
        ))}
      </ul>
      {action}
    </ChartCard>
  );
}
