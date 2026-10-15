import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select';

describe('Select', () => {
  it('renders the trigger with a placeholder', () => {
    render(
      <Select>
        <SelectTrigger aria-label="équipe">
          <SelectValue placeholder="Choisir une équipe" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="u13">U13</SelectItem>
          <SelectItem value="u15">U15</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByText('Choisir une équipe')).toBeInTheDocument();
  });
});
