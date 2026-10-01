import type { EventRsvpChangeEntry } from '@basketeasy/types/guest-links';
import { eventRsvpStatusLabel } from '../clubs/eventRsvpLabels';
import { respondentName } from '../guardians/respondentLabel';

const whenFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * One history line: « Présent · via lien · sam. 14 juin 14:32 ». Who did it is the
 * link, the named person, or — for an app change whose author's account is
 * gone — the app.
 */
export function rsvpChangeLine(change: EventRsvpChangeEntry): string {
  const what = change.status === null ? 'Réponse retirée' : eventRsvpStatusLabel(change.status);
  const travel =
    change.status === 'GOING' && change.travelMode === 'DIRECT' ? ' (direct à la salle)' : '';
  const who =
    change.source === 'GUEST_LINK'
      ? change.via === 'WHATSAPP'
        ? 'via lien (WhatsApp)'
        : 'via lien'
      : change.respondedBy
        ? respondentName(change.respondedBy)
        : "via l'appli";
  return `${what}${travel} · ${who} · ${whenFormatter.format(new Date(change.createdAt))}`;
}
