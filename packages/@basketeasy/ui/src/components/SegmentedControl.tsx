import { useCallback, useRef } from 'react';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';

/**
 * A one-of-N choice rendered as a joined row of buttons — the roster's
 * Cartes/Tableau switch, the agenda's À venir/Passés period, the events tab's
 * Agenda/Liste view mode.
 *
 * Generalised out of `TeamDetailPage`'s local `ViewModeToggle`, which was
 * shaped for exactly two options and a bare `onToggle()` callback, and which
 * lacked the keyboard model: every option was natively tabbable, so a
 * keyboard user tabbed through all N segments. This owns the roving tabindex
 * and the arrow/Home/End navigation, the same way `RadioCardGroup` does for
 * radio cards — those two are the only single-select groups in the package
 * and they now share one keyboard model.
 *
 * `role="group"` + `aria-pressed`, rather than a radiogroup: the options are
 * a view-mode switch, not a value being submitted, and each one is a button
 * that is either pressed or not. That is also what the existing call sites
 * and their tests assert.
 *
 * `onChange` fires on every activation, including a click on the already
 * pressed option — a caller holding a two-state toggle rather than a value
 * setter must compare against its own state before flipping it.
 */
export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  /** Names the group for assistive tech, e.g. "Affichage de l'effectif". */
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  /** Pressed-state fill. `structure` is the organising blue-green; `brand` the rare sharp accent. */
  tone?: 'structure' | 'brand';
  className?: string;
}

const PRESSED_CLASSES: Record<NonNullable<SegmentedControlProps<string>['tone']>, string> = {
  structure: 'bg-blue-green text-cream shadow-segment-active',
  brand: 'bg-orange-text text-cream shadow-segment-active',
};

const OPTION_SELECTOR = 'button[aria-pressed]';

export function SegmentedControl<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  tone = 'structure',
  className,
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  // Order is read from the DOM rather than tracked in state: the options are
  // the group's only children, so the rendered order is the authority.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step: Record<string, number | 'first' | 'last'> = {
        ArrowRight: 1,
        ArrowDown: 1,
        ArrowLeft: -1,
        ArrowUp: -1,
        Home: 'first',
        End: 'last',
      };
      const move = step[event.key];
      if (move === undefined || !groupRef.current) return;

      const items = Array.from(
        groupRef.current.querySelectorAll<HTMLButtonElement>(OPTION_SELECTOR),
      );
      if (items.length === 0) return;

      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        move === 'first'
          ? 0
          : move === 'last'
            ? items.length - 1
            : current < 0
              ? 0
              : (current + move + items.length) % items.length;

      event.preventDefault();
      const target = items[next];
      target.focus();
      // Selection follows focus, as it does in a radiogroup: a roving focus
      // that didn't select would leave aria-pressed out of step with what
      // the user is looking at, and the pressed segment is the only thing
      // telling them which view they are in.
      const nextValue = target.dataset.value;
      if (nextValue !== undefined) onChange(nextValue as T);
    },
    [onChange],
  );

  // Exactly one option is tabbable — the pressed one, or the first when the
  // value matches nothing. The rest are reachable by arrow key only.
  const pressedIndex = options.findIndex((option) => option.value === value);

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn('flex w-fit gap-1 rounded-lg bg-sunk p-1', className)}
    >
      {options.map((option, index) => {
        const pressed = option.value === value;
        const tabbable = pressedIndex < 0 ? index === 0 : pressed;
        return (
          <button
            key={option.value}
            type="button"
            data-value={option.value}
            aria-pressed={pressed}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-h-11 items-center justify-center whitespace-nowrap rounded-md px-3.5 text-sm font-bold transition-colors',
              focusRing,
              pressed ? PRESSED_CLASSES[tone] : 'text-muted hover:bg-surface-2 hover:text-charcoal',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
