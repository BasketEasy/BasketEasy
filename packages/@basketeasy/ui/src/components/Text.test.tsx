import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Text } from './Text';

describe('Text', () => {
  it('renders a paragraph by default', () => {
    render(<Text>Convoqués</Text>);
    expect(screen.getByText('Convoqués').tagName).toBe('P');
  });

  it('renders the element given by `as`', () => {
    render(<Text as="span">12 joueurs</Text>);
    expect(screen.getByText('12 joueurs').tagName).toBe('SPAN');
  });

  it('gives `meta` a secondary tone and small size without being asked', () => {
    render(<Text variant="meta">Dernière mise à jour</Text>);
    const el = screen.getByText('Dernière mise à jour');
    expect(el).toHaveClass('text-sm');
    expect(el).toHaveClass('text-muted');
  });

  it('lets an explicit size and tone override the variant defaults', () => {
    render(
      <Text variant="meta" size="xs" tone="danger">
        Conflit
      </Text>,
    );
    const el = screen.getByText('Conflit');
    expect(el).toHaveClass('text-xs');
    expect(el).toHaveClass('text-error');
    expect(el).not.toHaveClass('text-muted');
  });

  it('emits no colour class for the inherit tone', () => {
    render(
      <Text tone="inherit" data-testid="t">
        Sur fond coloré
      </Text>,
    );
    const el = screen.getByTestId('t');
    expect(el.className).not.toMatch(/text-(charcoal|muted|cream)/);
  });

  it('sets the eyebrow role in the heading font, uppercased', () => {
    render(<Text variant="eyebrow">Prochain match</Text>);
    const el = screen.getByText('Prochain match');
    expect(el).toHaveClass('font-heading', 'uppercase', 'tracking-eyebrow');
  });
});
