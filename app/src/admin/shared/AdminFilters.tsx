import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Card } from '@basketeasy/ui/card';
import { FormField } from '@basketeasy/ui/form-field';
import { SegmentedControl } from '@basketeasy/ui/segmented-control';
import { SelectField } from '@basketeasy/ui/select-field';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

// Filter controls for a back-office list. They read and write the URL
// through `useAdminListParams`, which is the single source of truth: there
// is no form state to keep in sync, so these are plain controlled inputs
// rather than a react-hook-form form (nothing is submitted or validated).

/** The sentinel a SelectField uses for "no filter"; never sent to the API. */
const ALL = '__all__';

export function AdminFilterBar({ children }: { children: ReactNode }) {
  return (
    <Card variant="panel" className="flex flex-wrap items-end gap-3">
      {children}
    </Card>
  );
}

/**
 * Free text, debounced so the URL (and the query) change once typing
 * pauses, not on every keystroke. Re-seeded when the URL changes under it
 * (Back, or a preset clearing the filters).
 */
export function AdminSearchFilter({
  label,
  placeholder,
  value,
  onChange,
  hint,
}: {
  label: string;
  placeholder?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const debounced = useDebouncedValue(draft);
  // Read through refs so the write-back effect below fires only when the
  // *draft* settles. Were `value` a dependency, a preset clearing the URL
  // would re-run it with the stale debounced text and write it straight back.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  useEffect(() => {
    const next = debounced.trim();
    if (next !== (latest.current.value ?? '')) latest.current.onChange(next || undefined);
  }, [debounced]);

  return (
    <FormField
      type="search"
      label={label}
      placeholder={placeholder}
      hint={hint}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      containerClassName="min-w-60 flex-1"
    />
  );
}

export function AdminSelectFilter<T extends string>({
  label,
  allLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <SelectField
      label={label}
      options={[{ value: ALL, label: allLabel }, ...options]}
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? undefined : (next as T))}
      containerClassName="min-w-40"
    />
  );
}

/** Named views over the same list (« Bientôt effacés », « Non vérifiés »…). */
export function AdminPresets<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="max-w-full overflow-x-auto">
      <SegmentedControl ariaLabel={ariaLabel} value={value} options={options} onChange={onChange} />
    </div>
  );
}
