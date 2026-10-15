import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './Toast';
import { dismissToast, useToasts } from '../lib/toast-store';

/**
 * Renders every toast queued via `toast()` (see `../lib/toast-store`).
 * Mount once near the app root — call sites just import `toast` and fire it.
 */
export function Toaster() {
  const toasts = useToasts();

  return (
    <ToastProvider swipeDirection="right">
      {toasts.map((item) => (
        <Toast
          key={item.id}
          variant={item.variant}
          type={item.variant === 'destructive' ? 'foreground' : 'background'}
          role={item.variant === 'destructive' ? 'alert' : 'status'}
          open
          onOpenChange={(open) => {
            if (!open) {
              dismissToast(item.id);
            }
          }}
        >
          <div className="flex flex-1 flex-col gap-1">
            <ToastTitle>{item.title}</ToastTitle>
            <ToastDescription>{item.description}</ToastDescription>
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
