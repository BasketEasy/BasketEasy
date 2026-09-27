import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Divider } from './Divider';

describe('Divider', () => {
  it('is decorative and horizontal by default', () => {
    const { container } = render(<Divider />);
    const line = container.firstElementChild!;
    expect(line).toHaveAttribute('aria-hidden', 'true');
    expect(line).toHaveClass('h-px', 'w-full', 'bg-border');
  });

  it('draws a vertical brand line inside a brand-toned container', () => {
    const { container } = render(<Divider orientation="vertical" tone="brand" />);
    expect(container.firstElementChild).toHaveClass('w-px', 'bg-orange/40');
  });
});
