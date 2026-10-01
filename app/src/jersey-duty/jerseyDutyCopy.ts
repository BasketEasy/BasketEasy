import type { Gender } from '@basketeasy/types/teams';
import type { JerseyDutyDetail, JerseyDutyStatus } from '@basketeasy/types/jersey-duty';
import { EVENT_RSVP_STATUS_OPTIONS } from '../clubs/eventRsvpLabels';

/**
 * Every gendered string of the jersey wash screens, in one place so no call
 * site writes one. Two inputs, two rules:
 *
 * - **collective nouns** (« joueuses convoquées et présentes ») follow the
 *   team's gender, since they name the whole group;
 * - **pronouns about one person** (« Il ne peut pas ») follow that person's
 *   own `gender`, falling back on the team's when the profile doesn't say.
 *
 * Pure on purpose: the copy is unit-tested without rendering anything.
 */

type PersonGender = Gender | null | undefined;

const goingLabel =
  EVENT_RSVP_STATUS_OPTIONS.find((option) => option.value === 'GOING')?.label ?? 'Présent';

function isFeminine(gender: Gender): boolean {
  return gender === 'WOMEN';
}

/** The gender a pronoun about one person agrees with. */
function agreement(personGender: PersonGender, teamGender: Gender): Gender {
  return personGender ?? teamGender;
}

/** « Prénom N. », the form every peer is shown in. */
export function dutyPersonName(person: { firstName: string; lastName: string }): string {
  const initial = person.lastName.trim().charAt(0).toUpperCase();
  return initial ? `${person.firstName} ${initial}.` : person.firstName;
}

/** « 1 lavage » / « 2 lavages » — a count of turns. */
export function turnsLabel(turns: number): string {
  return `${turns} ${turns > 1 ? 'lavages' : 'lavage'}`;
}

/** « 1 lavage cette saison, le moins de l'équipe. » — the suffix only when `isFewest`. */
export function suggestionMeta(turns: number, isFewest: boolean): string {
  return `${turnsLabel(turns)} cette saison${isFewest ? ', le moins de l’équipe' : ''}.`;
}

/** « Parmi 8 joueuses convoquées et présentes, 1 exemptée. » */
export function poolSummary(pool: JerseyDutyDetail['pool'], teamGender: Gender): string {
  const feminine = isFeminine(teamGender);
  const count = pool.convokedGoingCount;
  const noun = feminine ? 'joueuse' : 'joueur';
  const plural = count > 1 ? 's' : '';
  const called = `${feminine ? 'convoquée' : 'convoqué'}${plural} et ${feminine ? 'présente' : 'présent'}${plural}`;
  const head = `Parmi ${count} ${noun}${plural} ${called}`;
  if (pool.exemptedCount === 0) return `${head}.`;
  const exempt = `${feminine ? 'exemptée' : 'exempté'}${pool.exemptedCount > 1 ? 's' : ''}`;
  return `${head}, ${pool.exemptedCount} ${exempt}.`;
}

/** « Elle apparaîtra dès qu'une joueuse convoquée aura répondu « Présent ». » */
export function emptyPoolBody(teamGender: Gender): string {
  const feminine = isFeminine(teamGender);
  return `Elle apparaîtra dès qu’${feminine ? 'une joueuse convoquée' : 'un joueur convoqué'} aura répondu « ${goingLabel} ».`;
}

/** The pool's collective noun in the swap dialog's intro. */
function poolNoun(teamGender: Gender): string {
  return isFeminine(teamGender)
    ? 'joueuses convoquées et présentes'
    : 'joueurs convoqués et présents';
}

/** « (exemptée) » after a name in the manager's roster picker. */
export function exemptSuffix(teamGender: Gender): string {
  return isFeminine(teamGender) ? '(exemptée)' : '(exempté)';
}

/** The sheet's intro. `childName` is set when a guardian proposes for their child. */
export function swapIntro(teamGender: Gender, childName: string | null): string {
  const place = childName ? `à la place de ${childName}` : 'à votre place';
  return `À qui proposer de laver les maillots ${place} ? Seules les ${poolNoun(teamGender)} apparaissent.`;
}

/** « Vous restez responsable tant qu'elle n'a pas accepté. » — `elle` is the swap target. */
export function swapFootnote(teamGender: Gender, childName: string | null): string {
  const target = isFeminine(teamGender) ? 'elle' : 'il';
  const subject = childName ? `${childName} reste responsable` : 'Vous restez responsable';
  return `${subject} tant qu’${target} n’a pas accepté.`;
}

/** « C'est votre tour » / « Au tour de Léo ». */
export function turnTitle(childName: string | null): string {
  return childName ? `Au tour de ${childName}` : 'C’est votre tour';
}

/** « C'est noté » / « C'est noté pour Léo ». */
export function acceptLabel(childName: string | null): string {
  return childName ? `C’est noté pour ${childName}` : 'C’est noté';
}

/** « Je ne peux pas » / « Il ne peut pas ». */
export function declineLabel(
  childName: string | null,
  personGender: PersonGender,
  teamGender: Gender,
): string {
  if (!childName) return 'Je ne peux pas';
  return `${isFeminine(agreement(personGender, teamGender)) ? 'Elle' : 'Il'} ne peut pas`;
}

/** « Je ne peux plus » / « Il ne peut plus » — once the duty was accepted. */
export function withdrawLabel(
  childName: string | null,
  personGender: PersonGender,
  teamGender: Gender,
): string {
  if (!childName) return 'Je ne peux plus';
  return `${isFeminine(agreement(personGender, teamGender)) ? 'Elle' : 'Il'} ne peut plus`;
}

/** The name on the persona's own row: « Vous », or the child's first name. */
export function ownRowName(childName: string | null): string {
  return childName ?? 'Vous';
}

/** « Vous rapportez le sac propre au prochain match. » / « Accepté par Sophie M. ». */
export function acceptedLine(
  acceptedBy: JerseyDutyDetail['acceptedBy'],
  childName: string | null,
): string {
  const by = acceptedBy
    ? [acceptedBy.firstName, acceptedBy.lastInitial ? `${acceptedBy.lastInitial}.` : null]
        .filter(Boolean)
        .join(' ')
    : '';
  if (!childName && (!acceptedBy || acceptedBy.isMe)) {
    return 'Vous rapportez le sac propre au prochain match.';
  }
  if (acceptedBy?.isMe) return 'Accepté par vous';
  return by ? `Accepté par ${by}` : 'Accepté';
}

/** What a holder's row says once the match has started, or for a reader who cannot act. */
export function holderStatus(
  status: JerseyDutyStatus,
  locked: boolean,
  nextMatchDay: string | null,
): { description: string; badge: string; tone: 'structure' | 'success' | 'muted' | 'brand' } {
  if (status === 'VOIDED') {
    return { description: 'Ce tour ne compte pas.', badge: 'Annulé', tone: 'muted' };
  }
  if (status === 'DONE') {
    return { description: 'Le jeu propre est revenu.', badge: 'Fait', tone: 'success' };
  }
  if (locked) {
    return {
      description: nextMatchDay
        ? `Ramène le sac au match du ${nextMatchDay}`
        : 'Lave les maillots après ce match.',
      badge: 'En cours',
      tone: 'structure',
    };
  }
  if (status === 'ACCEPTED') {
    return { description: 'Lavage confirmé.', badge: 'Noté', tone: 'success' };
  }
  return {
    description: 'Lavage assigné, pas encore confirmé.',
    badge: 'À confirmer',
    tone: 'muted',
  };
}
