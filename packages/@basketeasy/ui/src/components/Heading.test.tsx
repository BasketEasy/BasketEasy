import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Heading } from './Heading';

describe('Heading', () => {
  it('renders an h2 by default', () => {
    render(<Heading>Titre</Heading>);
    expect(screen.getByRole('heading', { level: 2, name: 'Titre' })).toBeInTheDocument();
  });

  it('renders the semantic level requested via "as"', () => {
    render(<Heading as="h1">Titre</Heading>);
    expect(screen.getByRole('heading', { level: 1, name: 'Titre' })).toBeInTheDocument();
  });

  it('defaults the visual size from the level when size is not set', () => {
    render(<Heading as="h1">Titre</Heading>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-4xl');
  });

  it('supports the 2xl size for section-level headings', () => {
    render(
      <Heading as="h2" size="2xl">
        Titre
      </Heading>,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass('text-2xl');
  });

  it('allows overriding the visual size independently of the level', () => {
    render(
      <Heading as="h2" size="xl">
        Titre
      </Heading>,
    );
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveClass('text-xl');
    expect(heading).not.toHaveClass('text-3xl');
  });

  it('merges an extra className with the size classes', () => {
    render(
      <Heading as="h1" className="m-0">
        Titre
      </Heading>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('m-0', 'text-4xl');
  });
});
