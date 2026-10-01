import type { ReactElement } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { cn } from '../lib/cn';
import { Text } from './Text';

/**
 * The one door to the charting library (Recharts). Nothing else imports
 * `recharts`: a call site picks a chart shape and a `tone`, never a colour,
 * and a later swap of library touches this file only.
 *
 * Colour stays a token. Every mark is `fill="currentColor"` and takes its
 * colour from a Tailwind text class on the mark itself (`text-blue-green`,
 * `text-orange`), so no hex value exists outside `tailwind-preset.cjs`.
 *
 * Every chart also renders its numbers as a visually hidden table: the SVG is
 * `aria-hidden`, and the table is what a screen reader reads.
 */

/** What a mark means, never its hue. `structure` is the default series. */
export type ChartTone = 'structure' | 'brand';

const TONE_CLASS: Record<ChartTone, string> = {
  structure: 'text-blue-green',
  brand: 'text-orange',
};

export interface ChartDatum {
  /** Unique per chart; the category the mark stands for. */
  key: string;
  /** Short label, shown on the axis and in the table. */
  label: string;
  /** `null` is "unknown" and draws no mark; it is not zero. */
  value: number | null;
  /** How the value reads (« 12 », « 34 % », « — »). */
  display: string;
  /** Longer wording for the tooltip, defaulting to `label`. */
  tooltipLabel?: string;
  tone?: ChartTone;
}

export interface ChartTableProps {
  caption: string;
  labelHeader: string;
  valueHeader: string;
}

function ChartTable({ data, table }: { data: ChartDatum[]; table: ChartTableProps }) {
  return (
    <table className="sr-only">
      <caption>{table.caption}</caption>
      <thead>
        <tr>
          <th scope="col">{table.labelHeader}</th>
          <th scope="col">{table.valueHeader}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((datum) => (
          <tr key={datum.key}>
            <td>{datum.label}</td>
            <td>{datum.display}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChartTooltip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  const datum = payload?.[0]?.payload as ChartDatum | undefined;
  if (!active || !datum) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-1.5 shadow-md">
      <Text as="span" variant="meta" size="xs">
        {datum.tooltipLabel ?? datum.label}
      </Text>
      <Text as="span" variant="label" size="sm" className="tabular block">
        {datum.display}
      </Text>
    </div>
  );
}

function Plot({ className, children }: { className?: string; children: ReactElement }) {
  // `text-muted` is what the axes, grid and value labels inherit through
  // currentColor; each mark overrides it with its own tone class.
  return (
    <div className={cn('w-full text-muted', className)} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const AXIS_TICK = { fill: 'currentColor', fontSize: 12 };

/**
 * Vertical columns over an ordered axis (weeks, months). `className` sizes
 * the plot (`h-32`); it defaults to 8rem.
 */
export function ColumnChart({
  data,
  table,
  className = 'h-32',
}: {
  data: ChartDatum[];
  table: ChartTableProps;
  className?: string;
}) {
  return (
    <>
      <Plot className={className}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.15} />
          <XAxis dataKey="label" hide />
          <YAxis hide domain={[0, 'auto']} />
          <Tooltip
            cursor={{ fill: 'currentColor', fillOpacity: 0.08 }}
            content={<ChartTooltip />}
            isAnimationActive={false}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} minPointSize={2} isAnimationActive={false}>
            {data.map((datum) => (
              <Cell
                key={datum.key}
                className={TONE_CLASS[datum.tone ?? 'structure']}
                fill="currentColor"
              />
            ))}
          </Bar>
        </BarChart>
      </Plot>
      <ChartTable data={data} table={table} />
    </>
  );
}

const BAR_ROW_HEIGHT = 28;

/**
 * Labelled horizontal bars: a breakdown read as a ranked list, its value
 * printed at the end of each bar.
 */
export function BarListChart({ data, table }: { data: ChartDatum[]; table: ChartTableProps }) {
  return (
    <>
      <div style={{ height: data.length * BAR_ROW_HEIGHT }}>
        <Plot className="h-full">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 56, bottom: 0, left: 0 }}
            barCategoryGap={6}
          >
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="label"
              width={112}
              tickLine={false}
              axisLine={false}
              tick={{ ...AXIS_TICK, fontSize: 13 }}
            />
            <Bar
              dataKey="value"
              radius={[0, 3, 3, 0]}
              minPointSize={1}
              isAnimationActive={false}
              background={{ className: 'text-surface-2', fill: 'currentColor' }}
            >
              {data.map((datum) => (
                <Cell
                  key={datum.key}
                  className={TONE_CLASS[datum.tone ?? 'structure']}
                  fill="currentColor"
                />
              ))}
              <LabelList
                dataKey="display"
                position="right"
                className="tabular text-muted"
                fill="currentColor"
                fontSize={13}
              />
            </Bar>
          </BarChart>
        </Plot>
      </div>
      <ChartTable data={data} table={table} />
    </>
  );
}
