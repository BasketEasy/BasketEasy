import type { Meta, StoryObj } from '@storybook/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Dialog';
import { Button } from './Button';

const meta: Meta<typeof Dialog> = {
  title: 'Components/Dialog',
  component: Dialog,
};
export default meta;
type Story = StoryObj<typeof Dialog>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Supprimer le créneau</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer le créneau</DialogTitle>
          <DialogDescription>Cette action est irréversible.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  ),
};

export const Sheet: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Choisir une personne</Button>
      </DialogTrigger>
      <DialogContent variant="sheet">
        <DialogHeader>
          <DialogTitle>Pour qui ?</DialogTitle>
          <DialogDescription>Reste une feuille du bas, même sur desktop.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  ),
};
