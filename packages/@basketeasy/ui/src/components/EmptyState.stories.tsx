import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const WithAction: Story = {
  render: () => (
    <EmptyState
      title="Aucun joueur"
      description="Ajoutez votre premier joueur à l'effectif."
      action={<Button>Ajouter un joueur</Button>}
    />
  ),
};

export const WithoutAction: Story = {
  render: () => (
    <EmptyState
      title="Aucun joueur pour le moment"
      description="L'entraîneur n'a pas encore ajouté de joueur à cette équipe."
    />
  ),
};
