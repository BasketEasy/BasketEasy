import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = { args: { children: 'Valider', variant: 'default' } };
export const Secondary: Story = { args: { children: 'Annuler', variant: 'secondary' } };
export const Outline: Story = { args: { children: 'Voir plus', variant: 'outline' } };
export const Ghost: Story = { args: { children: 'Fermer', variant: 'ghost' } };
export const Destructive: Story = { args: { children: 'Supprimer', variant: 'destructive' } };
export const Disabled: Story = { args: { children: 'Indisponible', disabled: true } };
export const Icon: Story = {
  args: { children: '☰', size: 'icon', variant: 'ghost', 'aria-label': 'Menu' },
};
