import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('renders unchecked by default', () => {
    render(<Checkbox aria-label="présent" />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('calls onCheckedChange when toggled', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="présent" onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
