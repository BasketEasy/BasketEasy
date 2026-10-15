import { useId } from 'react';
import { Label } from './Label';
import { FieldError } from './FieldError';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select';
import { cn } from '../lib/cn';

export interface SelectFieldOption {
  value: string;
  label: string;
  /**
   * Greys the option out and blocks selecting it. For a value that is
   * legitimate in general but already taken elsewhere in the same form — the
   * server rejects it anyway, so the field shouldn't offer it.
   */
  disabled?: boolean;
}

export interface SelectFieldProps {
  /** Field label, rendered above the trigger and associated via htmlFor/id. */
  label: string;
  id?: string;
  options: SelectFieldOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /**
   * Validation/server error message. When present, the trigger is marked
   * `aria-invalid` and linked to the error text via `aria-describedby`; the
   * error text itself gets `role="alert"` so screen readers announce it.
   */
  error?: string;
  disabled?: boolean;
  /**
   * Hides the label visually while keeping it for assistive tech. For a
   * select whose meaning is already carried by adjacent content — a row whose
   * left-hand cell names what the select is choosing for — where a repeated
   * visible label would be noise on screen but is still the only accessible
   * name the control has.
   */
  hideLabel?: boolean;
  /** className applied to the wrapping <div>, not the trigger. */
  containerClassName?: string;
}

/**
 * Label + Radix Select + associated error message, wired up accessibly —
 * the Select equivalent of `FormField`. Intended for use with a controlled
 * `value`/`onValueChange` pair (react-hook-form's `Controller`, or local
 * state).
 */
export function SelectField({
  label,
  id,
  options,
  value,
  onValueChange,
  placeholder,
  error,
  disabled,
  hideLabel,
  containerClassName,
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      <Label htmlFor={selectId} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          id={selectId}
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
