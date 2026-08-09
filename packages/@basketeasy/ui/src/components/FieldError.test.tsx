import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FieldError } from './FieldError';

describe('FieldError', () => {
  it('renders the message with role alert', () => {
    render(<FieldError>Une erreur est survenue.</FieldError>);
    expect(screen.getByRole('alert')).toHaveTextContent('Une erreur est survenue.');
  });
});
