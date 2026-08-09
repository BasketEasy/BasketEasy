import { useSyncExternalStore } from 'react';

export type ToastVariant = 'success' | 'destructive';

export interface ToastOptions {
  variant: ToastVariant;
  title?: string;
  description?: string;
  /** Milliseconds before the toast auto-dismisses. Pass 0 to disable. */
  duration?: number;
}

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description: string;
}

const DEFAULT_DURATION_MS = 5000;

const DEFAULT_MESSAGES: Record<ToastVariant, { title: string; description: string }> = {
  success: { title: 'Succès', description: 'L’opération a été effectuée avec succès.' },
  destructive: { title: 'Erreur', description: 'Une erreur est survenue. Veuillez réessayer.' },
};

let toasts: ToastItem[] = [];
let nextId = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function toast({
  variant,
  title,
  description,
  duration = DEFAULT_DURATION_MS,
}: ToastOptions): string {
  const defaults = DEFAULT_MESSAGES[variant];
  nextId += 1;
  const id = `toast-${nextId}`;

  toasts = [
    ...toasts,
    {
      id,
      variant,
      title: title ?? defaults.title,
      description: description ?? defaults.description,
    },
  ];
  emit();

  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }

  return id;
}

export function dismissToast(id: string): void {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toasts,
  );
}
