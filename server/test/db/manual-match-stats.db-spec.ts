import { TeamStatsService } from '../../src/team-stats/team-stats.service';
import { asService, createClub, createTeam, createUser, prisma, resetDb } from './db';

describe('manual match stats against Postgres', () => {
  const service = new TeamStatsService(asService(prisma));

  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  async function playedMatch() {
    const manager = await createUser();
    const club = await createClub('BC Nantes');
    const team = await createTeam(club.id);
    const player = await prisma.player.create({
      data: { clubId: club.id, firstName: 'Léo', lastName: 'Martin' },
    });
    const slot = await prisma.teamPlayer.create({ data: { teamId: team.id, playerId: player.id } });
    const event = await prisma.event.create({
      data: {
        teamId: team.id,
        type: 'MATCH',
        venue: 'HOME',
        startsAt: new Date('2025-10-11T18:00:00Z'),
        location: 'Gymnase',
      },
    });
    return { manager, club, team, slot, event };
  }

  const body = (teamPlayerId: string, points: number) => ({
    ourScore: 62,
    theirScore: 55,
    periods: [{ ours: 16, theirs: 12 }],
    lines: [
      {
        teamPlayerId,
        jerseyNumber: 7,
        points,
        fouls: 2,
        freeThrowPoints: 2,
        twoPointPoints: points - 2,
        threePointPoints: 0,
      },
    ],
  });

  it('stores a file-less MANUAL sheet, replaces the lines on a second edit and cascades with the event', async () => {
    const { manager, club, team, slot, event } = await playedMatch();

    const first = await service.updateMatchStats(
      club.id,
      team.id,
      event.id,
      manager.id,
      body(slot.id, 12),
    );
    expect(first.manuallyEdited).toBe(true);
    expect(first.scoreboard).toEqual({
      ourScore: 62,
      theirScore: 55,
      periods: [{ ours: 16, theirs: 12 }],
    });

    const sheet = await prisma.eventScoresheet.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(sheet).toMatchObject({ source: 'MANUAL', status: 'CONFIRMED', storageKey: null });
    expect(sheet.statsEditedAt).not.toBeNull();

    const second = await service.updateMatchStats(
      club.id,
      team.id,
      event.id,
      manager.id,
      body(slot.id, 20),
    );
    expect(second.lines.map((line) => line.points)).toEqual([20]);
    expect(await prisma.matchPlayerStat.count({ where: { eventId: event.id } })).toBe(1);
    expect(await prisma.eventScoresheet.count({ where: { eventId: event.id } })).toBe(1);

    await prisma.event.delete({ where: { id: event.id } });
    expect(await prisma.eventScoresheet.count()).toBe(0);
    expect(await prisma.scoresheetExtraction.count()).toBe(0);
  });
});
