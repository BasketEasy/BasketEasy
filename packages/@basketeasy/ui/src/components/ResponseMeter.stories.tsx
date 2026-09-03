import type { Meta, StoryObj } from '@storybook/react';
import { ResponseMeter } from './ResponseMeter';

const meta: Meta<typeof ResponseMeter> = {
  title: 'Components/ResponseMeter',
  component: ResponseMeter,
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof ResponseMeter>;

/** « 9 oui · 2 peut-être · 1 non · 2 sans réponse » — the squad on an event page. */
export const MixedResponses: Story = {
  args: { going: 9, maybe: 2, notGoing: 1, pending: 2 },
};

/** Convocation just sent: almost everything is still unanswered. */
export const MostlyPending: Story = {
  args: { going: 2, maybe: 1, notGoing: 0, pending: 11 },
};

/** Everyone has answered yes — no track showing through. */
export const FullSquad: Story = {
  args: { going: 12, maybe: 0, notGoing: 0, pending: 0 },
};

/** Nobody on the roster: an empty track, and no division by zero. */
export const EmptyRoster: Story = {
  args: { going: 0, maybe: 0, notGoing: 0, pending: 0 },
};

/** The thinner step, for a meter inside a dense list row. */
export const Small: Story = {
  args: { going: 9, maybe: 2, notGoing: 1, pending: 2, size: 'sm' },
};
