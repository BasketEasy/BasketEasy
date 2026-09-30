import { resolveSettings, WhatsAppReminderScheduler } from './whatsapp-reminder.scheduler';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-01T12:00:00Z');

type Share = { id: string; eventId: string; state: string; dueAt: Date | null } | null;

describe('resolveSettings', () => {
  const team = { waReminderEnabled: true, waDefaultOffsetMinutes: 4320 };

  it.each([
    [
      { waReminderOverride: null, waOffsetMinutes: null },
      { enabled: true, offsetMinutes: 4320 },
    ],
    [
      { waReminderOverride: false, waOffsetMinutes: null },
      { enabled: false, offsetMinutes: 4320 },
    ],
    [
      { waReminderOverride: null, waOffsetMinutes: 120 },
      { enabled: true, offsetMinutes: 120 },
    ],
    [
      { waReminderOverride: true, waOffsetMinutes: 60 },
      { enabled: true, offsetMinutes: 60 },
    ],
  ])('%j inherits what it does not set', (event, expected) => {
    expect(resolveSettings(event, team)).toEqual(expected);
  });

  it('an event override to on beats a team that is off', () => {
    expect(
      resolveSettings(
        { waReminderOverride: true, waOffsetMinutes: null },
        { waReminderEnabled: false, waDefaultOffsetMinutes: 4320 },
      ),
    ).toEqual({ enabled: true, offsetMinutes: 4320 });
  });
});

describe('WhatsAppReminderScheduler', () => {
  let prisma: {
    event: { findMany: jest.Mock };
    team: { findMany: jest.Mock; findUnique: jest.Mock };
    eventShare: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
    notification: { updateMany: jest.Mock };
    clubMembership: { findMany: jest.Mock };
  };
  let notifications: { notify: jest.Mock };
  let queue: { add: jest.Mock; remove: jest.Mock; getJob: jest.Mock };
  let scheduler: WhatsAppReminderScheduler;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    prisma = {
      event: { findMany: jest.fn() },
      team: { findMany: jest.fn(), findUnique: jest.fn() },
      eventShare: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      clubMembership: { findMany: jest.fn().mockResolvedValue([]) },
    };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    queue = {
      add: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(1),
      getJob: jest.fn().mockResolvedValue(undefined),
    };
    scheduler = new WhatsAppReminderScheduler(
      prisma as never,
      notifications as never,
      queue as never,
    );
  });
  afterEach(() => jest.useRealTimers());

  // The event starts `startsInMs` from NOW; the team is on with the default 3 days.
  function arrange(opts: {
    startsInMs: number;
    share: Share;
    team?: Partial<{ waReminderEnabled: boolean; waDefaultOffsetMinutes: number }>;
    override?: boolean | null;
    offset?: number | null;
  }) {
    const startsAt = new Date(NOW.getTime() + opts.startsInMs);
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'e1',
        teamId: 't1',
        startsAt,
        waReminderOverride: opts.override ?? null,
        waOffsetMinutes: opts.offset ?? null,
      },
    ]);
    prisma.team.findMany.mockResolvedValue([
      { id: 't1', waReminderEnabled: true, waDefaultOffsetMinutes: 4320, ...opts.team },
    ]);
    prisma.eventShare.findMany.mockResolvedValue(opts.share ? [opts.share] : []);
    prisma.eventShare.upsert.mockResolvedValue({ id: 's1' });
    // What notifyManagers reads back.
    prisma.eventShare.findUnique.mockResolvedValue({
      event: { id: 'e1', teamId: 't1', type: 'MATCH', startsAt, opponentName: 'ES Vertou' },
    });
    prisma.team.findUnique.mockResolvedValue({
      clubTeams: [{ clubId: 'c1' }],
      teamAdmins: [],
    });
    prisma.clubMembership.findMany.mockResolvedValue([
      { userId: 'admin-1', clubId: 'c1', role: 'ADMIN' },
    ]);
    return startsAt;
  }

  const row = (state: string, dueAt: Date | null = null): Share => ({
    id: 's1',
    eventId: 'e1',
    state,
    dueAt,
  });
  const jobAdds = () => queue.add.mock.calls.map(([name]) => name);
  const stateWrites = () =>
    prisma.eventShare.updateMany.mock.calls.map(([arg]) => arg.data.state).filter(Boolean);

  describe('syncEvents: no row or VOID', () => {
    it.each([
      ['none', null],
      ['VOID', row('VOID')],
    ])('%s + reminder off does nothing', async (_l, share) => {
      arrange({ startsInMs: 10 * DAY, share, team: { waReminderEnabled: false } });
      await scheduler.syncEvents(['e1']);
      expect(prisma.eventShare.upsert).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it.each([
      ['none', null],
      ['VOID', row('VOID')],
    ])(
      '%s + on + due in the future schedules send at dueAt and expire at kick-off',
      async (_l, share) => {
        const startsAt = arrange({ startsInMs: 10 * DAY, share });
        await scheduler.syncEvents(['e1']);

        expect(prisma.eventShare.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              state: 'SCHEDULED',
              dueAt: new Date(startsAt.getTime() - 3 * DAY),
            }),
            update: expect.objectContaining({ state: 'SCHEDULED' }),
          }),
        );
        const send = queue.add.mock.calls.find(([n]) => n === 'send')!;
        expect(send[1]).toEqual({ shareId: 's1' });
        expect(send[2]).toMatchObject({ jobId: 'wa-s1-send', delay: 7 * DAY });
        const expire = queue.add.mock.calls.find(([n]) => n === 'expire')!;
        expect(expire[2]).toMatchObject({ jobId: 'wa-s1-expire', delay: 10 * DAY });
        expect(notifications.notify).not.toHaveBeenCalled();
      },
    );

    it('on + due already past + event in the future notifies now (rule 9), nudge queued', async () => {
      arrange({ startsInMs: 2 * DAY, share: null });
      await scheduler.syncEvents(['e1']);

      expect(stateWrites()).toContain('PENDING');
      expect(notifications.notify).toHaveBeenCalledTimes(1);
      expect(notifications.notify.mock.calls[0][0]).toEqual([
        expect.objectContaining({
          userId: 'admin-1',
          type: 'WHATSAPP_SHARE_REQUESTED',
          title: expect.stringContaining('Rappel à partager'),
          deepLink: '/clubs/c1/teams/t1/events/e1?partage=s1',
        }),
      ]);
      const nudge = queue.add.mock.calls.find(([n]) => n === 'nudge')!;
      expect(nudge[2]).toMatchObject({ jobId: 'wa-s1-nudge', delay: HOUR });
    });

    it('rule 9: no nudge when the event starts in under an hour', async () => {
      arrange({ startsInMs: 30 * 60 * 1000, share: null });
      await scheduler.syncEvents(['e1']);

      expect(notifications.notify).toHaveBeenCalledTimes(1);
      expect(jobAdds()).not.toContain('nudge');
    });

    it('a past event is never scheduled', async () => {
      arrange({ startsInMs: -HOUR, share: null });
      await scheduler.syncEvents(['e1']);
      expect(prisma.eventShare.upsert).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('syncEvents: SCHEDULED', () => {
    it('is idempotent: same dueAt, expire job already right, changes nothing', async () => {
      const startsAt = arrange({ startsInMs: 10 * DAY, share: null });
      const dueAt = new Date(startsAt.getTime() - 3 * DAY);
      prisma.eventShare.findMany.mockResolvedValue([row('SCHEDULED', dueAt)]);
      queue.getJob.mockResolvedValue({ data: { shareId: 's1', startsAt: startsAt.toISOString() } });

      await scheduler.syncEvents(['e1']);
      await scheduler.syncEvents(['e1']);

      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.eventShare.updateMany).not.toHaveBeenCalled();
      expect(prisma.eventShare.upsert).not.toHaveBeenCalled();
    });

    it('a changed dueAt removes and re-adds send, and updates dueAt', async () => {
      const startsAt = arrange({ startsInMs: 10 * DAY, share: null });
      prisma.eventShare.findMany.mockResolvedValue([
        row('SCHEDULED', new Date(startsAt.getTime() - DAY)),
      ]);
      queue.getJob.mockResolvedValue({ data: { startsAt: startsAt.toISOString() } });

      await scheduler.syncEvents(['e1']);

      expect(queue.remove).toHaveBeenCalledWith('wa-s1-send');
      expect(jobAdds()).toEqual(['send']);
      expect(prisma.eventShare.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', state: 'SCHEDULED' },
        data: { dueAt: new Date(startsAt.getTime() - 3 * DAY) },
      });
    });

    it('a moved kick-off re-adds the expire job', async () => {
      const startsAt = arrange({ startsInMs: 10 * DAY, share: null });
      prisma.eventShare.findMany.mockResolvedValue([
        row('SCHEDULED', new Date(startsAt.getTime() - 3 * DAY)),
      ]);
      queue.getJob.mockResolvedValue({
        data: { startsAt: new Date(startsAt.getTime() - DAY).toISOString() },
      });

      await scheduler.syncEvents(['e1']);

      expect(queue.remove).toHaveBeenCalledWith('wa-s1-expire');
      expect(jobAdds()).toEqual(['expire']);
    });

    it('turning the reminder off voids it and removes every job', async () => {
      arrange({
        startsInMs: 10 * DAY,
        share: row('SCHEDULED', new Date()),
        team: { waReminderEnabled: false },
      });
      await scheduler.syncEvents(['e1']);

      expect(stateWrites()).toEqual(['VOID']);
      expect(queue.remove.mock.calls.map(([id]) => id).sort()).toEqual([
        'wa-s1-expire',
        'wa-s1-nudge',
        'wa-s1-send',
      ]);
    });

    it('an offset raised past now notifies immediately', async () => {
      arrange({ startsInMs: 2 * DAY, share: row('SCHEDULED', new Date(NOW.getTime() + DAY)) });
      await scheduler.syncEvents(['e1']);
      expect(stateWrites()).toContain('PENDING');
      expect(notifications.notify).toHaveBeenCalledTimes(1);
    });
  });

  describe('syncEvents: PENDING', () => {
    it('off voids it, removes jobs and withdraws the notifications', async () => {
      arrange({
        startsInMs: 2 * DAY,
        share: row('PENDING', new Date(NOW.getTime() - DAY)),
        team: { waReminderEnabled: false },
      });
      await scheduler.syncEvents(['e1']);

      expect(stateWrites()).toEqual(['VOID']);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deepLink: { endsWith: 'partage=s1' }, readAt: null }),
        }),
      );
    });

    it('rule 8: an offset changed after the push keeps PENDING and sends nothing new', async () => {
      arrange({
        startsInMs: 2 * DAY,
        share: row('PENDING', new Date(NOW.getTime() - DAY)),
        offset: 120 * 24,
      });
      await scheduler.syncEvents(['e1']);

      expect(stateWrites()).toEqual([]);
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('moved to the future goes back to SCHEDULED, withdraws, and re-queues', async () => {
      arrange({ startsInMs: 10 * DAY, share: row('PENDING', new Date(NOW.getTime() - DAY)) });
      await scheduler.syncEvents(['e1']);

      expect(prisma.eventShare.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', state: 'PENDING' },
        data: expect.objectContaining({
          state: 'SCHEDULED',
          firstNotifiedAt: null,
          nudgedAt: null,
        }),
      });
      expect(queue.remove).toHaveBeenCalledWith('wa-s1-nudge');
      expect(prisma.notification.updateMany).toHaveBeenCalled();
      expect(jobAdds()).toEqual(expect.arrayContaining(['send', 'expire']));
    });
  });

  it.each(['SENT', 'EXPIRED'])('%s is left alone', async (state) => {
    arrange({ startsInMs: 10 * DAY, share: row(state), team: { waReminderEnabled: false } });
    await scheduler.syncEvents(['e1']);
    expect(prisma.eventShare.updateMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('a Redis failure is logged, never thrown', async () => {
    arrange({ startsInMs: 10 * DAY, share: null });
    queue.add.mockRejectedValue(new Error('redis down'));
    await expect(scheduler.syncEvents(['e1'])).resolves.toBeUndefined();
  });

  it('syncs a batch in three reads however many events', async () => {
    arrange({ startsInMs: 10 * DAY, share: null });
    await scheduler.syncEvents(['e1', 'e2', 'e3']);
    expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.team.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.eventShare.findMany).toHaveBeenCalledTimes(1);
  });

  describe('processor jobs', () => {
    const loaded = (
      over: Record<string, unknown> = {},
      eventOver: Record<string, unknown> = {},
    ) => ({
      id: 's1',
      state: 'SCHEDULED',
      nudgedAt: null,
      event: {
        id: 'e1',
        teamId: 't1',
        type: 'MATCH',
        startsAt: new Date(NOW.getTime() + 2 * DAY),
        opponentName: 'ES Vertou',
        waReminderOverride: null,
        waOffsetMinutes: null,
        team: { waReminderEnabled: true, waDefaultOffsetMinutes: 4320 },
        ...eventOver,
      },
      ...over,
    });

    beforeEach(() => {
      prisma.team.findUnique.mockResolvedValue({ clubTeams: [{ clubId: 'c1' }], teamAdmins: [] });
      prisma.clubMembership.findMany.mockResolvedValue([
        { userId: 'admin-1', clubId: 'c1', role: 'ADMIN' },
      ]);
    });

    it('send notifies all managers, goes PENDING and queues the nudge', async () => {
      prisma.eventShare.findUnique.mockResolvedValue(loaded());
      await scheduler.send('s1');
      expect(stateWrites()).toEqual(['PENDING']);
      expect(notifications.notify).toHaveBeenCalledTimes(1);
      expect(jobAdds()).toContain('nudge');
    });

    it.each([
      ['a deleted share', null],
      ['an already sent share', loaded({ state: 'SENT' })],
      ['a share that is no longer scheduled', loaded({ state: 'VOID' })],
      ['an event that has started', loaded({}, { startsAt: new Date(NOW.getTime() - HOUR) })],
      ['a reminder that was turned off', loaded({}, { waReminderOverride: false })],
    ])('send drops %s', async (_label, share) => {
      prisma.eventShare.findUnique.mockResolvedValue(share);
      await scheduler.send('s1');
      expect(notifications.notify).not.toHaveBeenCalled();
      expect(prisma.eventShare.updateMany).not.toHaveBeenCalled();
    });

    it('send loses gracefully to a racing confirm', async () => {
      prisma.eventShare.findUnique.mockResolvedValue(loaded());
      prisma.eventShare.updateMany.mockResolvedValue({ count: 0 });
      await scheduler.send('s1');
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('nudge notifies once with the « Toujours pas partagé » copy', async () => {
      prisma.eventShare.findUnique.mockResolvedValue(loaded({ state: 'PENDING' }));
      await scheduler.nudge('s1');
      expect(prisma.eventShare.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', state: 'PENDING', nudgedAt: null },
        data: { nudgedAt: expect.any(Date) },
      });
      expect(notifications.notify.mock.calls[0][0][0].title).toContain('Toujours pas partagé');
    });

    it.each([
      ['already nudged', loaded({ state: 'PENDING', nudgedAt: NOW })],
      ['already sent', loaded({ state: 'SENT' })],
    ])('nudge skips a share that is %s', async (_label, share) => {
      prisma.eventShare.findUnique.mockResolvedValue(share);
      await scheduler.nudge('s1');
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('expire moves an unshared share to EXPIRED and withdraws, never touching SENT', async () => {
      await scheduler.expire('s1');
      expect(prisma.eventShare.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', state: { in: ['SCHEDULED', 'PENDING'] } },
        data: { state: 'EXPIRED' },
      });
      expect(prisma.notification.updateMany).toHaveBeenCalled();
    });

    it('expire withdraws nothing when the share had already been sent', async () => {
      prisma.eventShare.updateMany.mockResolvedValue({ count: 0 });
      await scheduler.expire('s1');
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('resolveManagers', () => {
    it('dedupes across CTC clubs, preferring a club the user is ADMIN of', async () => {
      prisma.team.findUnique.mockResolvedValue({
        clubTeams: [{ clubId: 'owner' }, { clubId: 'partner' }],
        teamAdmins: [{ userId: 'coach' }, { userId: 'both' }],
      });
      prisma.clubMembership.findMany.mockResolvedValue([
        { userId: 'both', clubId: 'owner', role: 'MEMBER' },
        { userId: 'both', clubId: 'partner', role: 'ADMIN' },
        { userId: 'coach', clubId: 'partner', role: 'MEMBER' },
        { userId: 'partner-admin', clubId: 'partner', role: 'ADMIN' },
      ]);

      const managers = await scheduler.resolveManagers('t1');

      expect(managers).toEqual(
        expect.arrayContaining([
          { userId: 'both', clubId: 'partner' },
          { userId: 'coach', clubId: 'partner' },
          { userId: 'partner-admin', clubId: 'partner' },
        ]),
      );
      expect(managers).toHaveLength(3);
      expect(prisma.clubMembership.findMany).toHaveBeenCalledTimes(1);
    });

    it('keeps a TeamAdmin with no membership, linking through the owner club', async () => {
      prisma.team.findUnique.mockResolvedValue({
        clubTeams: [{ clubId: 'owner' }],
        teamAdmins: [{ userId: 'lonely' }],
      });
      prisma.clubMembership.findMany.mockResolvedValue([]);
      expect(await scheduler.resolveManagers('t1')).toEqual([
        { userId: 'lonely', clubId: 'owner' },
      ]);
    });
  });

  it('onShared withdraws everyone’s notification and drops the jobs', async () => {
    await scheduler.onShared('s1');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { readAt: expect.any(Date) } }),
    );
    expect(queue.remove).toHaveBeenCalledTimes(3);
  });
});
