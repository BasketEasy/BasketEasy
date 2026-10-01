import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';
import { FactTile } from './FactTile';
import { WarningIcon } from './icons/WarningIcon';

const meta: Meta<typeof FactTile> = {
  title: 'Components/FactTile',
  component: FactTile,
};
export default meta;
type Story = StoryObj<typeof FactTile>;

const Dot = () => <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />;

export const NeutralWithAction: Story = {
  render: () => (
    <FactTile
      icon={<Dot />}
      label="Gymnase de la Trocardière"
      detail="Rue de la Trocardière, 44400 Rezé"
      actions={
        <Button variant="outline" size="sm" className="flex-1">
          Itinéraire
        </Button>
      }
    />
  ),
};

export const AccentWithFilledAction: Story = {
  render: () => (
    <FactTile
      tone="accent"
      icon={<WarningIcon size="lg" aria-hidden="true" />}
      label="Lieu non communiqué"
      detail="Les joueurs ne savent pas encore où aller."
      actions={<Button className="w-full">Ajouter le lieu</Button>}
    />
  ),
};

export const WithTrailing: Story = {
  render: () => (
    <FactTile
      icon={<Dot />}
      label="Code club FFBB"
      detail="ARA0044012"
      trailing={
        <Button variant="outline" size="icon-responsive" aria-label="Modifier">
          <Dot />
          <span className="hidden md:inline">Modifier</span>
        </Button>
      }
    />
  ),
};
