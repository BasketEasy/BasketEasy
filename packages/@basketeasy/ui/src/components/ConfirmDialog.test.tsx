import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('confirms immediately when no confirmWord is set', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<Button>Ouvrir</Button>}
        title="Retirer le joueur ?"
        description="Cette action est irréversible."
        confirmLabel="Retirer"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const confirm = screen.getByRole('button', { name: 'Retirer' });
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('keeps the confirm button disabled until the confirmWord is typed exactly', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<Button>Supprimer</Button>}
        title="Supprimer l’équipe ?"
        description="Cette action est irréversible."
        confirmLabel="Supprimer définitivement"
        confirmWord="U15 Filles"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    const confirm = screen.getByRole('button', { name: /Supprimer définitivement/ });
    expect(confirm).toBeDisabled();

    const input = screen.getByLabelText(/Saisissez/);
    await user.type(input, 'U15 Fille');
    expect(confirm).toBeDisabled();

    await user.type(input, 's');
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('trims surrounding whitespace before comparing the typed confirmation', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        trigger={<Button>Supprimer</Button>}
        title="Supprimer l’équipe ?"
        description="Cette action est irréversible."
        confirmLabel="Supprimer définitivement"
        confirmWord="U15 Filles"
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    const confirm = screen.getByRole('button', { name: /Supprimer définitivement/ });
    await user.type(screen.getByLabelText(/Saisissez/), '  U15 Filles  ');
    expect(confirm).toBeEnabled();
  });

  it('shows the error message when provided', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        trigger={<Button>Supprimer</Button>}
        title="Supprimer l’équipe ?"
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        onConfirm={vi.fn()}
        error="Une erreur est survenue."
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(screen.getByText('Une erreur est survenue.')).toBeInTheDocument();
  });
});
