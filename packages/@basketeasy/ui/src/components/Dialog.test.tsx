import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './Dialog';

describe('Dialog', () => {
  it('opens content when the trigger is clicked', async () => {
    render(
      <Dialog>
        <DialogTrigger>Ouvrir</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le créneau</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByText('Supprimer le créneau')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Ouvrir'));
    expect(screen.getByText('Supprimer le créneau')).toBeInTheDocument();
  });
});
