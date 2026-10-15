import type { Meta, StoryObj } from '@storybook/react';
import { AvatarGroup } from './AvatarGroup';

const SQUAD = [
  { firstName: 'Camille', lastName: 'Roussel' },
  { firstName: 'Sarah', lastName: 'Diallo' },
  { firstName: 'Maya', lastName: 'Gomez' },
  { firstName: 'Alice', lastName: 'Tran' },
  { firstName: 'Léa', lastName: 'Moreau' },
  { firstName: 'Inès', lastName: 'Berger' },
  { firstName: 'Julie', lastName: 'Blanc' },
  { firstName: 'Nour', lastName: 'Haddad' },
  { firstName: 'Emma', lastName: 'Petit' },
];

const meta: Meta<typeof AvatarGroup> = {
  title: 'Components/AvatarGroup',
  component: AvatarGroup,
  decorators: [
    (Story) => (
      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof AvatarGroup>;

/** « Qui vient ? » — four faces and the rest as a count. */
export const WithOverflow: Story = {
  args: { people: SQUAD },
};

/** Everyone fits: no chip. */
export const EverybodyFits: Story = {
  args: { people: SQUAD.slice(0, 3) },
};

/** A tighter cut, for a list row rather than a card. */
export const TwoShown: Story = {
  args: { people: SQUAD, max: 2 },
};
