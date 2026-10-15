import type { Meta, StoryObj } from '@storybook/react';
import { Switch } from './Switch';

const meta: Meta<typeof Switch> = {
  title: 'Components/Switch',
  component: Switch,
};
export default meta;
type Story = StoryObj<typeof Switch>;

export const Off: Story = { args: { 'aria-label': 'Rotation activée' } };
export const On: Story = { args: { 'aria-label': 'Rotation activée', defaultChecked: true } };
export const Disabled: Story = {
  args: { 'aria-label': 'Rotation activée', defaultChecked: true, disabled: true },
};
