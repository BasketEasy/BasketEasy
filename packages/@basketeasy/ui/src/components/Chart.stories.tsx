import type { Meta, StoryObj } from '@storybook/react';
import { BarListChart, ColumnChart, type ChartDatum } from './Chart';

const meta: Meta = { title: 'Components/Chart' };
export default meta;

type Story = StoryObj;

const WEEKS: ChartDatum[] = [3, 5, 2, 8, 6, 9, 4, 7, 11, 6, 10, 12].map((value, index, all) => ({
  key: `w${index}`,
  label: `S${index + 1}`,
  value,
  display: String(value),
  tooltipLabel: `Semaine ${index + 1}`,
  tone: index === all.length - 1 ? 'brand' : 'structure',
}));

/** Weekly columns, the current week in the brand accent. */
export const Columns: Story = {
  render: () => (
    <div className="max-w-md bg-surface p-5">
      <ColumnChart
        data={WEEKS}
        table={{ caption: 'Comptes par semaine', labelHeader: 'Semaine', valueHeader: 'Comptes' }}
        showAxisLabels
      />
    </div>
  ),
};

/** A ranked breakdown, value printed at the end of each bar. */
export const BarList: Story = {
  render: () => (
    <div className="max-w-md bg-surface p-5">
      <BarListChart
        data={[
          { key: 'u11', label: 'U11', value: 42, display: '42' },
          { key: 'u13', label: 'U13', value: 35, display: '35' },
          { key: 'seniors', label: 'Seniors', value: 18, display: '18' },
        ]}
        table={{
          caption: 'Équipes par catégorie',
          labelHeader: 'Catégorie',
          valueHeader: 'Équipes',
        }}
      />
    </div>
  ),
};
