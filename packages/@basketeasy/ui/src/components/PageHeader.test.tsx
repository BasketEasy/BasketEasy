import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the title as the one h1', () => {
    render(<PageHeader title="Mes équipes" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Mes équipes' })).toBeInTheDocument();
  });

  it('renders the meta line only when set', () => {
    const { rerender, container } = render(<PageHeader title="Mes équipes" />);
    expect(container.querySelector('p')).toBeNull();
    rerender(<PageHeader title="Mes équipes" meta="4 équipes" />);
    expect(screen.getByText('4 équipes')).toBeInTheDocument();
  });

  it('renders the actions beside the title', () => {
    render(<PageHeader title="Résultats" actions={<button type="button">Filtrer</button>} />);
    expect(screen.getByRole('button', { name: 'Filtrer' })).toBeInTheDocument();
  });
});
