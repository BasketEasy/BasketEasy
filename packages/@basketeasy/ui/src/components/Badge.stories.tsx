import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = { args: { children: 'Actif', variant: 'default' } };
export const Secondary: Story = { args: { children: 'CTC', variant: 'secondary' } };
export const Outline: Story = { args: { children: 'Inactif', variant: 'outline' } };
