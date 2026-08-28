import { type InputHTMLAttributes, forwardRef, useId } from 'react';
import { Label } from './Label';
import { Input } from './Input';
import { FieldError } from './FieldError';
import { cn } from '../lib/cn';

export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Field label, rendered above the input and associated via htmlFor/id. */
  label: string;
  /**
   * Validation/server error message. When present, the input is marked
   * `aria-invalid` and linked to the error text via `aria-describedby`; the
   * error text itself gets `role="alert"` so screen readers announce it.
   */
  error?: string;
  /** className applied to the wrapping <div>, not the <input>. */
  containerClassName?: string;
}

/**
 * Label + input + associated error message, wired up accessibly. Intended
 * to be spread with react-hook-form's `register(name)` — the returned ref
 * forwards to the underlying <input>.
 */
export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, id, containerClassName, className, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className={cn('flex flex-col gap-1.5', containerClassName)}>
        <Label htmlFor={inputId}>{label}</Label>
        <Input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={className}
          {...props}
        />
        {error && <FieldError id={errorId}>{error}</FieldError>}
      </div>
    );
  },
);
FormField.displayName = 'FormField';
