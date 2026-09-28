import { useState } from 'react';
import { toast } from '@basketeasy/ui/toast-store';

/**
 * The open state and save flow shared by the club's and a team's settings
 * section. `submit` resolves once saved (toast + close) and rethrows a
 * failure, so the still-open dialog can show it against the form
 * (`setError('root')`), where the manager is looking.
 */
export function useMeetingSettingsEditor<T>(save: (value: T) => Promise<unknown>) {
  const [isOpen, setIsOpen] = useState(false);

  const submit = async (value: T) => {
    await save(value);
    toast({ variant: 'success', title: 'Point de rendez-vous enregistré' });
    setIsOpen(false);
  };

  return { isOpen, setIsOpen, open: () => setIsOpen(true), submit };
}
