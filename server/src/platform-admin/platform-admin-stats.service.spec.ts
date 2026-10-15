import { PlatformAdminStatsService, rangeWindow, ratio } from './platform-admin-stats.service';
import type { PrismaService } from '../prisma/prisma.service';

// The aggregate queries themselves are SQL and Prisma filters: they were run
// against a real Postgres (seeded CTC team, guardian answer, stale route)
// while this was written. What is pure is pinned down here.

describe('platform-admin stats helpers', () => {
  const now = new Date('2026-09-28T12:00:00Z');

  it('ends every range now', () => {
    expect(rangeWindow('7d', now, null)).toEqual({
      from: new Date('2026-09-21T12:00:00Z'),
      to: now,
    });
    expect(rangeWindow('90d', now, null).from).toEqual(new Date('2026-06-30T12:00:00Z'));
  });

  it('starts the season on 1 September, the FFBB way', () => {
    expect(rangeWindow('season', now, null).from).toEqual(new Date('2026-09-01T00:00:00Z'));
    expect(rangeWindow('season', new Date('2026-08-15T00:00:00Z'), null).from).toEqual(
      new Date('2025-09-01T00:00:00Z'),
    );
  });

  it('starts « all » at the first club, or now on an empty platform', () => {
    const first = new Date('2024-09-04T10:00:00Z');
    expect(rangeWindow('all', now, first).from).toBe(first);
    expect(rangeWindow('all', now, null).from).toBe(now);
  });

  it('never turns nothing-to-divide-by into 0 %', () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(0, 4)).toBe(0);
    expect(ratio(1, 4)).toBe(0.25);
  });
});

describe('PlatformAdminStatsService.sharing', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  const from = new Date('2026-09-01T00:00:00Z');
  const inRange = { gte: from, lt: now };

  type Where = Record<string, unknown>;

  const build = () => {
    const prisma = {
      team: { count: jest.fn().mockResolvedValue(3) },
      eventRsvp: {
        count: jest
          .fn()
          .mockImplementation(({ where }: { where: Where }) =>
            Promise.resolve(where.source === 'GUEST_LINK' ? 2 : 8),
          ),
      },
      eventShare: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new PlatformAdminStatsService(prisma as unknown as PrismaService);
    const sharing = (scope: { team: object; event: object }) =>
      (
        service as unknown as {
          sharing: (
            scope: unknown,
            from: Date,
            to: Date,
            now: Date,
          ) => Promise<{ guestLinks: unknown; whatsapp: unknown }>;
        }
      ).sharing(scope, from, now, now);
    const shareWheres = () =>
      prisma.eventShare.count.mock.calls.map(([arg]: [{ where: Where }]) => arg.where);
    return { prisma, sharing, shareWheres };
  };

  it('counts shares by state, with the window on sent and expired only', async () => {
    const { prisma, sharing, shareWheres } = build();
    prisma.eventShare.count.mockImplementation(({ where }: { where: Where }) =>
      Promise.resolve(
        where.dueAt
          ? 0
          : ({ SENT: 5, PENDING: 4, SCHEDULED: 7, EXPIRED: 2 } as Record<string, number>)[
              where.state as string
            ],
      ),
    );

    const result = await sharing({ team: {}, event: {} });

    expect(result.whatsapp).toEqual({
      teamsEnabled: 3,
      sent: 5,
      pending: 4,
      scheduled: 7,
      expired: 2,
      overdue: 0,
    });
    expect(shareWheres()).toContainEqual({ team: {}, state: 'SENT', sentAt: inRange });
    expect(shareWheres()).toContainEqual({ team: {}, state: 'EXPIRED', updatedAt: inRange });
    expect(shareWheres()).toContainEqual({ team: {}, state: 'PENDING' });
    expect(shareWheres()).toContainEqual({ team: {}, state: 'SCHEDULED' });
  });

  it('scopes every share count to the club when one is picked', async () => {
    const { prisma, sharing, shareWheres } = build();
    const team = { clubTeams: { some: { clubId: 'club-1' } } };

    await sharing({ team, event: { team } });

    expect(shareWheres()).toHaveLength(5);
    for (const where of shareWheres()) {
      expect(where.team).toBe(team);
    }
    expect(prisma.team.count).toHaveBeenCalledWith({
      where: { ...team, guestLink: { isNot: null } },
    });
    expect(prisma.team.count).toHaveBeenCalledWith({
      where: { ...team, waReminderEnabled: true },
    });
  });

  it('calls a scheduled share overdue 15 minutes past its due time, for a match still ahead', async () => {
    const { sharing, shareWheres } = build();

    await sharing({ team: {}, event: {} });

    expect(shareWheres().find((where) => where.dueAt)).toEqual({
      team: {},
      state: 'SCHEDULED',
      dueAt: { lte: new Date('2026-09-28T11:45:00Z') },
      event: { startsAt: { gt: now } },
    });
  });

  it('reports the guest-link share of answers, null with no answers', async () => {
    const { prisma, sharing } = build();
    expect((await sharing({ team: {}, event: {} })).guestLinks).toEqual({
      teamsEnabled: 3,
      answersViaLink: 2,
      answersViaLinkShare: 0.25,
    });

    prisma.eventRsvp.count.mockResolvedValue(0);
    expect((await sharing({ team: {}, event: {} })).guestLinks).toMatchObject({
      answersViaLinkShare: null,
    });
  });
});
