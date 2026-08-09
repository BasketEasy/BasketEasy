import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectField } from './SelectField';

const options = [
  { value: 'u13', label: 'U13' },
  { value: 'u15', label: 'U15' },
];

describe('SelectField', () => {
  it('associates the label with the trigger', () => {
    render(
      <SelectField label="Catégorie" id="category" options={options} onValueChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Catégorie')).toBeInTheDocument();
  });

  it('generates a stable id when none is provided, still associating label and trigger', () => {
    render(<SelectField label="Catégorie" options={options} onValueChange={vi.fn()} />);
    expect(screen.getByLabelText('Catégorie')).toBeInTheDocument();
  });

  it('shows the placeholder when no value is selected', () => {
    render(
      <SelectField
        label="Catégorie"
        id="category"
        options={options}
        placeholder="Choisir une catégorie"
        onValueChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Choisir une catégorie')).toBeInTheDocument();
  });

  it('has no aria-invalid/aria-describedby and renders no error when error is absent', () => {
    render(
      <SelectField label="Catégorie" id="category" options={options} onValueChange={vi.fn()} />,
    );
    const trigger = screen.getByLabelText('Catégorie');
    expect(trigger).toHaveAttribute('aria-invalid', 'false');
    expect(trigger).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks the trigger invalid and announces the error message when error is present', () => {
    render(
      <SelectField
        label="Catégorie"
        id="category"
        options={options}
        error="Catégorie requise"
        onValueChange={vi.fn()}
      />,
    );
    const trigger = screen.getByLabelText('Catégorie');
    const alert = screen.getByRole('alert');

    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAttribute('aria-describedby', alert.id);
    expect(alert).toHaveTextContent('Catégorie requise');
  });

  it('renders the label for the selected value', () => {
    render(
      <SelectField
        label="Catégorie"
        id="category"
        options={options}
        value="u15"
        onValueChange={vi.fn()}
      />,
    );
    expect(screen.getByText('U15')).toBeInTheDocument();
  });
});
