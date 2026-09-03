import type { Meta, StoryObj } from '@storybook/react';
import { TimeBlock } from './TimeBlock';

const meta: Meta<typeof TimeBlock> = {
  title: 'Components/TimeBlock',
  component: TimeBlock,
  decorators: [
    (Story) => (
      <div className="flex overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <Story />
        <div className="p-4 text-sm text-muted">Gymnase du Vigneau — Terrain 2</div>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TimeBlock>;

/** A match fills solid: the heaviest weight of the structural colour. */
export const Match: Story = {
  args: { type: 'MATCH', startsAt: '2026-08-12T20:30:00.000Z', timeConfirmed: true },
};

/** A training steps down to a bordered surface instead. */
export const Training: Story = {
  args: { type: 'TRAINING', startsAt: '2026-08-12T18:00:00.000Z', timeConfirmed: true },
};

/** An imported fixture with no kickoff yet — never the 00:00 placeholder. */
export const TimeToBeConfirmed: Story = {
  args: { type: 'MATCH', startsAt: '2026-08-12T00:00:00.000Z', timeConfirmed: false },
};

/** The compact step, for a dense list or a card that is already nested. */
export const Small: Story = {
  args: { type: 'MATCH', startsAt: '2026-08-12T20:30:00.000Z', timeConfirmed: true, size: 'sm' },
};
