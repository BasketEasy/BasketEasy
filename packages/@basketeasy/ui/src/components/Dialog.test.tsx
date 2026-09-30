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
    const handle = sheet.querySelector('[aria-hidden="true"]');
    expect(handle).toHaveClass('bg-border-strong');
    expect(handle).not.toHaveClass('md:hidden');
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
  });

  it('is a sheet below md and a centred card from md up by default, with a mobile-only handle', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('bottom-0', 'rounded-t-2xl', 'md:top-1/2', 'md:rounded-xl');
    const handle = dialog.querySelector('[aria-hidden="true"]');
    expect(handle).toHaveClass('md:hidden');
  });

  it('keeps variant="dialog" centred at every width, without a handle', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent variant="dialog">
          <DialogHeader>
            <DialogTitle>Centré</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('top-1/2');
    expect(dialog.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
