import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './Card';
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
      <CardContent>42 licenciés, 6 équipes</CardContent>
      <CardFooter>
        <Button size="sm">Voir le club</Button>
      </CardFooter>
    </Card>
  ),
};
