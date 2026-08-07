import type { Meta, StoryObj } from '@storybook/react';
import { Label } from './Label';

const meta: Meta<typeof Label> = {
  title: 'Components/Label',
  component: Label,
};
export default meta;
type Story = StoryObj<typeof Label>;

export const Default: Story = { args: { children: 'Nom du club', htmlFor: 'club-name' } };
