import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Valider</Button>);
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
  });

  it('applies the secondary variant class', () => {
    render(<Button variant="secondary">Annuler</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-blue-green');
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Cliquer</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Désactivé</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applies a 44x44 touch target for the icon size', () => {
    render(<Button size="icon" aria-label="Menu" />);
    expect(screen.getByRole('button')).toHaveClass('h-11', 'w-11');
  });

  it('shows a spinner and stays labelled while loading', () => {
    render(<Button loading>Enregistrer</Button>);
    const button = screen.getByRole('button', { name: /Enregistrer/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('svg')).toBeInTheDocument();
  });

  it('gives the ghost variant a hover state distinct from the page', () => {
    render(<Button variant="ghost">Mes équipes</Button>);
    expect(screen.getByRole('button')).toHaveClass('hover:bg-blue-green-tint');
  });
});
