import { describe, expect, it } from 'vitest';
import { pastMatchesWindowParams, playerAgendaWindowParams } from './myAgendaWindow';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const QUARTER_HOUR_IN_MS = 15 * 60 * 1000;

describe('agenda windows', () => {
  it('gives the same player window to two instants in the same quarter hour, so they share a cache entry', () => {
    const early = playerAgendaWindowParams(new Date('2026-10-02T13:30:01.000Z'));
    const late = playerAgendaWindowParams(new Date('2026-10-02T13:44:58.123Z'));

    expect(late).toEqual(early);
  });

  it('gives the same past window to two instants in the same quarter hour', () => {
    const early = pastMatchesWindowParams(new Date('2026-10-02T13:30:01.000Z'));
    const late = pastMatchesWindowParams(new Date('2026-10-02T13:44:58.123Z'));

    expect(late).toEqual(early);
  });

  it('snaps by default, with no argument', () => {
    const { from, to } = playerAgendaWindowParams();

    expect(new Date(from!).getTime() % QUARTER_HOUR_IN_MS).toBe(0);
    expect(new Date(to!).getTime() % QUARTER_HOUR_IN_MS).toBe(0);
    expect(new Date(pastMatchesWindowParams().to!).getTime() % QUARTER_HOUR_IN_MS).toBe(0);
  });

  it('keeps the player window 14 days and the past window 30 days wide on a quarter-hour bound', () => {
    const now = new Date('2026-10-02T13:30:00.000Z');
    const player = playerAgendaWindowParams(now);
    const past = pastMatchesWindowParams(now);

    expect(new Date(player.to!).getTime() - now.getTime()).toBe(14 * DAY_IN_MS);
    expect(now.getTime() - new Date(past.from!).getTime()).toBe(30 * DAY_IN_MS);
  });
});
