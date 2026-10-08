import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeviceFrame } from './DeviceFrame';

const shot = { src: '/shot.webp', alt: 'Capture de Kluvo', width: 600, height: 1298 };

describe('DeviceFrame', () => {
  it('renders the screenshot with its intrinsic size, lazily by default', () => {
    render(<DeviceFrame variant="phone" {...shot} />);

    const img = screen.getByRole('img', { name: 'Capture de Kluvo' });
    expect(img).toHaveAttribute('width', '600');
    expect(img).toHaveAttribute('height', '1298');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).not.toHaveAttribute('fetchpriority');
  });

  it('loads eagerly at high priority when it is the hero', () => {
    render(<DeviceFrame variant="browser" priority {...shot} />);

    const img = screen.getByRole('img', { name: 'Capture de Kluvo' });
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });

  it('shows the address in a browser frame only', () => {
    const { rerender } = render(
      <DeviceFrame variant="browser" url="kluvo.fr/dashboard" {...shot} />,
    );
    expect(screen.getByText('kluvo.fr/dashboard')).toBeInTheDocument();

    rerender(<DeviceFrame variant="phone" url="kluvo.fr/dashboard" {...shot} />);
    expect(screen.queryByText('kluvo.fr/dashboard')).not.toBeInTheDocument();
  });

  it('owns its look through the variant', () => {
    const { container } = render(<DeviceFrame variant="phone" className="w-60" {...shot} />);

    expect(container.firstChild).toHaveClass(
      'bg-charcoal',
      'rounded-device',
      'shadow-frame-phone',
      'w-60',
    );
  });
});
