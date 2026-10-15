import { render, screen } from '@testing-library/react';
import { CountBadge } from './CountBadge';

describe('CountBadge', () => {
  it('renders the count', () => {
    render(<CountBadge count={3} data-testid="pip" />);

    expect(screen.getByTestId('pip')).toHaveTextContent('3');
  });

  it('renders nothing at zero rather than an empty circle', () => {
    const { container } = render(<CountBadge count={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a negative count', () => {
    const { container } = render(<CountBadge count={-1} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('caps an oversized count so the pip cannot stretch', () => {
    render(<CountBadge count={250} data-testid="pip" />);

    expect(screen.getByTestId('pip')).toHaveTextContent('99+');
  });

  it('is hidden from assistive tech — the number reaches it through the host control name', () => {
    render(<CountBadge count={3} data-testid="pip" />);

    expect(screen.getByTestId('pip')).toHaveAttribute('aria-hidden', 'true');
  });
});
