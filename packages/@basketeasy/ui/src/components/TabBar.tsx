import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, forwardRef } from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';
import { Text } from './Text';
import { CountBadge } from './CountBadge';

/**
 * The bottom tab bar's shell — a row of icon-over-label targets pinned to
 * the bottom of the viewport, which is where a thumb is when a phone is held
 * low in a badly-lit gym.
 *
 * Presentational only: it knows nothing about routes, roles or which item is
 * current. `TabBarItem`'s `asChild` takes a router `NavLink`, so navigation
 * stays in `app/` and the look stays here — the same split `Button` and
 * `TextLink` already use.
 *
 * `position: sticky`, not `fixed`: a `fixed` bottom bar is pinned to the
 * *layout* viewport, and iOS Safari's own chrome (address bar, bottom
 * toolbar) can auto-hide to reveal more of the *visual* viewport without the
 * layout viewport growing to match — the fixed bar then stays put at the old,
 * shorter bottom, leaving a gap of page background beneath it. A `sticky`
 * element sitting last in a full-height flex column (see `ProtectedRoute`) is
 * still in normal document flow, so it tracks the real, current bottom
 * instead.
 *
 * `safe-area-bottom` (declared in the app's stylesheet next to
 * `safe-area-top`, which the headers use) keeps the row clear of the iOS home
 * indicator. Height is not fixed: every item is `min-h-11`, the 44px floor,
 * and the row is as tall as its content needs.
 */
export interface TabBarProps extends HTMLAttributes<HTMLElement> {
  /** Names the landmark, e.g. "Navigation principale". */
  ariaLabel: string;
  children: ReactNode;
}

export const TabBar = forwardRef<HTMLElement, TabBarProps>(
  ({ ariaLabel, className, children, ...props }, ref) => (
    <nav
      ref={ref}
      aria-label={ariaLabel}
      className={cn(
        'safe-area-bottom sticky bottom-0 z-30 grid auto-cols-fr grid-flow-col',
        'border-t border-border bg-surface',
        className,
      )}
      {...props}
    >
      {children}
    </nav>
  ),
);
TabBar.displayName = 'TabBar';

export interface TabBarItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Sized by the caller (`h-5 w-5` in the bar), like every other icon call
   * site in the repo — sizing is composition. Colour is not: the icon takes
   * `tone="inherit"` and follows the item's active/idle text colour.
   */
  icon: ReactNode;
  label: string;
  /** An outstanding count — answers owed, items to handle. Zero renders nothing. */
  count?: number;
  active?: boolean;
  /**
   * Render a caller-supplied element (a `NavLink`) instead of a button. The
   * inherited `disabled` attribute only applies to the button form — the
   * shape a slot the product has reserved but cannot route yet takes.
   */
  asChild?: boolean;
}

const itemClasses = (active: boolean) =>
  cn(
    'flex min-h-11 flex-col items-center justify-center gap-1 px-1 py-2 no-underline transition-colors',
    focusRing,
    // A slot the product has reserved but cannot route yet renders as a
    // disabled button rather than a link to somewhere it isn't: dimmed so it
    // never reads as tappable, and left to the DS to express, since a call
    // site may not name a look of its own.
    'disabled:pointer-events-none disabled:opacity-50',
    active
      ? 'bg-orange-tint text-orange-text shadow-nav-active-top'
      : 'text-muted hover:bg-surface-2',
  );

export const TabBarItem = forwardRef<HTMLButtonElement, TabBarItemProps>(
  ({ icon, label, count, active = false, asChild = false, className, children, ...props }, ref) => {
    const showCount = count !== undefined && count > 0;
    // The pip is a graphic; the number it carries has to reach a screen
    // reader some other way, so it goes into the item's own name.
    const accessibleName = showCount ? `${label} (${count})` : undefined;

    const content = (
      <>
        <span className="relative flex items-center justify-center">
          {icon}
          {/* Positioning is the call site's (it overlaps *this* icon); the
              look is CountBadge's, shared with the header's bell. */}
          <CountBadge count={count ?? 0} className="absolute -right-3 -top-1" />
        </span>
        <Text as="span" variant="label" size="xs" tone="inherit">
          {label}
        </Text>
      </>
    );

    const shared = {
      className: cn(itemClasses(active), className),
      'aria-label': accessibleName,
      'aria-current': active ? ('page' as const) : undefined,
    };

    if (asChild) {
      // Slottable, not a bare Slot: the item's content is the component's,
      // not the caller's, so it has to become the children of the element
      // the caller passed. A bare `<Slot>` with both the NavLink and this
      // content as siblings is two children, which is the crash the Parquet
      // revamp already hit once with Slot.
      return (
        <Slot ref={ref} {...shared} {...props}>
          <Slottable>{children}</Slottable>
          {content}
        </Slot>
      );
    }

    return (
      <button ref={ref} type="button" {...shared} {...props}>
        {content}
      </button>
    );
  },
);
TabBarItem.displayName = 'TabBarItem';
