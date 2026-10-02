import { describe, expect, it } from 'vitest';
import { pastMatchesWindowParams, playerAgendaWindowParams, roundedNow } from './myAgendaWindow';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

describe('roundedNow', () => {
  it('floors to the previous 5 minutes, seconds and milliseconds included', () => {
    expect(roundedNow(new Date('2026-10-02T13:39:59.999Z')).toISOString()).toBe(
      '2026-10-02T13:35:00.000Z',
    );
    expect(roundedNow(new Date('2026-10-02T13:40:00.000Z')).toISOString()).toBe(
      '2026-10-02T13:40:00.000Z',
    );
  });
});

describe('agenda windows', () => {
  it('gives the same player window to two instants in the same 5-minute slot, so they share a cache entry', () => {
    const early = playerAgendaWindowParams(roundedNow(new Date('2026-10-02T13:35:01.000Z')));
    const late = playerAgendaWindowParams(roundedNow(new Date('2026-10-02T13:39:58.123Z')));

    expect(late).toEqual(early);
  });

  it('gives the same past window to two instants in the same 5-minute slot', () => {
    const early = pastMatchesWindowParams(roundedNow(new Date('2026-10-02T13:35:01.000Z')));
    const late = pastMatchesWindowParams(roundedNow(new Date('2026-10-02T13:39:58.123Z')));

    expect(late).toEqual(early);
  });

  it('rounds by default, with no argument', () => {
    const { from, to } = playerAgendaWindowParams();

    expect(new Date(from!).getTime() % (5 * 60 * 1000)).toBe(0);
    expect(new Date(to!).getTime() - new Date(from!).getTime()).toBe(14 * DAY_IN_MS);
    expect(new Date(pastMatchesWindowParams().to!).getTime() % (5 * 60 * 1000)).toBe(0);
  });

  it('keeps the player window 14 days and the past window 30 days wide', () => {
    const now = new Date('2026-10-02T13:35:00.000Z');
    const player = playerAgendaWindowParams(now);
    const past = pastMatchesWindowParams(now);

    expect(new Date(player.to!).getTime() - now.getTime()).toBe(14 * DAY_IN_MS);
    expect(now.getTime() - new Date(past.from!).getTime()).toBe(30 * DAY_IN_MS);
  });
});
