import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';
import { Button } from './Button';
import { FactTile } from './FactTile';
import { PageHero } from './PageHero';

const meta: Meta<typeof PageHero> = {
  title: 'Components/PageHero',
  component: PageHero,
};
export default meta;
type Story = StoryObj<typeof PageHero>;

const Dot = () => <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />;

export const WithAside: Story = {
  render: () => (
    <PageHero
      badges={
        <Badge variant="soft" tone="structure">
          Entente CTC
        </Badge>
      }
      eyebrow="ASC Rezé Basket"
      title="Seniors M1"
      meta="Seniors · Masculin · 12 joueurs"
      aside={
        <FactTile
          icon={<Dot />}
          label="Sam. 10 oct. · 18:30"
          detail="Prochain : vs Carquefou"
          actions={
            <Button variant="outline" size="sm" className="flex-1">
              Voir le match
            </Button>
          }
        />
      }
    />
  ),
};

export const WithoutAside: Story = {
  render: () => <PageHero eyebrow="Club" title="ASC Rezé Basket" meta="42 membres" />,
};
