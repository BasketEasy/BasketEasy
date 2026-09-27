import type { Meta, StoryObj } from '@storybook/react';
import { Divider } from './Divider';
import { Card } from './Card';
import { Text } from './Text';

const meta: Meta<typeof Divider> = {
  title: 'Components/Divider',
  component: Divider,
};
export default meta;
type Story = StoryObj<typeof Divider>;

export const BetweenSections: Story = {
  name: 'Between two sections',
  render: () => (
    <div className="flex w-80 flex-col gap-3">
      <Text>Présents : 9</Text>
      <Divider />
      <Text>Sans réponse : 3</Text>
    </div>
  ),
};

export const InARowOfFigures: Story = {
  name: 'In a row of figures (vertical)',
  render: () => (
    <div className="flex items-center gap-3">
      <Text>6 au RDV</Text>
      <Divider orientation="vertical" className="h-4" />
      <Text>3 en direct</Text>
    </div>
  ),
};

export const InsideTheDecisionBand: Story = {
  name: 'Inside the decision band (brand)',
  render: () => (
    <Card variant="panel" tone="brand" className="flex w-80 flex-col gap-3">
      <Text>Vous êtes convoqué·e</Text>
      <Divider tone="brand" />
      <Text variant="meta">Comment venez-vous ?</Text>
    </Card>
  ),
};
