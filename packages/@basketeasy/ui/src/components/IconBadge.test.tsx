import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IconBadge } from './IconBadge';

describe('IconBadge', () => {
  it('renders its icon', () => {
    render(
      <IconBadge data-testid="badge">
        <svg data-testid="icon" />
      </IconBadge>,
    );

    expect(screen.getByTestId('badge')).toContainElement(screen.getByTestId('icon'));
  });

  it('owns the tint and the icon colour through tone', () => {
    render(<IconBadge tone="danger" data-testid="badge" />);

    expect(screen.getByTestId('badge')).toHaveClass('bg-error-tint', 'text-error');
  });

  it('defaults to the structure tone at the standard size', () => {
    render(<IconBadge data-testid="badge" />);

    expect(screen.getByTestId('badge')).toHaveClass('bg-blue-green-tint', 'h-10', 'w-10');
  });

  it('lets the caller resize it', () => {
    render(<IconBadge className="h-14 w-14" data-testid="badge" />);

    const badge = screen.getByTestId('badge');
    expect(badge).toHaveClass('h-14', 'w-14');
    expect(badge).not.toHaveClass('h-10');
  });
});
