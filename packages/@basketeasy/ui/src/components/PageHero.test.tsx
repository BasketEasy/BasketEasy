import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHero } from './PageHero';

describe('PageHero', () => {
  it('renders the title as the h1, after the eyebrow in DOM order', () => {
    render(<PageHero eyebrow="ASC Rezé Basket" title="Seniors M1" meta="12 joueurs" />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Seniors M1' });
    const eyebrow = screen.getByText('ASC Rezé Basket');
    expect(eyebrow.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('12 joueurs')).toBeInTheDocument();
  });

  it('is one column with no aside cell when no aside is given', () => {
    const { container } = render(<PageHero title="Seniors M1" />);
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveClass('md:grid-cols-1');
    expect(card.children).toHaveLength(1);
  });

  it('renders the aside in its own cell, two columns from md', () => {
    const { container } = render(<PageHero title="Seniors M1" aside={<p>Prochain match</p>} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveClass('md:grid-cols-2');
    expect(card.children).toHaveLength(2);
    expect(screen.getByText('Prochain match')).toBeInTheDocument();
  });

  it('renders the badges row and the title action', () => {
    render(
      <PageHero
        title="Seniors M1"
        badges={<span>Entente CTC</span>}
        titleAction={<button type="button">Modifier</button>}
      />,
    );
    expect(screen.getByText('Entente CTC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
  });
});
