import type { RecipientSubjects } from './player-audience';

// Who a notification is about, in the reader's terms. Pure functions over a
// recipient's subjects, shared by every copy module that notifies about a
// player, so the same reader always reads the same phrasing.

/** Who one reader is told about: themself, some of their children, or both. */
export type NotificationSubject = Pick<RecipientSubjects, 'self'> & {
  children: Pick<RecipientSubjects['children'][number], 'firstName'>[];
};

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/**
 * The « pour qui » tag stored on the notification: the children's first
 * names, or null when the reader is concerned themself.
 */
export function subjectLabel(subject: NotificationSubject): string | null {
  if (subject.self || subject.children.length === 0) return null;
  return joinNames(subject.children.map((c) => c.firstName));
}

/** « Vous êtes convoqué·e », « Léo est convoqué·e », « Léo et vous êtes convoqué·es »… */
export function convocationSentence(subject: NotificationSubject): string {
  const names = subject.children.map((c) => c.firstName);
  if (names.length === 0) return 'Vous êtes convoqué·e';
  if (subject.self) return `${joinNames([...names, 'vous'])} êtes convoqué·es`;
  if (names.length === 1) return `${names[0]} est convoqué·e`;
  return `${joinNames(names)} sont convoqué·es`;
}

/**
 * A prefix for copy that isn't phrased around the reader (a cancellation, a
 * meeting point): empty when only the reader is concerned, « Pour Léo : »
 * otherwise.
 */
export function forWhomPrefix(subject: NotificationSubject): string {
  const names = subject.children.map((c) => c.firstName);
  if (names.length === 0) return '';
  return `Pour ${joinNames(subject.self ? [...names, 'vous'] : names)} : `;
}

/** The reader alone — today's copy, for callers that notify no one else. */
export const SELF_SUBJECT: NotificationSubject = { self: true, children: [] };

/**
 * « Vous lavez », « Léo lave »: who washes the jerseys, from the reader's side.
 * One duty has one holder, so a reader is never told about themself and a
 * child at once; the plural is only a safe fallback.
 */
export function jerseyDutyHolderSentence(subject: NotificationSubject): string {
  const names = subject.children.map((c) => c.firstName);
  if (names.length === 0) return 'Vous lavez';
  if (subject.self) return `${joinNames([...names, 'vous'])} lavez`;
  return names.length === 1 ? `${names[0]} lave` : `${joinNames(names)} lavent`;
}
