import { type InputHTMLAttributes, type ReactNode, forwardRef, useId } from 'react';
import { Label } from './Label';
import { Input } from './Input';
import { FieldError } from './FieldError';
import { Text } from './Text';
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
  /**
   * Persistent explanation of what to type, rendered under the input and
   * linked via `aria-describedby`. For guidance that is always true of the
   * field — not for a validation result, which is `error`; the two can show
   * at once and describe different things.
   */
  hint?: string;
  /**
   * A unit read after the input (« minutes »). Rendered beside it rather than
   * inside, so a narrow numeric input keeps its full width for the digits.
   * A string is set as meta text; a control (a unit `SelectField` with
   * `hideLabel`) is rendered as is, so it lines up with the input rather than
   * with the label above it.
   */
  suffix?: ReactNode;
  /** className applied to the wrapping <div>, not the <input>. */
  containerClassName?: string;
}

/**
 * Label + input + associated error message, wired up accessibly. Intended
 * to be spread with react-hook-form's `register(name)` — the returned ref
 * forwards to the underlying <input>.
 */
export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, hint, suffix, id, containerClassName, className, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
    const input = (
      <Input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={describedBy || undefined}
        className={className}
        {...props}
      />
    );

    return (
      <div className={cn('flex flex-col gap-1.5', containerClassName)}>
        <Label htmlFor={inputId}>{label}</Label>
        {suffix ? (
          <div className="flex items-center gap-2">
            {input}
            {typeof suffix === 'string' ? (
              <Text as="span" variant="meta">
                {suffix}
              </Text>
            ) : (
              suffix
            )}
          </div>
        ) : (
          input
        )}
        {hint && (
          <Text id={hintId} variant="meta">
            {hint}
          </Text>
        )}
        {error && <FieldError id={errorId}>{error}</FieldError>}
      </div>
    );
  },
);
FormField.displayName = 'FormField';
