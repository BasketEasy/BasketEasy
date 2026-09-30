import type { Meta, StoryObj } from '@storybook/react';
import { Alert } from './Alert';
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
export const Inverse: Story = {
  args: { children: 'Quitter', variant: 'inverse' },
  // Its ground is a critical Alert; a hand-coloured wrapper would name a colour here.
  decorators: [
    (Story) => (
      <Alert variant="critical">
        <Story />
      </Alert>
    ),
  ],
};
export const Disabled: Story = { args: { children: 'Indisponible', disabled: true } };
export const Icon: Story = {
  args: { children: '☰', size: 'icon', variant: 'ghost', 'aria-label': 'Menu' },
};
export const IconResponsive: Story = {
  args: {
    variant: 'outline',
    size: 'icon-responsive',
    'aria-label': 'Modifier',
    children: (
      <>
        <span aria-hidden="true">✎</span>
        <span className="hidden md:inline">Modifier</span>
      </>
    ),
  },
};
export const Loading: Story = { args: { children: 'Enregistrement…', loading: true } };
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 bg-ground p-6">
      <Button variant="default">Valider</Button>
      <Button variant="secondary">Annuler</Button>
      <Button variant="outline">Voir plus</Button>
      <Button variant="ghost">Fermer</Button>
      <Button variant="destructive">Supprimer</Button>
    </div>
  ),
};
