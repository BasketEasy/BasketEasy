import type { Meta, StoryObj } from '@storybook/react';
import { StatTile } from './StatTile';
import { BuildingIcon } from './icons/BuildingIcon';
import { CalendarIcon } from './icons/CalendarIcon';
import { ChartBarsIcon } from './icons/ChartBarsIcon';
import { TrophyIcon } from './icons/TrophyIcon';
import { UsersIcon } from './icons/UsersIcon';

const meta: Meta<typeof StatTile> = {
  title: 'Components/StatTile',
  component: StatTile,
};
export default meta;

type Story = StoryObj<typeof StatTile>;

export const Default: Story = {
  args: {
    icon: <UsersIcon size="md" />,
    label: 'Joueurs au total',
    value: 58,
  },
};

/** The manager home's row of four, on the page's own ground. */
export const TileRow: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 bg-ground p-4 md:grid-cols-4">
      <StatTile icon={<TrophyIcon size="md" />} label="Équipes gérées" value={2} />
      <StatTile
        icon={<CalendarIcon size="md" />}
        label="Événements — 7 prochains jours"
        value={6}
      />
      <StatTile icon={<UsersIcon size="md" />} label="Joueurs au total" value={58} />
      <StatTile icon={<BuildingIcon size="md" />} label="Clubs administrés" value={1} />
    </div>
  ),
};

/** The small step, nested inside an already-raised card — the personal stats card. */
export const SmallInsideACard: Story = {
  render: () => (
    <div className="max-w-sm rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-2">
        <StatTile icon={<CalendarIcon size="md" />} label="Matches joués" value={12} size="sm" />
        <StatTile icon={<ChartBarsIcon size="md" />} label="Points / match" value="8,4" size="sm" />
      </div>
    </div>
  ),
};
