import { describe, expect, it } from 'vitest';
import type { EventRsvpChangeEntry } from '@basketeasy/types/guest-links';
import { rsvpChangeLine } from './rsvpHistoryLabels';

const at = new Date(2026, 9, 3, 14, 32).toISOString();
const change = (o: Partial<EventRsvpChangeEntry>): EventRsvpChangeEntry => ({
  status: 'GOING',
  travelMode: null,
  source: 'GUEST_LINK',
  via: null,
  respondedBy: null,
  createdAt: at,
  ...o,
});

describe('rsvpChangeLine', () => {
  it('names the link as the source of a guest change', () => {
    expect(rsvpChangeLine(change({}))).toMatch(/^Présent · via lien · sam\. 14:32$/);
  });

  it('names WhatsApp when the answer came through the shared message', () => {
    expect(rsvpChangeLine(change({ via: 'WHATSAPP' }))).toMatch(
      /^Présent · via lien \(WhatsApp\) · sam\. 14:32$/,
    );
  });

  it('names the person behind an app change', () => {
    const line = rsvpChangeLine(
      change({
        status: 'NOT_GOING',
        source: 'APP',
        respondedBy: { firstName: 'Sophie', lastInitial: 'M', isMe: false },
      }),
    );
    expect(line).toMatch(/^Absent · Sophie M\. · /);
  });

  it('falls back to the app when the author’s account is gone', () => {
    expect(rsvpChangeLine(change({ source: 'APP' }))).toContain("via l'appli");
  });

  it('reads a clear as the answer being withdrawn', () => {
    expect(rsvpChangeLine(change({ status: null }))).toMatch(/^Réponse retirée · via lien/);
  });

  it('mentions going straight to the gym', () => {
    expect(rsvpChangeLine(change({ travelMode: 'DIRECT' }))).toContain('direct à la salle');
  });
});
