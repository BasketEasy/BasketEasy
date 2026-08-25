import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionHeading } from './SectionHeading';

describe('SectionHeading', () => {
  it('renders the label with its count as one accessible heading', () => {
    render(<SectionHeading count={12}>Joueuses</SectionHeading>);
    expect(screen.getByRole('heading', { name: 'Joueuses (12)' })).toBeInTheDocument();
  });

  it('omits the count when none is given', () => {
    render(<SectionHeading>Staff</SectionHeading>);
    expect(screen.getByRole('heading', { name: 'Staff' })).toBeInTheDocument();
  });
});
