import { useEffect, useId, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { FormField } from '@basketeasy/ui/form-field';
import { Text } from '@basketeasy/ui/text';
import { toast } from '@basketeasy/ui/toast-store';
import {
  isSameEventLocation,
  isUnknownEventLocation,
  type TeamEvent,
} from '@basketeasy/types/events';
import { ApiError } from '../api/client';
import { getClubErrorMessage } from './clubErrorMessages';
import { formatEventDayFull } from './eventDateFormat';
import {
  eventVenueFields,
  refineEventVenue,
  toEventVenue,
  venueFormValues,
} from './eventVenueSchema';
import { useEventConvocations } from './useEventConvocations';
import { useEventRsvps } from './useEventRsvps';
import { useEventUpdate } from './useEventUpdate';

const venueSchema = z
  .object(eventVenueFields)
  .superRefine((value, ctx) => refineEventVenue(value, ctx, { nameRequired: true }));

type VenueFormValues = z.infer<typeof venueSchema>;

/**
 * « Ajouter le lieu » / « Modifier le lieu »: the gym's name and address for
 * one match, edited where the venue is read. When a known venue moves, the
 * server tells the players expected there (« Changement de salle »), so the
 * dialog says so first, counting them with the same rule: convoked or GOING.
 */
export function EventVenueDialog({
  clubId,
  teamId,
  event,
  open,
  onOpenChange,
  trigger,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
}) {
  const idPrefix = useId();
  const { mutateAsync: updateEvent } = useEventUpdate(clubId, teamId);
  // Fetched once the dialog opens, not for every manager who reads the page.
  const { data: rsvps } = useEventRsvps(clubId, teamId, event.id, open);
  const { data: convocations } = useEventConvocations(clubId, teamId, event.id, open);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<VenueFormValues>({
    resolver: zodResolver(venueSchema),
    defaultValues: venueFormValues(event),
  });

  useEffect(() => {
    if (open) reset(venueFormValues(event));
  }, [open, event, reset]);

  const isKnown = !isUnknownEventLocation(event.location);
  const typedAddress = watch('location').trim();
  const willNotify =
    isKnown && typedAddress !== '' && !isSameEventLocation(event.location, typedAddress);
  // The server's audience: convoked or GOING. Hidden while either list
  // loads, never a guessed 0.
  const notifiedCount =
    rsvps && convocations
      ? new Set([
          ...convocations.filter((row) => row.convoked).map((row) => row.teamPlayerId),
          ...rsvps.filter((row) => row.status === 'GOING').map((row) => row.teamPlayerId),
        ]).size
      : null;

  const onSubmit = async (values: VenueFormValues) => {
    try {
      await updateEvent({
        eventId: event.id,
        dto: { ...toEventVenue(values, event.location), scope: 'THIS' },
      });
      toast({
        variant: 'success',
        title: 'Lieu enregistré',
        description: willNotify && notifiedCount ? notifiedToast(notifiedCount) : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      // The API's 400s here are French sentences written for this reader
      // (« Renseignez l'adresse de la salle »), clearer than the generic one.
      setError('root', {
        message:
          err instanceof ApiError && err.status === 400 && err.message
            ? err.message
            : getClubErrorMessage(err),
      });
    }
  };

  const title = isKnown ? 'Modifier le lieu' : 'Ajouter le lieu';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {event.opponentName ? `vs ${event.opponentName} · ` : ''}
            {formatEventDayFull(event.startsAt)}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="flex flex-col gap-4"
        >
          {errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          <FormField
            label="Nom de la salle"
            id={`${idPrefix}-name`}
            placeholder="Gymnase de la Trocardière"
            error={errors.locationName?.message}
            {...register('locationName')}
          />
          <FormField
            label="Adresse"
            id={`${idPrefix}-address`}
            placeholder="Rue, code postal, ville"
            hint="Utilisée pour l’itinéraire et l’heure de RDV."
            error={errors.location?.message}
            {...register('location')}
          />
          {willNotify && notifiedCount !== null && notifiedCount > 0 && (
            <Card variant="inset" tone="structure">
              <Text variant="body" size="sm">
                {notifyNotice(notifiedCount)}
              </Text>
            </Card>
          )}
          {event.isImported && (
            <Card variant="inset">
              <Text variant="meta">
                Si la FFBB publie un lieu, le prochain import le remplacera.
              </Text>
            </Card>
          )}
          <div className="flex flex-col gap-2">
            <Button type="submit" loading={isSubmitting}>
              {willNotify ? 'Enregistrer et prévenir' : 'Enregistrer'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function notifyNotice(count: number): string {
  return count > 1
    ? `Les ${count} joueurs convoqués ou présents seront prévenus du changement de salle.`
    : 'Le joueur convoqué ou présent sera prévenu du changement de salle.';
}

function notifiedToast(count: number): string {
  return count > 1 ? `${count} joueurs prévenus.` : '1 joueur prévenu.';
}
