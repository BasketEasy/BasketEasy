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

  it('anchors a sheet to the bottom edge, with the same close button', async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent variant="sheet">
          <DialogHeader>
            <DialogTitle>Pour qui ?</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveClass('bottom-0', 'rounded-t-2xl');
    expect(sheet).not.toHaveClass('top-1/2');
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
  });
});
