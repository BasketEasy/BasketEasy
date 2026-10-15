import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FormField } from './FormField';

describe('FormField', () => {
  it('associates the label with the input', () => {
    render(<FormField label="Adresse e-mail" id="email" />);
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
  });

  it('generates a stable id when none is provided, still associating label and input', () => {
    render(<FormField label="Mot de passe" />);
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
  });

  it('has no aria-invalid/aria-describedby and renders no error when error is absent', () => {
    render(<FormField label="Adresse e-mail" id="email" />);
    const input = screen.getByLabelText('Adresse e-mail');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks the input invalid and announces the error message when error is present', () => {
    render(<FormField label="Adresse e-mail" id="email" error="Adresse email invalide" />);
    const input = screen.getByLabelText('Adresse e-mail');
    const alert = screen.getByRole('alert');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', alert.id);
    expect(alert).toHaveTextContent('Adresse email invalide');
  });

  it('describes the input with its hint', () => {
    render(<FormField label="Nom" id="name" hint="Le nom de la personne, pas du club." />);
    const input = screen.getByLabelText('Nom');

    expect(screen.getByText('Le nom de la personne, pas du club.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-describedby', 'name-hint');
  });

  it('points at the hint and the error together when both are present', () => {
    render(<FormField label="Nom" id="name" hint="Prénom et nom." error="Nom requis" />);
    const input = screen.getByLabelText('Nom');

    // Both describe the field and say different things, so neither replaces
    // the other.
    expect(input).toHaveAttribute('aria-describedby', 'name-hint name-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Nom requis');
    expect(screen.getByText('Prénom et nom.')).toBeInTheDocument();
  });

  it('accepts typed input and forwards other input props', async () => {
    const user = userEvent.setup();
    render(<FormField label="Adresse e-mail" id="email" type="email" autoComplete="email" />);
    const input = screen.getByLabelText('Adresse e-mail');

    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('autocomplete', 'email');

    await user.type(input, 'a@b.com');
    expect(input).toHaveValue('a@b.com');
  });

  it('renders a suffix beside the input, outside the input itself', () => {
    render(<FormField label="Arrivée" id="buffer" type="number" suffix="minutes" />);
    const input = screen.getByLabelText('Arrivée');
    const suffix = screen.getByText('minutes');

    expect(input).not.toContainElement(suffix);
    // Same row as the input, not below it with the hint and error.
    expect(input.parentElement).toContainElement(suffix);
  });

  it('keeps the suffix out of the label, so the accessible name is the label alone', () => {
    render(<FormField label="Arrivée" id="buffer" suffix="minutes" />);

    expect(screen.getByRole('textbox', { name: 'Arrivée' })).toBeInTheDocument();
  });

  it('renders no suffix wrapper when no suffix is given', () => {
    render(<FormField label="Arrivée" id="buffer" />);
    const input = screen.getByLabelText('Arrivée');

    // The input sits directly in the field column, beside its label.
    expect(input.parentElement).toContainElement(screen.getByText('Arrivée'));
  });
});
