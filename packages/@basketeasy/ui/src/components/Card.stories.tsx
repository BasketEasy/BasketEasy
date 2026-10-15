import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './Card';
import { Button } from './Button';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
};
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>AS Basket</CardTitle>
        <CardDescription>Club de Loire-Atlantique</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">
        42 licenciés, 6 équipes
        <Button size="sm">Voir le club</Button>
      </CardContent>
    </Card>
  ),
};

export const BrandTone: Story = {
  name: 'Brand tone (decision band)',
  render: () => (
    <Card variant="panel" tone="brand" className="w-80">
      <CardTitle>Vous êtes convoqué·e</CardTitle>
      <CardDescription>Le coach vous a retenu·e dans le groupe des 12.</CardDescription>
    </Card>
  ),
};

export const EmptySettingSlot: Story = {
  name: 'Empty setting slot (placeholder)',
  render: () => (
    <Card variant="placeholder" className="w-80">
      <CardDescription>Aucun point de rendez-vous défini pour le club.</CardDescription>
    </Card>
  ),
};

export const FigureTile: Story = {
  name: 'Figure tile (structure tone)',
  render: () => (
    <Card variant="inset" tone="structure" className="w-40">
      <CardTitle>6</CardTitle>
      <CardDescription>au RDV</CardDescription>
    </Card>
  ),
};

export const HeadsUpNote: Story = {
  name: 'Heads-up note (accent tone)',
  render: () => (
    <Card variant="inset" tone="accent" className="w-80">
      <CardDescription>
        Les joueurs qui viennent au RDV seront prévenus du changement.
      </CardDescription>
    </Card>
  ),
};
