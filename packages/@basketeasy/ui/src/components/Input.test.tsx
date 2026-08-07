import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('renders with a placeholder', () => {
    render(<Input placeholder="Nom du club" />);
    expect(screen.getByPlaceholderText('Nom du club')).toBeInTheDocument();
  });

  it('accepts typed input', async () => {
    render(<Input aria-label="club" />);
    const input = screen.getByLabelText('club');
    await userEvent.type(input, 'AS Basket');
    expect(input).toHaveValue('AS Basket');
  });

  it('is disabled when disabled prop is set', () => {
    render(<Input aria-label="club" disabled />);
    expect(screen.getByLabelText('club')).toBeDisabled();
  });
});
