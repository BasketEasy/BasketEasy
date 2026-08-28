import { useId } from 'react';
import { Label } from './Label';
import { FieldError } from './FieldError';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select';
import { cn } from '../lib/cn';

export interface SelectFieldOption {
  value: string;
  label: string;
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
  containerClassName,
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      <Label htmlFor={selectId}>{label}</Label>
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
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
