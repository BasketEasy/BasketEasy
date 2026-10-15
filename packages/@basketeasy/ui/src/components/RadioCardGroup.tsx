import { type ReactNode, useCallback, useRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';

/**
 * A radiogroup whose options are cards rather than dots.
 *
 * The app had one of these hand-rolled (the Vote tab's ballot) and it was the
 * single interactive control in the codebase with no focus styling at all —
 * a `role="radio"` inside a `role="radiogroup"` with every option natively
 * tabbable and no arrow-key handling, so a keyboard user tabbed through all N
 * candidates and could not see where they were.
 *
 * This owns the three things that were missing and are easy to get wrong:
 * the shared focus ring, a roving tabindex (the group is one tab stop), and
 * arrow/Home/End navigation that moves selection with focus, per the ARIA
 * radiogroup pattern.
 *
 * Options carry a `render` callback rather than a plain node because a card's
 * contents usually restyle when selected (an avatar inverting, a name going
 * bold). Passing the state down keeps that decision with the caller while the
 * primitive keeps the chrome, the roles and the keyboard model.
 */
export interface RadioCardOption<T extends string> {
  value: T;
  disabled?: boolean;
  render: (state: { selected: boolean }) => ReactNode;
}

type LabelProps =
  | { 'aria-label': string; 'aria-labelledby'?: never }
  | { 'aria-labelledby': string; 'aria-label'?: never };

export type RadioCardGroupProps<T extends string> = {
  options: ReadonlyArray<RadioCardOption<T>>;
  value: T | null;
  onChange: (value: T) => void;
  /**
   * Selected-state fill. `brand` is the rare sharp accent; `structure` the
   * organising blue-green; `choice` keeps the card on its own surface and
   * marks the pick with the blue-green rule alone — for a form choice
   * (« Avec le groupe » / « Directement à la salle ») where the options are
   * read side by side and a filled card would outweigh its sibling.
   */
  tone?: 'brand' | 'structure' | 'choice';
  /** Draws a radio dot at the start of each card — for choices that read as a form field. */
  indicator?: boolean;
  className?: string;
} & LabelProps;

type RadioCardTone = NonNullable<RadioCardGroupProps<string>['tone']>;

/**
 * Each tone declared once, both states together; `satisfies` keeps the map
 * exhaustive, so a new tone can't ship without its idle look. Every option is
 * `border-2` in both states and only the colour changes — a 1px idle border
 * growing to 2px on selection nudged the card's content and its siblings.
 */
const TONES = {
  brand: {
    selected: 'border-orange bg-orange shadow-segment-active',
    idle: 'border-border',
  },
  structure: { selected: 'border-blue-green-2 bg-sunk', idle: 'border-border' },
  choice: { selected: 'border-blue-green bg-blue-green-tint', idle: 'border-border' },
} satisfies Record<RadioCardTone, { selected: string; idle: string }>;

const radioCardVariants = cva(
  [
    'flex items-center gap-2.5 rounded-md border-2 px-3 py-2.5 text-left transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    focusRing,
  ],
  {
    variants: {
      tone: { brand: '', structure: '', choice: '' },
      selected: { true: '', false: 'bg-surface hover:bg-surface-2' },
    },
    compoundVariants: (Object.keys(TONES) as RadioCardTone[]).flatMap((tone) => [
      { tone, selected: true, class: TONES[tone].selected },
      { tone, selected: false, class: TONES[tone].idle },
    ]),
  },
);

function RadioIndicator({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
        selected ? 'border-blue-green' : 'border-border-strong',
      )}
    >
      {selected && <span className="h-2.5 w-2.5 rounded-full bg-blue-green" />}
    </span>
  );
}

const ITEM_SELECTOR = '[role="radio"]:not([aria-disabled="true"])';

export function RadioCardGroup<T extends string>({
  options,
  value,
  onChange,
  tone = 'structure',
  indicator = false,
  className,
  ...labelProps
}: RadioCardGroupProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  // Read order from the DOM rather than tracking it in state: the options are
  // the only children, so the rendered order is the authority, and this stays
  // correct if the list is filtered or reordered between renders.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step: Record<string, number | 'first' | 'last'> = {
        ArrowDown: 1,
        ArrowRight: 1,
        ArrowUp: -1,
        ArrowLeft: -1,
        Home: 'first',
        End: 'last',
      };
      const move = step[event.key];
      if (move === undefined || !groupRef.current) return;

      const items = Array.from(groupRef.current.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR));
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
      // Arrow keys move selection with focus in a radiogroup — that is the
      // pattern, not an extra: a roving focus that didn't select would leave
      // aria-checked out of step with what the user is looking at.
      const nextValue = target.dataset.value;
      if (nextValue !== undefined) onChange(nextValue as T);
    },
    [onChange],
  );

  // Exactly one option is tabbable: the selected one, or the first when
  // nothing is selected yet. Everything else is reachable by arrow key only.
  const fallbackIndex = options.findIndex((option) => !option.disabled);

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      onKeyDown={handleKeyDown}
      className={cn('flex flex-col gap-1.5', className)}
      {...labelProps}
    >
      {options.map((option, index) => {
        const selected = value === option.value;
        const tabbable = value === null ? index === fallbackIndex : selected;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            data-value={option.value}
            aria-checked={selected}
            aria-disabled={option.disabled || undefined}
            disabled={option.disabled}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={radioCardVariants({ tone, selected })}
          >
            {indicator && <RadioIndicator selected={selected} />}
            {option.render({ selected })}
          </button>
        );
      })}
    </div>
  );
}
