import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Loader } from './Loader';

describe('Loader', () => {
  it('renders its label with role status', () => {
    render(<Loader>Chargement...</Loader>);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement...');
  });
});
