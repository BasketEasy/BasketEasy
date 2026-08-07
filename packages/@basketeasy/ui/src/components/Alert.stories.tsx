import type { Meta, StoryObj } from '@storybook/react';
import { Alert, AlertDescription, AlertTitle } from './Alert';

const meta: Meta<typeof Alert> = {
  title: 'Components/Alert',
  component: Alert,
};
export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: () => (
    <Alert>
      <AlertTitle>Créneau modifié</AlertTitle>
      <AlertDescription>L'entraînement U15 est décalé à 19h.</AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <AlertTitle>Créneau annulé</AlertTitle>
      <AlertDescription>La salle est indisponible ce soir.</AlertDescription>
    </Alert>
  ),
};
