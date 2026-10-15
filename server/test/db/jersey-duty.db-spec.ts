import { readFileSync } from 'fs';
import { join } from 'path';
import { JerseyDutyService } from '../../src/events/jersey-duty.service';
import { TeamsService } from '../../src/teams/teams.service';
import type { TeamManagerGuard } from '../../src/auth/guards/team-manager.guard';
import { asService, createClub, createTeam, createUser, prisma, resetDb } from './db';

const day = (offset: number) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000);

describe('jersey wash rotation against Postgres', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  async function rosterOf(teamId: string, clubId: string, names: string[]) {
    const out: { id: string; userId: string; playerId: string }[] = [];
    for (const firstName of names) {
      const user = await createUser();
      const player = await prisma.player.create({
        data: { clubId, firstName, lastName: 'Test', userId: user.id },
      });
      const tp = await prisma.teamPlayer.create({ data: { teamId, playerId: player.id } });
      out.push({ id: tp.id, userId: user.id, playerId: player.id });
    }
    return out;
  }

  const match = (teamId: string, startsAt: Date, over: Record<string, unknown> = {}) =>
    prisma.event.create({
      data: { teamId, type: 'MATCH', startsAt, location: 'Gymnase', venue: 'HOME', ...over },
    });

  const manager = { isTeamManager: async () => false } as unknown as TeamManagerGuard;
  const dutyService = () =>
    new JerseyDutyService(asService(prisma), manager, { notify: async () => undefined } as never);

  // The statements after the migration's « Backfill » marker, run as written:
  // the spec exercises the SQL that ships, not a copy of it.
  async function runBackfill() {
    const sql = readFileSync(
      join(__dirname, '../../prisma/migrations/20261001120000_jersey_wash_rotation/migration.sql'),
      'utf8',
    );
    const backfill = sql.slice(sql.indexOf('-- Backfill.'));
    for (const statement of backfill.split(/;\s*\n/).filter((s) => /INSERT|UPDATE/.test(s))) {
      await prisma.$executeRawUnsafe(statement);
    }
  }

  describe('migration backfill', () => {
    it('moves a match’s « qui apporte » onto the previous match, drops a first match’s, skips a conflict and nulls only MATCHes', async () => {
      const club = await createClub();
      const team = await createTeam(club.id);
      const otherTeam = await createTeam(club.id);
      const [a, b, c] = await rosterOf(team.id, club.id, ['A', 'B', 'C']);
      const [x] = await rosterOf(otherTeam.id, club.id, ['X']);

      const m1 = await match(team.id, new Date('2026-09-05T18:00:00Z'), {
        jerseysTeamPlayerId: a.id,
      });
      const m2 = await match(team.id, new Date('2026-09-12T18:00:00Z'), {
        jerseysTeamPlayerId: b.id,
      });
      const m3 = await match(team.id, new Date('2026-09-19T18:00:00Z'), {
        jerseysTeamPlayerId: c.id,
      });
      const training = await prisma.event.create({
        data: {
          teamId: team.id,
          type: 'TRAINING',
          startsAt: new Date('2026-09-10T18:00:00Z'),
          location: 'Salle',
          jerseysTeamPlayerId: a.id,
        },
      });
      // Another team's only match: nobody precedes it, whatever team A did.
      const solo = await match(otherTeam.id, new Date('2026-09-13T18:00:00Z'), {
        jerseysTeamPlayerId: x.id,
      });
      // A row that exists already is kept, never overwritten.
      await prisma.eventJerseyDuty.create({
        data: { eventId: m2.id, teamPlayerId: a.id, source: 'MANAGER' },
      });

      await runBackfill();

      const duties = await prisma.eventJerseyDuty.findMany({ orderBy: { eventId: 'asc' } });
      const byEvent = new Map(duties.map((d) => [d.eventId, d]));
      // m3's value (C) lands on m2, which already had a row: kept as it was.
      expect(byEvent.get(m2.id)).toMatchObject({ teamPlayerId: a.id, source: 'MANAGER' });
      // m2's value (B) lands on m1.
      expect(byEvent.get(m1.id)).toMatchObject({ teamPlayerId: b.id, source: 'BACKFILL' });
      expect(byEvent.get(m1.id)?.acceptedAt).toBeNull();
      // m1's own value (A), the first match's, is dropped; m3 has no successor.
      expect(byEvent.has(m3.id)).toBe(false);
      expect(byEvent.has(solo.id)).toBe(false);
      expect(duties).toHaveLength(2);

      const columns = await prisma.event.findMany({
        select: { id: true, jerseysTeamPlayerId: true },
      });
      for (const event of columns) {
        expect(event.jerseysTeamPlayerId).toBe(event.id === training.id ? a.id : null);
      }
    });

    it('is safe to run twice', async () => {
      const club = await createClub();
      const team = await createTeam(club.id);
      const [a] = await rosterOf(team.id, club.id, ['A']);
      await match(team.id, new Date('2026-09-05T18:00:00Z'));
      await match(team.id, new Date('2026-09-12T18:00:00Z'), { jerseysTeamPlayerId: a.id });

      await runBackfill();
      await runBackfill();

      expect(await prisma.eventJerseyDuty.count()).toBe(1);
    });
  });

  describe('foreign keys', () => {
    it('keeps the turn with no holder when a roster entry is deleted after kickoff (SetNull)', async () => {
      const club = await createClub();
      const team = await createTeam(club.id);
      const [a, b] = await rosterOf(team.id, club.id, ['A', 'B']);
      const played = await match(team.id, day(-7));
      await prisma.eventJerseyDuty.create({
        data: {
          eventId: played.id,
          teamPlayerId: a.id,
          source: 'SUGGESTION',
          swapToTeamPlayerId: b.id,
        },
      });

      await prisma.teamPlayer.delete({ where: { id: a.id } });
      await prisma.teamPlayer.delete({ where: { id: b.id } });

      expect(
        await prisma.eventJerseyDuty.findUniqueOrThrow({ where: { eventId: played.id } }),
      ).toMatchObject({ teamPlayerId: null, swapToTeamPlayerId: null });
    });

    it('removeTeamPlayer drops the turns of matches not yet started and keeps the played ones', async () => {
      const club = await createClub();
      const team = await createTeam(club.id);
      const [a] = await rosterOf(team.id, club.id, ['A']);
      const played = await match(team.id, day(-7));
      const upcoming = await match(team.id, day(7));
      await prisma.eventJerseyDuty.createMany({
        data: [
          { eventId: played.id, teamPlayerId: a.id, source: 'SELF' },
          { eventId: upcoming.id, teamPlayerId: a.id, source: 'SELF' },
        ],
      });
      const player = await prisma.teamPlayer.findUniqueOrThrow({ where: { id: a.id } });

      const teams = new TeamsService(asService(prisma), {} as never);
      await teams.removeTeamPlayer(club.id, team.id, player.playerId);

      expect(
        await prisma.eventJerseyDuty.findUnique({ where: { eventId: upcoming.id } }),
      ).toBeNull();
      expect(
        await prisma.eventJerseyDuty.findUniqueOrThrow({ where: { eventId: played.id } }),
      ).toMatchObject({ teamPlayerId: null });
    });

    it('cascades the duty and the declines with their event, and the declines with their player', async () => {
      const club = await createClub();
      const team = await createTeam(club.id);
      const [a, b] = await rosterOf(team.id, club.id, ['A', 'B']);
      const event = await match(team.id, day(7));
      await prisma.eventJerseyDuty.create({
        data: { eventId: event.id, teamPlayerId: a.id, source: 'SELF' },
      });
      await prisma.eventJerseyDecline.createMany({
        data: [
          { eventId: event.id, teamPlayerId: a.id },
          { eventId: event.id, teamPlayerId: b.id },
        ],
      });

      await prisma.teamPlayer.delete({ where: { id: b.id } });
      expect(await prisma.eventJerseyDecline.count()).toBe(1);

      await prisma.event.delete({ where: { id: event.id } });
      expect(await prisma.eventJerseyDuty.count()).toBe(0);
      expect(await prisma.eventJerseyDecline.count()).toBe(0);
    });

    it('keeps a turn when the guardian who accepted it is erased, and only forgets who accepted', async () => {
      const club = await createClub();
      const team = await createTeam(club.id);
      const [a] = await rosterOf(team.id, club.id, ['A']);
      const guardian = await createUser();
      const event = await match(team.id, day(7));
      await prisma.eventJerseyDuty.create({
        data: {
          eventId: event.id,
          teamPlayerId: a.id,
          source: 'SELF',
          acceptedAt: new Date(),
          acceptedByUserId: guardian.id,
        },
      });

      await prisma.user.delete({ where: { id: guardian.id } });

      expect(
        await prisma.eventJerseyDuty.findUniqueOrThrow({ where: { eventId: event.id } }),
      ).toMatchObject({ teamPlayerId: a.id, acceptedByUserId: null });
    });
  });

  describe('« apportés par » (LAG across teams)', () => {
    it('reads each team’s previous match, never another team’s, and skips a voided turn', async () => {
      const club = await createClub();
      const teamA = await createTeam(club.id);
      const teamB = await createTeam(club.id);
      const [a1, a2] = await rosterOf(teamA.id, club.id, ['A1', 'A2']);
      const [b1] = await rosterOf(teamB.id, club.id, ['B1']);

      const a1m = await match(teamA.id, day(-14));
      const a2m = await match(teamA.id, day(-7));
      const a3m = await match(teamA.id, day(7));
      // Team B's matches interleave in time: LAG must partition by team.
      const b1m = await match(teamB.id, day(-10));
      const b2m = await match(teamB.id, day(3));
      await prisma.eventJerseyDuty.createMany({
        data: [
          { eventId: a1m.id, teamPlayerId: a1.id, source: 'SELF' },
          { eventId: a2m.id, teamPlayerId: a2.id, source: 'SELF', voidedAt: new Date() },
          { eventId: b1m.id, teamPlayerId: b1.id, source: 'SELF' },
        ],
      });

      const summariesA = await dutyService().resolveSummaries(
        teamA.id,
        [
          { id: a2m.id, type: 'MATCH' },
          { id: a3m.id, type: 'MATCH' },
        ],
        a1.id,
      );
      const summariesB = await dutyService().resolveSummaries(
        teamB.id,
        [{ id: b2m.id, type: 'MATCH' }],
        null,
      );

      // a2m follows a1m (A1 washed); a3m follows a2m, whose turn was voided.
      expect(summariesA.get(a2m.id)?.broughtBy?.teamPlayerId).toBe(a1.id);
      expect(summariesA.get(a2m.id)).toMatchObject({
        holder: { teamPlayerId: a2.id },
        status: 'VOIDED',
      });
      expect(summariesA.get(a3m.id)?.broughtBy).toBeNull();
      expect(summariesB.get(b2m.id)?.broughtBy?.teamPlayerId).toBe(b1.id);
    });
  });

  describe('concurrency', () => {
    it('lets one of two simultaneous swap acceptances win, the other reading the settled state', async () => {
      const club = await createClub();
      const team = await createTeam(club.id);
      const [holder, target] = await rosterOf(team.id, club.id, ['H', 'T']);
      const parent = await createUser();
      await prisma.playerGuardian.create({
        data: { playerId: target.playerId, userId: parent.id },
      });
      await prisma.clubMembership.createMany({
        data: [
          { clubId: club.id, userId: target.userId, role: 'MEMBER' },
          { clubId: club.id, userId: parent.id, role: 'MEMBER' },
        ],
      });
      const event = await match(team.id, day(5));
      for (const tp of [holder, target]) {
        await prisma.eventConvocation.create({ data: { eventId: event.id, teamPlayerId: tp.id } });
        await prisma.eventRsvp.create({
          data: { eventId: event.id, teamPlayerId: tp.id, status: 'GOING' },
        });
      }
      await prisma.eventJerseyDuty.create({
        data: {
          eventId: event.id,
          teamPlayerId: holder.id,
          source: 'SELF',
          acceptedAt: new Date(),
          swapToTeamPlayerId: target.id,
          swapRequestedAt: new Date(),
        },
      });

      const service = dutyService();
      const outcomes = await Promise.allSettled([
        service.acceptSwap(club.id, team.id, event.id, { userId: target.userId }),
        service.acceptSwap(club.id, team.id, event.id, {
          userId: parent.id,
          forPlayerId: target.playerId,
        }),
      ]);

      expect(outcomes.map((o) => o.status)).toEqual(['fulfilled', 'fulfilled']);
      const row = await prisma.eventJerseyDuty.findUniqueOrThrow({ where: { eventId: event.id } });
      expect(row).toMatchObject({
        teamPlayerId: target.id,
        source: 'SWAP',
        swapToTeamPlayerId: null,
      });
      expect([target.userId, parent.id]).toContain(row.acceptedByUserId);
    });
  });

  describe('kickoff freeze', () => {
    it('freezes the suggestion on a started match with no row, and leaves a cleared match alone', async () => {
      const club = await createClub();
      const team = await createTeam(club.id);
      const [a, b] = await rosterOf(team.id, club.id, ['A', 'B']);
      const washedBefore = await match(team.id, day(-14));
      const cleared = await match(team.id, day(-6));
      const fresh = await match(team.id, day(-0.01));
      const upcoming = await match(team.id, day(5));
      // A has washed once already: B is next. `cleared` was emptied on purpose.
      await prisma.eventJerseyDuty.createMany({
        data: [
          { eventId: washedBefore.id, teamPlayerId: a.id, source: 'SELF' },
          { eventId: cleared.id, teamPlayerId: null, source: 'MANAGER' },
        ],
      });
      for (const event of [fresh, upcoming]) {
        for (const tp of [a, b]) {
          await prisma.eventConvocation.create({
            data: { eventId: event.id, teamPlayerId: tp.id },
          });
          await prisma.eventRsvp.create({
            data: { eventId: event.id, teamPlayerId: tp.id, status: 'GOING' },
          });
        }
      }

      const summary = await dutyService().freezeDue(new Date());

      // `cleared` already has a row (no holder), so it is never even considered.
      expect(summary).toEqual({ considered: 1, frozen: 1 });
      expect(
        await prisma.eventJerseyDuty.findUniqueOrThrow({ where: { eventId: fresh.id } }),
      ).toMatchObject({ teamPlayerId: b.id, source: 'SUGGESTION' });
      expect(
        await prisma.eventJerseyDuty.findUniqueOrThrow({ where: { eventId: cleared.id } }),
      ).toMatchObject({ teamPlayerId: null });
      expect(
        await prisma.eventJerseyDuty.findUnique({ where: { eventId: upcoming.id } }),
      ).toBeNull();
    });

    it('never overwrites a manager row written first (skipDuplicates)', async () => {
      const club = await createClub();
      const team = await createTeam(club.id);
      const [a, b] = await rosterOf(team.id, club.id, ['A', 'B']);
      const event = await match(team.id, day(-1));
      await prisma.eventJerseyDuty.create({
        data: { eventId: event.id, teamPlayerId: a.id, source: 'MANAGER' },
      });

      const { count } = await prisma.eventJerseyDuty.createMany({
        data: [{ eventId: event.id, teamPlayerId: b.id, source: 'SUGGESTION' }],
        skipDuplicates: true,
      });

      expect(count).toBe(0);
      expect(
        await prisma.eventJerseyDuty.findUniqueOrThrow({ where: { eventId: event.id } }),
      ).toMatchObject({ teamPlayerId: a.id, source: 'MANAGER' });
    });

    it('skips a team that switched the rotation off', async () => {
      const club = await createClub();
      const team = await createTeam(club.id);
      await prisma.team.update({ where: { id: team.id }, data: { jerseyRotationEnabled: false } });
      const [a] = await rosterOf(team.id, club.id, ['A']);
      const event = await match(team.id, day(-1));
      await prisma.eventConvocation.create({ data: { eventId: event.id, teamPlayerId: a.id } });
      await prisma.eventRsvp.create({
        data: { eventId: event.id, teamPlayerId: a.id, status: 'GOING' },
      });

      expect(await dutyService().freezeDue(new Date())).toEqual({ considered: 0, frozen: 0 });
    });
  });

  describe('freezeDue', () => {
    it('does not let more unassignable matches than the batch size starve a newer one', async () => {
      const club = await createClub();
      const emptyTeam = await createTeam(club.id);
      const fullTeam = await createTeam(club.id);
      const [a] = await rosterOf(fullTeam.id, club.id, ['A']);
      const hour = 60 * 60 * 1000;
      const base = Date.now() - 6 * 24 * hour;
      // 205 started matches of a team with an empty roster, all older than the one below.
      await prisma.event.createMany({
        data: Array.from({ length: 205 }, (_, i) => ({
          teamId: emptyTeam.id,
          type: 'MATCH' as const,
          startsAt: new Date(base + i * 60 * 1000),
          location: 'Gymnase',
          venue: 'HOME' as const,
        })),
      });
      const newer = await match(fullTeam.id, new Date(Date.now() - hour));
      await prisma.eventConvocation.create({ data: { eventId: newer.id, teamPlayerId: a.id } });
      await prisma.eventRsvp.create({
        data: { eventId: newer.id, teamPlayerId: a.id, status: 'GOING' },
      });
      const service = dutyService();

      await service.freezeDue(new Date());
      await service.freezeDue(new Date());

      const duty = await prisma.eventJerseyDuty.findUnique({ where: { eventId: newer.id } });
      expect(duty).toMatchObject({ teamPlayerId: a.id, source: 'SUGGESTION' });
      const emptyRows = await prisma.eventJerseyDuty.count({
        where: { event: { teamId: emptyTeam.id }, teamPlayerId: null, source: 'SUGGESTION' },
      });
      expect(emptyRows).toBe(205);
    });
  });
});
