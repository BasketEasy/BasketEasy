import type { ReactNode } from 'react';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { Spinner } from '@basketeasy/ui/icons/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@basketeasy/ui/tooltip';
import type { EventRsvpStatus } from '@basketeasy/types/events';
import { EVENT_RSVP_STATUS_OPTIONS } from './eventRsvpLabels';

const ACTIVE_CLASSES: Record<EventRsvpStatus, string> = {
  GOING: 'border-success bg-success text-cream',
  MAYBE: 'border-gold-text bg-gold-text text-cream',
  NOT_GOING: 'border-error bg-error text-cream',
};

const ICONS: Record<EventRsvpStatus, ReactNode> = {
  GOING: (
    <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  ),
  MAYBE: (
    <>
      <circle cx="12" cy="12" r="8.5" strokeWidth={1.6} />
      <path
        d="M9.6 9.6a2.4 2.4 0 1 1 3.5 2.1c-.8.4-1.1.9-1.1 1.8"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.6" r="0.35" fill="currentColor" stroke="none" />
    </>
  ),
  NOT_GOING: (
    <path
      d="M6.5 6.5l11 11M17.5 6.5l-11 11"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

/**
 * The three answer buttons, filled by answer, with no idea where the answer
 * goes: the event page wires them to the authenticated RSVP mutations, the
 * guest page to the link's. Clicking the active answer is the caller's to
 * read as « clear ».
 */
export function RsvpAnswerButtons({
  value,
  onSelect,
  pendingValue,
  disabled,
  describedBy,
  fullWidth = false,
  compactOnDesktop = false,
}: {
  value: EventRsvpStatus | null;
  onSelect: (status: EventRsvpStatus) => void;
  /** The option mid-flight, which alone swaps to a spinner. */
  pendingValue: EventRsvpStatus | null;
  /** All three are disabled together while any write is in flight, so a double tap can't race. */
  disabled: boolean;
  describedBy?: string;
  fullWidth?: boolean;
  compactOnDesktop?: boolean;
}) {
  return (
    <TooltipProvider>
      {/* Below md the three answers always split the row into equal
            thirds, labelled with the short word only ("Oui", "Peut-être",
            "Non") — icon-only there left touch users with no reliable way to
            learn what a button means, since a hover tooltip never fires on
            tap, and an icon beside the word is what used to push "Non" onto
            a second row. From md up the full label and its icon take over;
            the tooltip is a bonus for mouse/keyboard users. */}
      <div
        role="group"
        aria-label="Ma réponse"
        className={cn('flex w-full max-w-full gap-1.5', !fullWidth && 'md:w-fit')}
      >
        {EVENT_RSVP_STATUS_OPTIONS.map((option) => {
          const active = value === option.value;
          const isThisPending = pendingValue === option.value;
          return (
            <Tooltip key={option.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={option.label}
                  aria-describedby={describedBy}
                  disabled={disabled}
                  onClick={() => onSelect(option.value)}
                  className={cn(
                    'flex min-h-11 grow items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-sm font-bold transition-colors md:px-3.5',
                    'disabled:pointer-events-none disabled:opacity-50',
                    focusRing,
                    // basis-0 so grow splits the row into three equal
                    // thirds rather than growing each button from its own
                    // label width ("Peut-être" is twice "Oui").
                    fullWidth ? 'basis-0' : 'basis-0 md:basis-auto',
                    compactOnDesktop && 'lg:w-11 lg:px-0',
                    active
                      ? cn(ACTIVE_CLASSES[option.value], 'shadow-segment-active')
                      : 'border-border-strong bg-surface-2 text-charcoal hover:bg-sunk',
                  )}
                >
                  {isThisPending ? (
                    <Spinner className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      className="hidden h-4 w-4 shrink-0 md:block"
                    >
                      {ICONS[option.value]}
                    </svg>
                  )}
                  <span className="md:hidden">{option.shortLabel}</span>
                  <span className={cn('hidden md:inline', compactOnDesktop && 'lg:hidden')}>
                    {option.label}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{option.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
