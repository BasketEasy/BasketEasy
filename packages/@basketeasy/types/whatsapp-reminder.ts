// Sharing an event reminder to the team's WhatsApp group — see
// docs/superpowers/specs/2026-09-29-whatsapp-reminder-design.md and the
// Part 1 spec beside it. Shared so the settings preview and the server render
// a message identically.
import type { EventRsvpRespondent } from './events';
import { GUEST_WINDOW_DAYS } from './guest-links';

export const WHATSAPP_TEMPLATE_VARIABLES = [
  'event_name',
  'opponent',
  'event_date',
  'meeting_time',
  'meeting_place',
  'event_time',
  'location',
  'team_name',
  'link',
] as const;

export type WhatsAppTemplateVariable = (typeof WHATSAPP_TEMPLATE_VARIABLES)[number];

/** What admins read: a variable is always named by its label, never as `{key}`. */
export const WHATSAPP_TEMPLATE_VARIABLE_LABELS: Record<WhatsAppTemplateVariable, string> = {
  event_name: "Nom de l'événement",
  opponent: 'Adversaire',
  event_date: 'Date',
  meeting_time: 'Heure de RDV',
  meeting_place: 'Lieu de RDV',
  event_time: 'Heure de début',
  location: 'Lieu',
  team_name: 'Équipe',
  link: 'Lien de réponse',
};

/** `null` means « empty for this event »: the line holding it is dropped. */
export type WhatsAppTemplateVars = Record<WhatsAppTemplateVariable, string | null>;

export const WHATSAPP_TEMPLATE_MAX_LENGTH = 1000;

export const MEETING_TIME_TO_CONFIRM = 'heure à confirmer';
export const EVENT_TIME_TO_CONFIRM = 'horaire à confirmer';

export const DEFAULT_REMINDER_TEMPLATE = [
  '🏀 {event_name}, {event_date} !',
  'RDV {meeting_time} – {meeting_place}.',
  'On commence à {event_time} ({location}).',
  'Dis-nous si tu viens 👉 {link}',
].join('\n');

export const DEFAULT_UPDATE_TEMPLATE = [
  '⚠️ Changement : {event_name}, {event_date} !',
  'Nouveau RDV {meeting_time} – {meeting_place}.',
  'On commence à {event_time} ({location}).',
  'Redis-nous si tu viens 👉 {link}',
].join('\n');

export const DEFAULT_CANCELLATION_TEMPLATE =
  "❌ {event_name} du {event_date} : c'est annulé. On te tient au courant !";

/** Sample values for the settings preview, one set per event type. */
export const WHATSAPP_TEMPLATE_EXAMPLES: Record<'MATCH' | 'TRAINING', WhatsAppTemplateVars> = {
  MATCH: {
    event_name: 'Match contre ES Vertou',
    opponent: 'ES Vertou',
    event_date: 'sam. 4 oct.',
    meeting_time: '14:30',
    meeting_place: 'Parking du club',
    event_time: '15:30',
    location: 'Gymnase de la Durantière',
    team_name: 'U15 F1',
    link: 'https://kluvo.fr/r/exemple?src=wa',
  },
  TRAINING: {
    event_name: 'Entraînement',
    opponent: null,
    event_date: 'mer. 1 oct.',
    meeting_time: null,
    meeting_place: null,
    event_time: '18:30',
    location: 'Gymnase de la Durantière',
    team_name: 'U15 F1',
    link: 'https://kluvo.fr/r/exemple?src=wa',
  },
};

const TOKEN = /\{([^{}\n]*)\}/g;

function isVariable(key: string): key is WhatsAppTemplateVariable {
  return (WHATSAPP_TEMPLATE_VARIABLES as readonly string[]).includes(key);
}

function tokensOf(line: string): string[] {
  return Array.from(line.matchAll(TOKEN), (m) => m[1]);
}

/**
 * Drops every line holding a variable whose value is `null`, then replaces the
 * `{key}` tokens. No escaping: WhatsApp is plain text.
 */
export function renderTemplate(template: string, vars: WhatsAppTemplateVars): string {
  return template
    .split('\n')
    .filter((line) => tokensOf(line).every((key) => !isVariable(key) || vars[key] !== null))
    .map((line) =>
      line.replace(TOKEN, (whole, key: string) => (isVariable(key) ? (vars[key] ?? '') : whole)),
    )
    .join('\n');
}

export type WhatsAppTemplateErrorCode =
  | 'MISSING_LINK'
  | 'TOO_LONG'
  | 'UNKNOWN_VARIABLE'
  | 'LINK_ON_DROPPABLE_LINE';

export type WhatsAppTemplateValidation =
  | { ok: true }
  | { ok: false; code: WhatsAppTemplateErrorCode; variable?: string };

// A training has no opponent and no RDV, so a line holding one of these
// disappears; the link must never share a line with them.
const DROPPABLE: readonly WhatsAppTemplateVariable[] = [
  'opponent',
  'meeting_time',
  'meeting_place',
];

/**
 * A cancellation is the one template where `{link}` is optional: there is
 * nothing left to answer, so the link rules don't apply to it.
 */
export function validateTemplate(
  template: string,
  type: EventShareType = 'REMINDER',
): WhatsAppTemplateValidation {
  if (template.length > WHATSAPP_TEMPLATE_MAX_LENGTH) return { ok: false, code: 'TOO_LONG' };
  const lines = template.split('\n');
  for (const line of lines) {
    for (const key of tokensOf(line)) {
      if (!isVariable(key)) return { ok: false, code: 'UNKNOWN_VARIABLE', variable: key };
    }
  }
  if (type === 'CANCELLATION') return { ok: true };
  if (!lines.some((line) => tokensOf(line).includes('link'))) {
    return { ok: false, code: 'MISSING_LINK' };
  }
  for (const line of lines) {
    const keys = tokensOf(line);
    if (keys.includes('link') && keys.some((k) => (DROPPABLE as readonly string[]).includes(k))) {
      return { ok: false, code: 'LINK_ON_DROPPABLE_LINE' };
    }
  }
  return { ok: true };
}

const LINK_LABEL = WHATSAPP_TEMPLATE_VARIABLE_LABELS.link;

export const WHATSAPP_TEMPLATE_ERROR_MESSAGES: Record<WhatsAppTemplateErrorCode, string> = {
  MISSING_LINK: `Le message doit contenir le lien de réponse (« ${LINK_LABEL} »)`,
  TOO_LONG: `Le message est trop long (${WHATSAPP_TEMPLATE_MAX_LENGTH} caractères maximum)`,
  UNKNOWN_VARIABLE: 'Le message contient une information inconnue entre accolades',
  LINK_ON_DROPPABLE_LINE: `Le lien de réponse doit être sur sa propre ligne, sans « ${WHATSAPP_TEMPLATE_VARIABLE_LABELS.opponent} », « ${WHATSAPP_TEMPLATE_VARIABLE_LABELS.meeting_time} » ni « ${WHATSAPP_TEMPLATE_VARIABLE_LABELS.meeting_place} »`,
};

/**
 * Stable FNV-1a hash (hex) of the non-link variables, sorted by key, so the
 * server and tests agree without `node:crypto` in the browser bundle. Blind
 * to the link: a regenerated token is not a change worth an update prompt.
 */
export function contentKey(vars: WhatsAppTemplateVars): string {
  const input = WHATSAPP_TEMPLATE_VARIABLES.filter((k) => k !== 'link')
    .slice()
    .sort()
    .map((k) => `${k}=${vars[k] ?? ''}`)
    .join('\n');
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export type EventShareType = 'REMINDER' | 'UPDATE' | 'CANCELLATION';

export const DEFAULT_TEMPLATES: Record<EventShareType, string> = {
  REMINDER: DEFAULT_REMINDER_TEMPLATE,
  UPDATE: DEFAULT_UPDATE_TEMPLATE,
  CANCELLATION: DEFAULT_CANCELLATION_TEMPLATE,
};
export type EventShareState = 'SCHEDULED' | 'PENDING' | 'SENT' | 'EXPIRED' | 'VOID';
export type EventSharePlatform = 'SHARE_SHEET' | 'WA_ME' | 'COPY';

export interface EventShareStatus {
  type: EventShareType;
  state: EventShareState | 'NOT_SENT';
  /** When the scheduled reminder is (or was) due; null before one is scheduled. */
  dueAt: string | null;
  sentAt: string | null;
  sentBy: EventRsvpRespondent | null;
  platform: EventSharePlatform | null;
}

/** One line of an UPDATE's « what moved »: the value the group last read, and the current one. */
export interface EventShareChange {
  label: string;
  from: string;
  to: string;
}

export interface EventWhatsAppShare {
  guestLinkActive: boolean;
  /**
   * REMINDER always, UPDATE once one has been raised. `message` is null when the
   * guest link is off: there is nothing valid to send. `changes` is filled for a
   * pending UPDATE whose previous message is known.
   */
  shares: Array<EventShareStatus & { message: string | null; changes: EventShareChange[] }>;
}

/** A cancellation still worth sharing: the event is gone, so it lives on the team page. */
export interface TeamPendingCancellation {
  shareId: string;
  eventName: string;
  eventDate: string;
  message: string;
  status: EventShareStatus;
}

/** 3 days before the event, unless a team or an event says otherwise. */
export const DEFAULT_WA_OFFSET_MINUTES = 4320;
export const WA_OFFSET_MINUTES_MIN = 60;
/** The guest page lists only the next GUEST_WINDOW_DAYS days: a reminder further out would link to a page that doesn't show the event yet. */
export const WA_OFFSET_MINUTES_MAX = GUEST_WINDOW_DAYS * 1440;

export interface TeamWhatsAppSettings {
  /** Null means the default template, for each of the three. */
  reminderTemplate: string | null;
  updateTemplate: string | null;
  cancellationTemplate: string | null;
  reminderEnabled: boolean;
  defaultOffsetMinutes: number;
  /** False when no manager has e-mail notifications on or a push subscription: nobody would hear the reminder. */
  hasReachableManager: boolean;
}

export interface UpdateTeamWhatsAppSettingsRequest {
  reminderTemplate?: string | null;
  updateTemplate?: string | null;
  cancellationTemplate?: string | null;
  reminderEnabled?: boolean;
  defaultOffsetMinutes?: number;
}

/** Answer to the settings PATCH: the settings, and whether this save switched the guest link on. */
export interface UpdateTeamWhatsAppSettingsResponse extends TeamWhatsAppSettings {
  guestLinkEnabled: boolean;
}

/** A manager's view of one event's reminder settings; null fields inherit the team. */
export interface EventWhatsAppSettings {
  override: boolean | null;
  offsetMinutes: number | null;
  effective: { enabled: boolean; offsetMinutes: number };
}

export interface ConfirmEventShareRequest {
  platform: EventSharePlatform;
}

/** `code` of the 409 answered when sharing an event that already started. */
export const WA_SHARE_CLOSED_CODE = 'WA_SHARE_CLOSED';
/** `code` of the 409 answered when the team's guest link is off. */
export const GUEST_LINK_DISABLED_CODE = 'GUEST_LINK_DISABLED';
