import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toaster } from './Toaster';
import { toast } from '../lib/toast-store';

describe('Toaster', () => {
  it('renders a toast fired via toast() with the default success message', async () => {
    render(<Toaster />);

    act(() => {
      toast({ variant: 'success' });
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'L’opération a été effectuée avec succès.',
    );
  });

  it('renders a custom message with role alert for the destructive variant', async () => {
    render(<Toaster />);

    act(() => {
      toast({ variant: 'destructive', description: 'Échec de la mise à jour.' });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Échec de la mise à jour.');
  });

  it('dismisses the toast on its own after the given duration', () => {
    // Fake timers here instead of a real setTimeout race — a short real
    // delay is inherently flaky under test-runner overhead.
    vi.useFakeTimers();
    try {
      render(<Toaster />);

      act(() => {
        toast({ variant: 'success', description: 'Court message', duration: 1000 });
      });
      expect(screen.getByText('Court message')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByText('Court message')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
