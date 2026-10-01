import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';
import { focusRing } from '../lib/focusRing';

describe('Switch', () => {
  it('is an unchecked switch by default', () => {
    render(<Switch aria-label="Rotation" />);
    const control = screen.getByRole('switch', { name: 'Rotation' });
    expect(control).toHaveAttribute('aria-checked', 'false');
  });

  it('reflects `checked` in aria-checked', () => {
    render(<Switch aria-label="Rotation" checked onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('toggles with a click, reporting the new value', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Rotation" onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('toggles from the keyboard with Space', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Rotation" onCheckedChange={onCheckedChange} />);
    await userEvent.tab();
    expect(screen.getByRole('switch')).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('does not toggle while disabled', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Rotation" disabled onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('composes the shared focus ring', () => {
    render(<Switch aria-label="Rotation" />);
    for (const token of focusRing.split(' ')) {
      expect(screen.getByRole('switch')).toHaveClass(token);
    }
  });
});
