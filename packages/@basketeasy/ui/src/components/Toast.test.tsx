import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './Toast';

describe('Toast', () => {
  it('renders title and description', () => {
    render(
      <ToastProvider>
        <Toast open variant="success">
          <ToastTitle>Succès</ToastTitle>
          <ToastDescription>Profil mis à jour.</ToastDescription>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    expect(screen.getByText('Succès')).toBeInTheDocument();
    expect(screen.getByText('Profil mis à jour.')).toBeInTheDocument();
  });

  it('applies the success variant class by default', () => {
    render(
      <ToastProvider>
        <Toast open data-testid="toast-root">
          <ToastDescription>Enregistré</ToastDescription>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    expect(screen.getByTestId('toast-root')).toHaveClass('border-green-600');
  });

  it('applies the destructive variant class', () => {
    render(
      <ToastProvider>
        <Toast open variant="destructive" data-testid="toast-root">
          <ToastDescription>Erreur</ToastDescription>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    expect(screen.getByTestId('toast-root')).toHaveClass('border-red-600');
  });
});
