import { useState, type ReactNode } from 'react';
import { cn } from '@basketeasy/ui/cn';
import { Text } from '@basketeasy/ui/text';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { Spinner } from '@basketeasy/ui/icons/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@basketeasy/ui/tooltip';
import { toast } from '@basketeasy/ui/toast-store';
import type { EventRsvpStatus } from '@basketeasy/types/events';
import { EVENT_RSVP_STATUS_OPTIONS } from './eventRsvpLabels';
import { useEventRsvpSet } from './useEventRsvpSet';
import { useEventRsvpClear } from './useEventRsvpClear';
import { getClubErrorMessage } from './clubErrorMessages';

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

// 409 isn't a realistic outcome of an upsert/delete RSVP write, but the
// shared default 409 message is worded for club-membership forms — pass a
// status-agnostic fallback here rather than risk a nonsensical string.
const GENERIC_FALLBACK = 'Une erreur est survenue. Merci de réessayer.';

/**
 * The only two fields this control reads off an event. Deliberately narrower
 * than `TeamEvent`: the dashboard agenda hands it a `MyAgendaEvent`, a
 * different shape carrying the same two facts under a different id field, and
 * a prop typed to the intersection lets both call sites in without widening
 * either payload type or casting at the call site.
 */
export interface EventRsvpControlEvent {
  id: string;
  myRsvpStatus: EventRsvpStatus | null;
}

/**
 * Inline tri-state RSVP toggle for a rostered team member — single-field,
 * non-destructive, high-frequency, so an inline control rather than a
 * Dialog per CLAUDE.md's "Modals vs. inline editing" guidance. Clicking the
 * already-active option clears the response back to "no response yet".
 */
export function EventRsvpControl({
  clubId,
  teamId,
  event,
  compactOnDesktop = false,
  fullWidth = false,
  className,
}: {
  clubId: string;
  teamId: string;
  event: EventRsvpControlEvent;
  /**
   * Stretches the group to its container and shares the width equally between
   * the three options — what the decision band on the event page needs, where
   * this is the one action on the card and a thumb reaching the right-hand
   * option should not have to aim. Layout only: no colour, size or weight
   * changes with it.
   */
  fullWidth?: boolean;
  /** Layout classes for the wrapper (margins, alignment). Composition only. */
  className?: string;
  /**
   * Drops to an icon-only rendering (no short/full label, no hint line) at
   * the `lg` breakpoint and up — used by the agenda card's single-line
   * desktop row, where the labelled control is too wide to sit alongside
   * badges, location, and action buttons on one line. Below `lg` the
   * control renders exactly as it does everywhere else (icon + short label
   * under `md`, icon + full label from `md` up), since there's no
   * single-line constraint on a stacked mobile/tablet card. The touch
   * target stays `min-h-11` at every breakpoint regardless.
   */
  compactOnDesktop?: boolean;
}) {
  // Tracks which option is mid-flight so only that button swaps to a
  // spinner — the other two stay static even though all three are disabled
  // together to prevent a double-submit race.
  const [pendingValue, setPendingValue] = useState<EventRsvpStatus | null>(null);
  const { mutate: setRsvp, isPending: isSetting } = useEventRsvpSet(clubId, teamId);
  const { mutate: clearRsvp, isPending: isClearing } = useEventRsvpClear(clubId, teamId);
  const isPending = isSetting || isClearing;
  const hasResponded = event.myRsvpStatus !== null;
  const hintId = `rsvp-hint-${event.id}`;

  // No success toast here: the segmented control's own highlighted state is
  // the feedback, and RSVP is a frequent, low-stakes action — a toast on
  // every click would be noise. A failure still needs a toast, though,
  // since nothing else in the UI would otherwise reveal that the click
  // didn't stick.
  const select = (status: EventRsvpStatus) => {
    setPendingValue(status);
    const onSettled = () => setPendingValue(null);
    const onError = (err: unknown) =>
      toast({
        variant: 'destructive',
        description: getClubErrorMessage(err, { 409: GENERIC_FALLBACK }),
      });
    if (event.myRsvpStatus === status) {
      clearRsvp({ eventId: event.id }, { onError, onSettled });
    } else {
      setRsvp({ eventId: event.id, status }, { onError, onSettled });
    }
  };

  return (
    <TooltipProvider>
      <div className={cn('flex flex-col gap-1.5', className)}>
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
            const active = event.myRsvpStatus === option.value;
            const isThisPending = pendingValue === option.value;
            return (
              <Tooltip key={option.value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={option.label}
                    aria-describedby={hasResponded ? hintId : undefined}
                    disabled={isPending}
                    onClick={() => select(option.value)}
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
        {hasResponded && (
          <Text
            id={hintId}
            variant="meta"
            size="xs"
            className={cn(compactOnDesktop && 'lg:hidden')}
          >
            Touchez à nouveau votre réponse pour l&apos;annuler.
          </Text>
        )}
      </div>
    </TooltipProvider>
  );
}
