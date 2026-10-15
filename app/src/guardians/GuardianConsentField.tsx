import { Checkbox } from '@basketeasy/ui/checkbox';
import { FieldError } from '@basketeasy/ui/field-error';
import { Label } from '@basketeasy/ui/label';
import { guardianConsentLabel } from './guardianConsent';

/** The parental-consent checkbox, shown only when the child is a minor. */
export function GuardianConsentField({
  id,
  childFirstName,
  checked,
  onCheckedChange,
  error,
}: {
  id: string;
  childFirstName: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">Autorisation parentale</legend>
      <div className="flex items-start gap-2">
        <Checkbox
          id={id}
          checked={checked}
          aria-invalid={error ? true : undefined}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <Label htmlFor={id}>{guardianConsentLabel(childFirstName)}</Label>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </fieldset>
  );
}
