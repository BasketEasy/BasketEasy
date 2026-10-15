import { useState } from 'react';
import { cn } from '@basketeasy/ui/cn';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import type { EventRsvpRespondent, EventRsvpStatus } from '@basketeasy/types/events';
import { RsvpAnswerButtons } from './RsvpAnswerButtons';
import { useEventRsvpSet } from './useEventRsvpSet';
import { useEventRsvpClear } from './useEventRsvpClear';
import { getClubErrorMessage } from './clubErrorMessages';
import { useTeamActingAs } from '../guardians/useActingAs';
import { respondedByLine } from '../guardians/respondentLabel';

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
  /** Who gave the answer — optional so a call site without it still fits. */
  myRsvpRespondedBy?: EventRsvpRespondent | null;
  myRsvpRespondedAt?: string | null;
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
  // Who answered matters when it might not be the reader: a parent reading
  // their child's answer (« Répondu par vous » or by the other parent), or a
  // player whose parent answered for them. A player's own answer, read by
  // themself, needs no byline.
  const isActingForChild = useTeamActingAs(teamId) !== undefined;
  const respondent = event.myRsvpRespondedBy ?? null;
  const showRespondent =
    hasResponded && respondent !== null && (isActingForChild || !respondent.isMe);

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
    <div className={cn('flex flex-col gap-1.5', className)}>
      <RsvpAnswerButtons
        value={event.myRsvpStatus}
        onSelect={select}
        pendingValue={pendingValue}
        disabled={isPending}
        describedBy={hasResponded ? hintId : undefined}
        fullWidth={fullWidth}
        compactOnDesktop={compactOnDesktop}
      />
      {showRespondent && respondent && (
        <Text variant="meta" size="xs" className={cn(compactOnDesktop && 'lg:hidden')}>
          {respondedByLine(respondent, event.myRsvpRespondedAt ?? null)}
        </Text>
      )}
      {hasResponded && (
        <Text id={hintId} variant="meta" size="xs" className={cn(compactOnDesktop && 'lg:hidden')}>
          Touchez à nouveau votre réponse pour l&apos;annuler.
        </Text>
      )}
    </div>
  );
}
