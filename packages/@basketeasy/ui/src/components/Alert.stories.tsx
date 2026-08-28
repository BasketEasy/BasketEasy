import type { Meta, StoryObj } from '@storybook/react';
import { Alert, AlertDescription } from './Alert';

const meta: Meta<typeof Alert> = {
  title: 'Components/Alert',
  component: Alert,
};
export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: () => (
    <Alert>
      <AlertDescription>L'entraînement U15 est décalé à 19h.</AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <AlertDescription>La salle est indisponible ce soir.</AlertDescription>
    </Alert>
  ),
};
