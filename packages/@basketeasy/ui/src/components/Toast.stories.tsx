import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';
import { Toaster } from './Toaster';
import { toast } from '../lib/toast-store';

const meta: Meta = {
  title: 'Components/Toast',
};
export default meta;
type Story = StoryObj;

export const Success: Story = {
  render: () => (
    <>
      <Button onClick={() => toast({ variant: 'success', description: 'Profil mis à jour.' })}>
        Afficher un toast de succès
      </Button>
      <Toaster />
    </>
  ),
};

export const Destructive: Story = {
  render: () => (
    <>
      <Button
        variant="destructive"
        onClick={() => toast({ variant: 'destructive', description: 'La sauvegarde a échoué.' })}
      >
        Afficher un toast d'erreur
      </Button>
      <Toaster />
    </>
  ),
};

export const DefaultMessages: Story = {
  render: () => (
    <>
      <Button onClick={() => toast({ variant: 'success' })}>Succès (message par défaut)</Button>
      <Toaster />
    </>
  ),
};
