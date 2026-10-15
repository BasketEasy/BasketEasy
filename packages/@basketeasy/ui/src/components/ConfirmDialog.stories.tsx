import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
};
export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const Simple: Story = {
  render: () => (
    <ConfirmDialog
      trigger={<Button variant="outline">Retirer</Button>}
      title="Retirer le joueur ?"
      description="Alex Dupont ne sera plus dans l’effectif de cette équipe."
      confirmLabel="Retirer"
      onConfirm={() => {}}
    />
  ),
};

export const TypeToConfirm: Story = {
  render: () => (
    <ConfirmDialog
      trigger={<Button variant="destructive">Supprimer</Button>}
      title="Supprimer l’équipe ?"
      description="« U15 Filles » sera supprimée définitivement, avec son effectif (14) et tous ses événements (32). Cette action est irréversible."
      confirmLabel="Supprimer définitivement"
      confirmWord="U15 Filles"
      onConfirm={() => {}}
    />
  ),
};

export const WithError: Story = {
  render: () => (
    <ConfirmDialog
      trigger={<Button variant="destructive">Supprimer</Button>}
      title="Supprimer l’équipe ?"
      description="Cette action est irréversible."
      confirmLabel="Supprimer définitivement"
      confirmWord="U15 Filles"
      onConfirm={() => {}}
      error="Une erreur est survenue, réessayez."
    />
  ),
};
