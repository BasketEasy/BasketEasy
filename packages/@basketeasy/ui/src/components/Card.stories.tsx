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
