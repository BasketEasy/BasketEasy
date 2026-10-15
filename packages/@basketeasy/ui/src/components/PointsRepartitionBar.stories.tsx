import type { Meta, StoryObj } from '@storybook/react';
import { PointsRepartitionBar } from './PointsRepartitionBar';

const meta: Meta<typeof PointsRepartitionBar> = {
  title: 'Components/PointsRepartitionBar',
  component: PointsRepartitionBar,
  decorators: [
    (Story) => (
      <div className="w-52">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof PointsRepartitionBar>;

export const AllThreeBuckets: Story = {
  args: {
    label: 'Répartition des points de Camille Roy',
    threePointPoints: 27,
    twoPointPoints: 72,
    freeThrowPoints: 18,
  },
};

/** A shooter who lives behind the arc — the ramp's darkest step dominates. */
export const MostlyThrees: Story = {
  args: {
    label: 'Répartition des points de Léa Martin',
    threePointPoints: 45,
    twoPointPoints: 36,
    freeThrowPoints: 9,
  },
};

/** Narrow segments drop their inline count rather than clipping a digit. */
export const NarrowSegments: Story = {
  args: {
    label: 'Répartition des points de Julie Blanc',
    threePointPoints: 3,
    twoPointPoints: 96,
    freeThrowPoints: 1,
  },
};

/** Nothing scored: an empty track, with the reason left to the caller. */
export const NoPoints: Story = {
  args: {
    label: 'Répartition des points de Alice Lemoine',
    threePointPoints: 0,
    twoPointPoints: 0,
    freeThrowPoints: 0,
  },
};
