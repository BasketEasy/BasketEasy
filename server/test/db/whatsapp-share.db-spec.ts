import { asService, createClub, createTeam, createUser, prisma, resetDb } from './db';
import { WhatsAppReminderService } from '../../src/whatsapp-reminders/whatsapp-reminder.service';

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
    const service = new WhatsAppReminderService(
      asService(prisma),
      { get: async () => ({ url: 'https://kluvo.test/r/abc' }) } as never,
      { resolvePlans: async () => new Map([[event.id, null]]) } as never,
    );
    return { club, team, event, service };
  }

  it('keeps one row per (event, type)', async () => {
    const { event } = await setup();
    await prisma.eventShare.create({
      data: { eventId: event.id, type: 'REMINDER', state: 'SENT' },
    });
    await expect(
      prisma.eventShare.create({ data: { eventId: event.id, type: 'REMINDER', state: 'SENT' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('cascades with the event, and keeps the row when the sender is erased', async () => {
    const { event } = await setup();
    const user = await createUser();
    await prisma.eventShare.create({
      data: { eventId: event.id, type: 'REMINDER', state: 'SENT', sentByUserId: user.id },
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
});
