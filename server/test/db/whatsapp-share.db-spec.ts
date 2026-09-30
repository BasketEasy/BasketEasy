import { asService, createClub, createTeam, createUser, prisma, resetDb } from './db';
import { WhatsAppReminderService } from '../../src/whatsapp-reminders/whatsapp-reminder.service';
import { WhatsAppReminderScheduler } from '../../src/whatsapp-reminders/whatsapp-reminder.scheduler';

describe('WhatsApp share against Postgres', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  async function setup() {
    const club = await createClub();
    const team = await createTeam(club.id);
    const event = await prisma.event.create({
      data: {
        teamId: team.id,
        type: 'TRAINING',
        startsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        location: 'Salle',
      },
    });
    const queue = {
      add: async () => undefined,
      remove: async () => 1,
      getJob: async () => undefined,
    };
    const scheduler = new WhatsAppReminderScheduler(
      asService(prisma),
      { notify: async () => undefined } as never,
      queue as never,
    );
    const service = new WhatsAppReminderService(
      asService(prisma),
      { get: async () => ({ url: 'https://kluvo.test/r/abc' }) } as never,
      { resolvePlans: async () => new Map([[event.id, null]]) } as never,
      scheduler,
      { subscribe: () => () => undefined } as never,
    );
    return { club, team, event, service, scheduler };
  }

  it('keeps one row per (event, type)', async () => {
    const { team, event } = await setup();
    await prisma.eventShare.create({
      data: { eventId: event.id, teamId: team.id, type: 'REMINDER', state: 'SENT' },
    });
    await expect(
      prisma.eventShare.create({
        data: { eventId: event.id, teamId: team.id, type: 'REMINDER', state: 'SENT' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('cascades with the event, and keeps the row when the sender is erased', async () => {
    const { team, event } = await setup();
    const user = await createUser();
    await prisma.eventShare.create({
      data: {
        eventId: event.id,
        teamId: team.id,
        type: 'REMINDER',
        state: 'SENT',
        sentByUserId: user.id,
      },
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect(
      await prisma.eventShare.findFirstOrThrow({ where: { eventId: event.id } }),
    ).toMatchObject({ sentByUserId: null });
    await prisma.event.delete({ where: { id: event.id } });
    expect(await prisma.eventShare.count()).toBe(0);
  });

  it('leaves one sender when two admins confirm at once', async () => {
    const { club, team, event, service } = await setup();
    const [a, b] = await Promise.all([createUser(), createUser()]);

    const [first, second] = await Promise.all([
      service.confirmShare(club.id, team.id, event.id, 'REMINDER', a.id, 'WA_ME'),
      service.confirmShare(club.id, team.id, event.id, 'REMINDER', b.id, 'COPY'),
    ]);

    const rows = await prisma.eventShare.findMany({ where: { eventId: event.id } });
    expect(rows).toHaveLength(1);
    expect([a.id, b.id]).toContain(rows[0].sentByUserId);
    expect(first.platform).toBe(second.platform);
  });

  it('leaves SENT when the scheduled send and a confirm race', async () => {
    const { club, team, event, service, scheduler } = await setup();
    await prisma.team.update({ where: { id: team.id }, data: { waReminderEnabled: true } });
    const share = await prisma.eventShare.create({
      data: {
        eventId: event.id,
        teamId: team.id,
        type: 'REMINDER',
        state: 'SCHEDULED',
        dueAt: new Date(),
      },
    });
    const user = await createUser();

    await Promise.all([
      scheduler.send(share.id),
      service.confirmShare(club.id, team.id, event.id, 'REMINDER', user.id, 'COPY'),
    ]);

    const row = await prisma.eventShare.findUniqueOrThrow({ where: { id: share.id } });
    expect(row.state).toBe('SENT');
    expect(row.sentByUserId).toBe(user.id);
  });

  it('withdraws only the notifications that end with its own share id', async () => {
    const { scheduler } = await setup();
    const user = await createUser();
    const notification = (deepLink: string) =>
      prisma.notification.create({
        data: {
          userId: user.id,
          type: 'WHATSAPP_SHARE_REQUESTED',
          title: 't',
          deepLink,
        },
      });
    const mine = await notification('/clubs/c/teams/t/events/e?partage=share-1');
    const other = await notification('/clubs/c/teams/t/events/e?partage=share-10');
    const other2 = await notification('/clubs/c/teams/t/events/e?partage=other-share-1');

    await scheduler.withdraw('share-1');

    const read = async (id: string) =>
      (await prisma.notification.findUniqueOrThrow({ where: { id } })).readAt;
    expect(await read(mine.id)).not.toBeNull();
    expect(await read(other.id)).toBeNull();
    expect(await read(other2.id)).toBeNull();
  });

  it('keeps a CANCELLATION when its event is deleted, with eventId null', async () => {
    const { team, event } = await setup();
    await prisma.eventShare.create({
      data: {
        eventId: event.id,
        teamId: team.id,
        type: 'CANCELLATION',
        state: 'PENDING',
        eventSnapshot: { event_name: 'Entraînement' },
        expiresAt: event.startsAt,
      },
    });

    await prisma.event.delete({ where: { id: event.id } });

    const row = await prisma.eventShare.findFirstOrThrow({ where: { teamId: team.id } });
    expect(row.eventId).toBeNull();
    expect(row.eventSnapshot).toEqual({ event_name: 'Entraînement' });
  });

  it('lets several CANCELLATIONs with a null eventId coexist', async () => {
    const { team } = await setup();
    const cancelled = () =>
      prisma.eventShare.create({
        data: { eventId: null, teamId: team.id, type: 'CANCELLATION', state: 'PENDING' },
      });
    await cancelled();
    await expect(cancelled()).resolves.toBeDefined();
    expect(await prisma.eventShare.count({ where: { teamId: team.id } })).toBe(2);
  });

  it('cascades every share with the team', async () => {
    const { team } = await setup();
    await prisma.eventShare.create({
      data: { eventId: null, teamId: team.id, type: 'CANCELLATION', state: 'PENDING' },
    });
    await prisma.team.delete({ where: { id: team.id } });
    expect(await prisma.eventShare.count()).toBe(0);
  });

  it('a delete that prepares cancellations leaves the CANCELLATION and no orphan reminder', async () => {
    const { club, team, event, service } = await setup();
    const user = await createUser();
    await service.confirmShare(club.id, team.id, event.id, 'REMINDER', user.id, 'COPY');

    await prisma.$transaction(async (tx) => {
      await service.prepareCancellations(tx, team.id, [event.id]);
      await tx.event.deleteMany({ where: { id: event.id } });
    });

    const rows = await prisma.eventShare.findMany({ where: { teamId: team.id } });
    expect(rows.map((r) => r.type)).toEqual(['CANCELLATION']);
    expect(rows[0].eventId).toBeNull();
    expect(rows[0].eventSnapshot).toMatchObject({ event_name: 'Entraînement', link: null });
  });
});
