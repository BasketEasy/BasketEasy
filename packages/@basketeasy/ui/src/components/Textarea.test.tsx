import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('accepts typed input', async () => {
    render(<Textarea aria-label="notes" />);
    const textarea = screen.getByLabelText('notes');
    await userEvent.type(textarea, 'Bonne saison');
    expect(textarea).toHaveValue('Bonne saison');
  });
});
