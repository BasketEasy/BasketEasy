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
    expect(screen.getByTestId('toast-root')).toHaveClass('border-success');
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
    expect(screen.getByTestId('toast-root')).toHaveClass('border-error');
  });

  it('leaves the bottom strip tappable: the always-mounted viewport takes no pointer events, the toast itself does', () => {
    render(
      <ToastProvider>
        <Toast open data-testid="toast-root">
          <ToastDescription>Enregistré</ToastDescription>
        </Toast>
        <ToastViewport data-testid="toast-viewport" />
      </ToastProvider>,
    );
    // The viewport is a full-width box over the same strip as the fixed tab
    // bar, at a higher z-index, mounted whether or not a toast is showing —
    // so it must not intercept taps meant for the bar.
    const viewport = screen.getByTestId('toast-viewport');
    expect(viewport).toHaveClass('pointer-events-none');
    // …and it sits above the bar's clearance below the desktop breakpoint,
    // so a visible toast never covers the navigation.
    expect(viewport).toHaveClass('max-md:bottom-24');
    expect(screen.getByTestId('toast-root')).toHaveClass('pointer-events-auto');
  });
});
