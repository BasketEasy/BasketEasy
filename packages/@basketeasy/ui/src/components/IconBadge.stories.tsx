import type { Meta, StoryObj } from '@storybook/react';
import { IconBadge } from './IconBadge';
import { CalendarIcon } from './icons/CalendarIcon';

const meta: Meta<typeof IconBadge> = {
  title: 'Components/IconBadge',
  component: IconBadge,
  args: { children: <CalendarIcon size="lg" /> },
};
export default meta;

type Story = StoryObj<typeof IconBadge>;

export const Structure: Story = {};
export const Danger: Story = { args: { tone: 'danger' } };
export const Large: Story = { args: { className: 'h-14 w-14' } };
