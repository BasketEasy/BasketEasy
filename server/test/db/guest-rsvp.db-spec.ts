import { asService, createClub, createTeam, createUser, prisma, resetDb } from './db';
import { GuestRsvpService } from '../../src/guest-links/guest-rsvp.service';
import { GuestRateLimiter } from '../../src/guest-links/guest-rate-limiter';

describe('guest RSVP against Postgres', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  async function setup() {
    const club = await createClub();
    const team = await createTeam(club.id);
    const player = await prisma.player.create({
      data: { firstName: 'Léo', lastName: 'Martin', clubId: club.id },
    });
    const teamPlayer = await prisma.teamPlayer.create({
      data: { teamId: team.id, playerId: player.id },
    });
    const event = await prisma.event.create({
      data: {
        teamId: team.id,
        type: 'TRAINING',
        startsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        location: 'Salle',
      },
    });
    const service = new GuestRsvpService(
      asService(prisma),
      { resolvePlans: async () => new Map() } as never,
      { notify: async () => undefined } as never,
      new GuestRateLimiter(),
    );
    return { team, teamPlayer, event, service };
  }

  it('writes the answer and its history row together, and overwrites on a second answer', async () => {
    const { team, teamPlayer, event, service } = await setup();

    await service.setRsvp(team.id, 'tok', undefined, event.id, {
      teamPlayerId: teamPlayer.id,
      status: 'GOING',
    });
    await service.setRsvp(team.id, 'tok', undefined, event.id, {
      teamPlayerId: teamPlayer.id,
      status: 'NOT_GOING',
    });

    const rsvps = await prisma.eventRsvp.findMany({ where: { eventId: event.id } });
    expect(rsvps).toHaveLength(1);
    expect(rsvps[0]).toMatchObject({
      status: 'NOT_GOING',
      source: 'GUEST_LINK',
      respondedByUserId: null,
    });
    const history = await prisma.eventRsvpChange.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => h.status)).toEqual(['GOING', 'NOT_GOING']);
  });

  it('cascades history away with its event and with its roster slot', async () => {
    const { team, teamPlayer, event, service } = await setup();
    await service.setRsvp(team.id, 'tok', undefined, event.id, {
      teamPlayerId: teamPlayer.id,
      status: 'GOING',
    });

    await prisma.teamPlayer.delete({ where: { id: teamPlayer.id } });
    expect(await prisma.eventRsvpChange.count()).toBe(0);

    const other = await prisma.teamPlayer.create({
      data: {
        teamId: team.id,
        playerId: (
          await prisma.player.create({
            data: {
              firstName: 'Zoé',
              lastName: 'B',
              clubId: (await prisma.clubTeam.findFirstOrThrow({ where: { teamId: team.id } }))
                .clubId,
            },
          })
        ).id,
      },
    });
    await prisma.eventRsvpChange.create({
      data: { eventId: event.id, teamPlayerId: other.id, status: 'GOING', source: 'APP' },
    });
    await prisma.event.delete({ where: { id: event.id } });
    expect(await prisma.eventRsvpChange.count()).toBe(0);
  });

  it('keeps the history when its author’s account is erased, and enforces one link per team and a unique token', async () => {
    const { team, teamPlayer, event } = await setup();
    const user = await createUser();
    await prisma.eventRsvpChange.create({
      data: {
        eventId: event.id,
        teamPlayerId: teamPlayer.id,
        status: 'GOING',
        source: 'APP',
        respondedByUserId: user.id,
      },
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect((await prisma.eventRsvpChange.findFirstOrThrow()).respondedByUserId).toBeNull();

    await prisma.teamGuestLink.create({ data: { teamId: team.id, token: 't1' } });
    await expect(
      prisma.teamGuestLink.create({ data: { teamId: team.id, token: 't2' } }),
    ).rejects.toThrow();
    const club = await createClub();
    const team2 = await createTeam(club.id);
    await expect(
      prisma.teamGuestLink.create({ data: { teamId: team2.id, token: 't1' } }),
    ).rejects.toThrow();
  });
});
