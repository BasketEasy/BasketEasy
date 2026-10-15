import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FactTile } from './FactTile';

describe('FactTile', () => {
  it('renders the label, the detail and the actions', () => {
    render(
      <FactTile
        icon={<svg />}
        label="Gymnase de la Trocardière"
        detail="Rue de la Trocardière, Rezé"
        actions={<button type="button">Itinéraire</button>}
      />,
    );
    expect(screen.getByText('Gymnase de la Trocardière')).toBeInTheDocument();
    expect(screen.getByText('Rue de la Trocardière, Rezé')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Itinéraire' })).toBeInTheDocument();
  });

  it('omits the detail line when none is given', () => {
    const { container } = render(<FactTile icon={<svg />} label="Aucun code" />);
    expect(container.querySelectorAll('span.text-xs')).toHaveLength(0);
  });

  it('puts the accent tone on the card and on the icon badge', () => {
    const { container } = render(
      <FactTile icon={<svg />} label="Lieu non communiqué" tone="accent" />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveAttribute('data-tone', 'accent');
    expect(card).toHaveClass('bg-gold-tint');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-gold-tint');
  });

  it('defaults to the neutral tone and the structure badge', () => {
    const { container } = render(<FactTile icon={<svg />} label="Code club FFBB" />);
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveAttribute('data-tone', 'neutral');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-blue-green-tint');
  });
});
