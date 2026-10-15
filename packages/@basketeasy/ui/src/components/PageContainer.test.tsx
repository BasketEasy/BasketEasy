import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageContainer } from './PageContainer';

describe('PageContainer', () => {
  it('renders a main element with the shared spacing', () => {
    render(<PageContainer>Contenu</PageContainer>);
    expect(screen.getByRole('main')).toHaveClass(
      'mx-auto',
      'flex',
      'flex-col',
      'gap-6',
      'px-4',
      'py-10',
      'sm:px-6',
      'sm:py-16',
    );
  });

  it('applies the lg size max-width by default', () => {
    render(<PageContainer>Contenu</PageContainer>);
    expect(screen.getByRole('main')).toHaveClass('max-w-6xl');
  });

  it('applies the md size max-width', () => {
    render(<PageContainer size="md">Contenu</PageContainer>);
    expect(screen.getByRole('main')).toHaveClass('max-w-md');
  });

  it('applies centered layout classes when centered', () => {
    render(<PageContainer centered>Contenu</PageContainer>);
    expect(screen.getByRole('main')).toHaveClass('min-h-dvh', 'justify-center');
  });

  it('does not apply centered layout classes by default', () => {
    render(<PageContainer>Contenu</PageContainer>);
    expect(screen.getByRole('main')).not.toHaveClass('min-h-dvh');
  });

  it('merges a custom className', () => {
    render(<PageContainer className="bg-cream">Contenu</PageContainer>);
    expect(screen.getByRole('main')).toHaveClass('bg-cream');
  });
});
