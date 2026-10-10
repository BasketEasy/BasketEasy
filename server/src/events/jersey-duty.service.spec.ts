import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { JerseyDutyService } from './jersey-duty.service';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const NEXT_MATCH = new Date('2026-10-04T18:00:00.000Z');
const LATER_MATCH = new Date('2026-10-11T18:00:00.000Z');
const PAST_MATCH = new Date('2026-09-20T18:00:00.000Z');

const USER = 'user-1';

interface RosterSpec {
  id: string;
  first: string;
  last: string;
  convoked?: boolean;
  going?: boolean;
  exempt?: boolean;
  declined?: boolean;
  userId?: string | null;
  guardians?: number;
  gender?: 'MEN' | 'WOMEN' | null;
}

const rosterRow = (r: RosterSpec) => ({
  id: r.id,
  playerId: `p-${r.id}`,
  team: { gender: 'WOMEN' },
  jerseyDutyExempt: r.exempt ?? false,
  player: {
    firstName: r.first,
    lastName: r.last,
    id: `p-${r.id}`,
    clubId: 'club-1',
    gender: r.gender === undefined ? 'WOMEN' : r.gender,
    userId: r.userId === undefined ? `u-${r.id}` : r.userId,
    guardians: Array.from({ length: r.guardians ?? 0 }, (_, i) => ({ userId: `g-${r.id}-${i}` })),
  },
  convocations: r.convoked === false ? [] : [{ eventId: 'event-1' }],
  rsvps: r.going === false ? [] : [{ status: 'GOING' }],
  jerseyDeclines: r.declined ? [{ eventId: 'event-1' }] : [],
});

// Alice has washed twice, Bea once, Cleo never: Cleo comes first.
const DEFAULT_ROSTER: RosterSpec[] = [
  { id: 'tp-a', first: 'Alice', last: 'Durand' },
  { id: 'tp-b', first: 'Bea', last: 'Martin' },
  { id: 'tp-c', first: 'Cleo', last: 'Petit' },
];
const turnRows = [
  {
    teamPlayerId: 'tp-a',
    voidedAt: null,
    event: { startsAt: new Date('2026-09-06T18:00:00.000Z') },
  },
  {
    teamPlayerId: 'tp-a',
    voidedAt: null,
    event: { startsAt: new Date('2026-09-13T18:00:00.000Z') },
  },
  {
    teamPlayerId: 'tp-b',
    voidedAt: null,
    event: { startsAt: new Date('2026-09-20T18:00:00.000Z') },
  },
];

describe('JerseyDutyService', () => {
  let service: JerseyDutyService;
  let teamManagerGuard: { isTeamManager: jest.Mock };
  let notifications: { notify: jest.Mock };
  let prisma: {
    clubTeam: { findUnique: jest.Mock; findMany: jest.Mock };
    clubMembership: { findMany: jest.Mock };
    team: { findUniqueOrThrow: jest.Mock; findUnique: jest.Mock };
    event: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
    eventJerseyDuty: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    eventJerseyDecline: { upsert: jest.Mock };
    teamPlayer: { findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock };
    player: { findFirst: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };

  let match: {
    id: string;
    teamId: string;
    type: string;
    startsAt: Date;
    opponentName: string | null;
  };
  let duty: Record<string, unknown> | null;
  let roster: RosterSpec[];
  let personaTeamPlayerId: string | null;
  let nextMatch: { id: string; startsAt: Date } | null;
  let previousMatch: { jerseyDuty: Record<string, unknown> | null } | null;
  let followingMatch: { startsAt: Date } | null;

  const dutyRow = (over: Record<string, unknown> = {}) => ({
    eventId: 'event-1',
    teamPlayerId: null,
    source: 'MANAGER',
    acceptedAt: null,
    acceptedByUserId: null,
    acceptedBy: null,
    doneAt: null,
    voidedAt: null,
    swapToTeamPlayerId: null,
    swapRequestedAt: null,
    ...over,
  });

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(NOW);
    match = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'MATCH',
      startsAt: NEXT_MATCH,
      opponentName: 'BC Rezé',
    };
    duty = null;
    roster = DEFAULT_ROSTER;
    personaTeamPlayerId = 'tp-a';
    nextMatch = { id: 'event-1', startsAt: NEXT_MATCH };
    previousMatch = null;
    followingMatch = { startsAt: LATER_MATCH };

    prisma = {
      clubTeam: {
        findUnique: jest.fn().mockResolvedValue({ isOwner: true }),
        findMany: jest.fn().mockResolvedValue([{ clubId: 'club-1', isOwner: true }]),
      },
      team: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          gender: 'WOMEN',
          jerseyRotationEnabled: true,
        }),
        findUnique: jest.fn().mockResolvedValue({ jerseyRotationEnabled: true }),
      },
      event: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(match)),
        // Next match, previous match and following match are three findFirst
        // reads told apart by the shape of their `where`.
        findFirst: jest.fn().mockImplementation(({ where }: { where: any }) => {
          if (where.OR) return Promise.resolve(previousMatch);
          if (where.startsAt.gt.getTime() === NOW.getTime()) return Promise.resolve(nextMatch);
          return Promise.resolve(followingMatch);
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventJerseyDuty: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(duty)),
        findMany: jest.fn().mockResolvedValue(turnRows),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      eventJerseyDecline: { upsert: jest.fn().mockResolvedValue({}) },
      teamPlayer: {
        findMany: jest.fn().mockImplementation(({ where }: { where: any }) => {
          const ids: string[] | undefined = where?.id?.in;
          return Promise.resolve(roster.filter((r) => !ids || ids.includes(r.id)).map(rosterRow));
        }),
        findUnique: jest.fn().mockImplementation(({ where }: { where: any }) => {
          const r = roster.find((x) => x.id === where.id);
          return Promise.resolve(r ? rosterRow(r) : null);
        }),
        findFirst: jest.fn().mockImplementation(({ where }: { where: any }) => {
          // resolveActingTeamPlayer (a persona) and the manager's roster check.
          if ('player' in where) {
            return Promise.resolve(personaTeamPlayerId ? { id: personaTeamPlayerId } : null);
          }
          return Promise.resolve(roster.some((r) => r.id === where.id) ? { id: where.id } : null);
        }),
      },
      player: { findFirst: jest.fn().mockResolvedValue({ id: 'p-child' }) },
      clubMembership: { findMany: jest.fn().mockResolvedValue([]) },
      // The interactive form runs against `prisma` itself, standing in for `tx`.
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    teamManagerGuard = { isTeamManager: jest.fn().mockResolvedValue(false) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JerseyDutyService,
        { provide: PrismaService, useValue: prisma },
        { provide: TeamManagerGuard, useValue: teamManagerGuard },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(JerseyDutyService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const detail = (forPlayerId?: string) =>
    service.getDetail('club-1', 'team-1', 'event-1', USER, forPlayerId);
  const noWrites = () => {
    expect(prisma.eventJerseyDuty.upsert).not.toHaveBeenCalled();
    expect(prisma.eventJerseyDuty.update).not.toHaveBeenCalled();
    expect(prisma.eventJerseyDuty.updateMany).not.toHaveBeenCalled();
    expect(prisma.eventJerseyDuty.deleteMany).not.toHaveBeenCalled();
    expect(prisma.eventJerseyDecline.upsert).not.toHaveBeenCalled();
  };

  describe('getDetail', () => {
    it('suggests the pool member with the fewest turns for the next match, and says so', async () => {
      personaTeamPlayerId = 'tp-c';

      const result = await detail();

      expect(result.suggestion).toMatchObject({
        kind: 'SUGGESTED',
        isFewest: true,
        candidate: { teamPlayerId: 'tp-c', turnsThisSeason: 0, lastTurnAt: null, reachable: true },
      });
      expect(result.status).toBe('UNASSIGNED');
      expect(result.rights).toMatchObject({
        canAccept: true,
        canDecline: true,
        canSwap: true,
        canCancelSwap: false,
        canRespondToSwap: false,
        canManage: false,
      });
      // Suggestion order, the acting persona left out.
      expect(result.swapCandidates.map((c) => [c.teamPlayerId, c.turnsThisSeason])).toEqual([
        ['tp-b', 1],
        ['tp-a', 2],
      ]);
      expect(result.pool).toEqual({ convokedGoingCount: 3, exemptedCount: 0 });
      expect(result.nextMatchStartsAt).toBe(LATER_MATCH.toISOString());
    });

    it('counts a turn only once its match has started, and never a voided one', async () => {
      personaTeamPlayerId = 'tp-b';
      prisma.eventJerseyDuty.findMany.mockResolvedValue([
        ...turnRows,
        { teamPlayerId: 'tp-c', voidedAt: null, event: { startsAt: LATER_MATCH } },
        { teamPlayerId: 'tp-c', voidedAt: new Date(), event: { startsAt: PAST_MATCH } },
      ]);

      const result = await detail();

      expect(result.suggestion).toMatchObject({
        kind: 'SUGGESTED',
        candidate: { teamPlayerId: 'tp-c', turnsThisSeason: 0 },
      });
    });

    it('breaks a tie by the longest since the last turn', async () => {
      roster = DEFAULT_ROSTER.slice(0, 2);
      prisma.eventJerseyDuty.findMany.mockResolvedValue([
        {
          teamPlayerId: 'tp-a',
          voidedAt: null,
          event: { startsAt: new Date('2026-09-20T18:00:00Z') },
        },
        {
          teamPlayerId: 'tp-b',
          voidedAt: null,
          event: { startsAt: new Date('2026-09-06T18:00:00Z') },
        },
      ]);

      const result = await detail();

      expect(result.suggestion).toMatchObject({
        candidate: { teamPlayerId: 'tp-b', lastTurnAt: '2026-09-06T18:00:00.000Z' },
        isFewest: false,
      });
    });

    it('keeps exempted, declined, absent and unconvoked players out of the pool, exemptions still counted', async () => {
      roster = [
        { id: 'tp-a', first: 'Alice', last: 'Durand', exempt: true },
        { id: 'tp-b', first: 'Bea', last: 'Martin', declined: true },
        { id: 'tp-c', first: 'Cleo', last: 'Petit', going: false },
        { id: 'tp-d', first: 'Dana', last: 'Roux', convoked: false },
        { id: 'tp-e', first: 'Emma', last: 'Vidal' },
      ];

      const result = await detail();

      expect(result.suggestion).toMatchObject({
        kind: 'SUGGESTED',
        candidate: { teamPlayerId: 'tp-e' },
        isFewest: false,
      });
      // Convoked and GOING: Alice, Bea, Emma. One of them exempted.
      expect(result.pool).toEqual({ convokedGoingCount: 3, exemptedCount: 1 });
    });

    it('answers EMPTY_POOL rather than falling back on the roster', async () => {
      roster = DEFAULT_ROSTER.map((r) => ({ ...r, going: false }));

      const result = await detail();

      expect(result.suggestion).toEqual({ kind: 'EMPTY_POOL' });
    });

    it('suggests nothing for a later match, only where the suggestion will come from', async () => {
      nextMatch = { id: 'event-0', startsAt: NEXT_MATCH };
      match = { ...match, startsAt: LATER_MATCH };

      const result = await detail();

      expect(result.suggestion).toEqual({
        kind: 'AFTER_PREVIOUS',
        previousMatchStartsAt: NEXT_MATCH.toISOString(),
      });
    });

    it('carries who brings the set from the previous match, unless that turn was voided', async () => {
      previousMatch = { jerseyDuty: { teamPlayerId: 'tp-b', voidedAt: null } };
      expect((await detail()).broughtBy).toEqual({
        teamPlayerId: 'tp-b',
        firstName: 'Bea',
        lastName: 'Martin',
      });

      previousMatch = { jerseyDuty: { teamPlayerId: 'tp-b', voidedAt: NOW } };
      expect((await detail()).broughtBy).toBeNull();
    });

    it('shows the holder, who accepted (first name and initial) and no suggestion', async () => {
      duty = dutyRow({
        teamPlayerId: 'tp-b',
        acceptedAt: NOW,
        acceptedByUserId: 'user-9',
        acceptedBy: { id: 'user-9', firstName: 'Sophie', lastName: 'Martin' },
      });

      const result = await detail();

      expect(result.status).toBe('ACCEPTED');
      expect(result.holder).toMatchObject({ teamPlayerId: 'tp-b', gender: 'WOMEN' });
      expect(result.acceptedBy).toEqual({ firstName: 'Sophie', lastInitial: 'M', isMe: false });
      expect(result.suggestion).toBeNull();
    });

    it('flags a holder nobody can tell as unreachable, to a manager only', async () => {
      roster = [{ id: 'tp-a', first: 'Alice', last: 'Durand', userId: null, guardians: 0 }];
      duty = dutyRow({ teamPlayerId: 'tp-a' });

      // A peer can't learn who has an account: they read `true`.
      expect((await detail()).holder?.reachable).toBe(true);
      teamManagerGuard.isTeamManager.mockResolvedValue(true);
      expect((await detail()).holder?.reachable).toBe(false);

      roster = [{ id: 'tp-a', first: 'Alice', last: 'Durand', userId: null, guardians: 1 }];
      expect((await detail()).holder?.reachable).toBe(true);
    });

    it('hides reachability from a peer on the suggestion too', async () => {
      roster = [{ id: 'tp-a', first: 'Alice', last: 'Durand', userId: null, guardians: 0 }];
      personaTeamPlayerId = 'tp-a';

      expect((await detail()).suggestion).toMatchObject({ candidate: { reachable: true } });
      teamManagerGuard.isTeamManager.mockResolvedValue(true);
      expect((await detail()).suggestion).toMatchObject({ candidate: { reachable: false } });
    });

    it('locks everything for a player once the match has started, the manager keeps canManage', async () => {
      match = { ...match, startsAt: PAST_MATCH };
      nextMatch = null;
      teamManagerGuard.isTeamManager.mockResolvedValue(true);

      const result = await detail();

      expect(result.locked).toBe(true);
      expect(result.suggestion).toBeNull();
      expect(result.rights).toEqual({
        canAccept: false,
        canDecline: false,
        canSwap: false,
        canCancelSwap: false,
        canRespondToSwap: false,
        canManage: true,
      });
    });

    it('lets the swap target answer and the holder cancel a pending swap', async () => {
      duty = dutyRow({
        teamPlayerId: 'tp-a',
        acceptedAt: NOW,
        swapToTeamPlayerId: 'tp-b',
        swapRequestedAt: NOW,
      });

      const asHolder = await detail();
      expect(asHolder.pendingSwap).toEqual({
        to: { teamPlayerId: 'tp-b', firstName: 'Bea', lastName: 'Martin' },
        requestedAt: NOW.toISOString(),
      });
      expect(asHolder.rights).toMatchObject({ canCancelSwap: true, canSwap: false });
      expect(asHolder.swapCandidates).toEqual([]);

      personaTeamPlayerId = 'tp-b';
      expect((await detail()).rights.canRespondToSwap).toBe(true);
    });

    it('lets a pool member volunteer over an un-accepted holder, never over an accepted one', async () => {
      personaTeamPlayerId = 'tp-b';
      duty = dutyRow({ teamPlayerId: 'tp-a' });
      expect((await detail()).rights.canAccept).toBe(true);

      duty = dutyRow({ teamPlayerId: 'tp-a', acceptedAt: NOW });
      const result = await detail();
      expect(result.rights.canAccept).toBe(false);
      expect(result.rights.canDecline).toBe(false);
    });

    it('reads the manager rights only for the caller themself, not when acting for a child', async () => {
      teamManagerGuard.isTeamManager.mockResolvedValue(true);

      expect((await detail()).rights.canManage).toBe(true);
      expect((await detail('p-child')).rights.canManage).toBe(false);
      expect(teamManagerGuard.isTeamManager).toHaveBeenCalledTimes(1);
    });

    it('refuses a player the caller may not act for, rather than reporting « not rostered »', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue(null);
      prisma.player.findFirst.mockResolvedValue(null);

      await expect(detail('p-stranger')).rejects.toThrow(ForbiddenException);
    });

    it('reads a persona who is not on the roster as having no rights at all', async () => {
      personaTeamPlayerId = null;

      const result = await detail();

      expect(result.rights).toMatchObject({ canAccept: false, canDecline: false, canSwap: false });
    });

    it('answers 409 JERSEY_ROTATION_DISABLED when the team switched the rotation off', async () => {
      prisma.team.findUniqueOrThrow.mockResolvedValue({
        gender: 'WOMEN',
        jerseyRotationEnabled: false,
      });

      await expect(detail()).rejects.toMatchObject({
        response: { code: 'JERSEY_ROTATION_DISABLED' },
      });
      await expect(detail()).rejects.toThrow(ConflictException);
    });

    it('answers 400 for a TRAINING and 404 for an event of another team', async () => {
      match = { ...match, type: 'TRAINING' };
      await expect(detail()).rejects.toThrow(BadRequestException);

      match = { ...match, type: 'MATCH', teamId: 'team-2' };
      await expect(detail()).rejects.toThrow(NotFoundException);

      prisma.clubTeam.findUnique.mockResolvedValue(null);
      await expect(detail()).rejects.toThrow(NotFoundException);
    });

    it('writes nothing and reads in a bounded number of queries', async () => {
      await detail();

      noWrites();
      expect(prisma.eventJerseyDuty.createMany).not.toHaveBeenCalled();
      expect(prisma.teamPlayer.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventJerseyDuty.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('accept', () => {
    const accept = (forPlayerId?: string) =>
      service.accept('club-1', 'team-1', 'event-1', { userId: USER, forPlayerId });

    it('takes the duty as the suggested player, recording the caller', async () => {
      personaTeamPlayerId = 'tp-c';

      await accept();

      expect(prisma.eventJerseyDuty.upsert).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
        create: {
          eventId: 'event-1',
          teamPlayerId: 'tp-c',
          source: 'SELF',
          acceptedAt: NOW,
          acceptedByUserId: USER,
        },
        update: expect.objectContaining({
          teamPlayerId: 'tp-c',
          source: 'SELF',
          acceptedAt: NOW,
          acceptedByUserId: USER,
          swapToTeamPlayerId: null,
          doneAt: null,
          voidedAt: null,
        }),
      });
    });

    it('records the guardian, not the child, when a parent accepts', async () => {
      personaTeamPlayerId = 'tp-c';

      await accept('p-tp-c');

      expect(prisma.eventJerseyDuty.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ acceptedByUserId: USER }) }),
      );
    });

    it('confirms a held-but-unaccepted duty without resetting the turn', async () => {
      duty = dutyRow({ teamPlayerId: 'tp-a', swapToTeamPlayerId: 'tp-b', swapRequestedAt: NOW });

      await accept();

      const { update } = prisma.eventJerseyDuty.upsert.mock.calls[0][0];
      expect(update).toMatchObject({ teamPlayerId: 'tp-a', acceptedAt: NOW });
      expect(update).not.toHaveProperty('swapToTeamPlayerId');
    });

    it('answers success without writing when another guardian already accepted', async () => {
      duty = dutyRow({ teamPlayerId: 'tp-a', acceptedAt: new Date('2026-09-30T10:00:00Z') });

      const result = await accept();

      expect(result.status).toBe('ACCEPTED');
      noWrites();
    });

    it('lets a pool member volunteer over an un-accepted holder, clearing their swap', async () => {
      personaTeamPlayerId = 'tp-b';
      duty = dutyRow({ teamPlayerId: 'tp-a', swapToTeamPlayerId: 'tp-c', swapRequestedAt: NOW });

      await accept();

      expect(prisma.eventJerseyDuty.upsert.mock.calls[0][0].update).toMatchObject({
        teamPlayerId: 'tp-b',
        swapToTeamPlayerId: null,
        swapRequestedAt: null,
      });
    });

    it('refuses to take an accepted holder duty, writing nothing', async () => {
      personaTeamPlayerId = 'tp-b';
      duty = dutyRow({ teamPlayerId: 'tp-a', acceptedAt: NOW });

      await expect(accept()).rejects.toThrow(ForbiddenException);
      noWrites();
    });

    it('refuses a player outside the pool', async () => {
      roster = [
        { id: 'tp-a', first: 'Alice', last: 'Durand', exempt: true },
        { id: 'tp-b', first: 'Bea', last: 'Martin' },
      ];

      await expect(accept()).rejects.toThrow(ForbiddenException);
      noWrites();
    });

    it('refuses a persona who is not on the roster', async () => {
      personaTeamPlayerId = null;

      await expect(accept()).rejects.toThrow(ForbiddenException);
      noWrites();
    });

    it('refuses once the match has started, with its machine code', async () => {
      match = { ...match, startsAt: PAST_MATCH };

      await expect(accept()).rejects.toMatchObject({ response: { code: 'JERSEY_DUTY_LOCKED' } });
      noWrites();
    });

    it('refuses a stranger forPlayerId with a 403', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue(null);
      prisma.player.findFirst.mockResolvedValue(null);

      await expect(accept('p-stranger')).rejects.toThrow(ForbiddenException);
      noWrites();
    });

    it('answers 409 when the rotation is off', async () => {
      prisma.team.findUniqueOrThrow.mockResolvedValue({
        gender: 'WOMEN',
        jerseyRotationEnabled: false,
      });

      await expect(accept()).rejects.toThrow(ConflictException);
      noWrites();
    });
  });

  describe('decline', () => {
    const decline = () =>
      service.decline('club-1', 'team-1', 'event-1', { userId: USER, forPlayerId: undefined });

    it('remembers a decline by the suggested player, with no row to delete', async () => {
      personaTeamPlayerId = 'tp-c';

      await decline();

      expect(prisma.eventJerseyDecline.upsert).toHaveBeenCalledWith({
        where: { eventId_teamPlayerId: { eventId: 'event-1', teamPlayerId: 'tp-c' } },
        create: { eventId: 'event-1', teamPlayerId: 'tp-c' },
        update: {},
      });
      expect(prisma.eventJerseyDuty.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes the row, and so the pending swap, when the holder declines', async () => {
      duty = dutyRow({ teamPlayerId: 'tp-a', swapToTeamPlayerId: 'tp-b' });

      await decline();

      expect(prisma.eventJerseyDuty.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', teamPlayerId: 'tp-a' },
      });
      expect(prisma.eventJerseyDecline.upsert).toHaveBeenCalledTimes(1);
    });

    it('refuses anyone who neither holds nor is suggested the duty', async () => {
      personaTeamPlayerId = 'tp-b';

      await expect(decline()).rejects.toThrow(ForbiddenException);
      noWrites();
    });

    it('refuses once the match has started', async () => {
      match = { ...match, startsAt: PAST_MATCH };

      await expect(decline()).rejects.toMatchObject({ response: { code: 'JERSEY_DUTY_LOCKED' } });
      noWrites();
    });
  });

  describe('proposeSwap', () => {
    const propose = (target: string) =>
      service.proposeSwap(
        'club-1',
        'team-1',
        'event-1',
        { userId: USER, forPlayerId: undefined },
        target,
      );

    // Cleo is the suggested player, so she may propose a swap.
    beforeEach(() => {
      personaTeamPlayerId = 'tp-c';
    });

    it('takes the duty and sets the pending swap in one go', async () => {
      await propose('tp-b');

      expect(prisma.eventJerseyDuty.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ teamPlayerId: 'tp-c', source: 'SELF' }),
        }),
      );
      expect(prisma.eventJerseyDuty.update).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
        data: { swapToTeamPlayerId: 'tp-b', swapRequestedAt: NOW },
      });
    });

    it('refuses a second swap while one is pending', async () => {
      personaTeamPlayerId = 'tp-a';
      duty = dutyRow({ teamPlayerId: 'tp-a', swapToTeamPlayerId: 'tp-b', swapRequestedAt: NOW });

      await expect(propose('tp-c')).rejects.toThrow(ConflictException);
      noWrites();
    });

    it.each([
      ['themself', 'tp-c'],
      ['an exempted player', 'tp-x'],
      ['someone off the team', 'tp-nobody'],
    ])('refuses a swap to %s', async (_label, target) => {
      roster = [...DEFAULT_ROSTER, { id: 'tp-x', first: 'Xena', last: 'Zed', exempt: true }];

      await expect(propose(target)).rejects.toThrow(BadRequestException);
      noWrites();
    });

    it('refuses a player who neither holds nor is suggested the duty', async () => {
      personaTeamPlayerId = 'tp-b';

      await expect(propose('tp-a')).rejects.toThrow(ForbiddenException);
      noWrites();
    });

    it('refuses once the match has started', async () => {
      match = { ...match, startsAt: PAST_MATCH };

      await expect(propose('tp-b')).rejects.toMatchObject({
        response: { code: 'JERSEY_DUTY_LOCKED' },
      });
      noWrites();
    });
  });

  describe('cancelSwap / acceptSwap / refuseSwap', () => {
    const args = { userId: USER, forPlayerId: undefined };
    const pending = () =>
      dutyRow({
        teamPlayerId: 'tp-a',
        acceptedAt: NOW,
        swapToTeamPlayerId: 'tp-b',
        swapRequestedAt: NOW,
      });

    it('lets the holder cancel a pending swap', async () => {
      duty = pending();

      await service.cancelSwap('club-1', 'team-1', 'event-1', args);

      expect(prisma.eventJerseyDuty.update).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
        data: { swapToTeamPlayerId: null, swapRequestedAt: null },
      });
    });

    it('answers 404 when there is no swap to cancel, 403 to anyone but the holder', async () => {
      duty = dutyRow({ teamPlayerId: 'tp-a', acceptedAt: NOW });
      await expect(service.cancelSwap('club-1', 'team-1', 'event-1', args)).rejects.toThrow(
        NotFoundException,
      );

      personaTeamPlayerId = 'tp-b';
      await expect(service.cancelSwap('club-1', 'team-1', 'event-1', args)).rejects.toThrow(
        ForbiddenException,
      );
      noWrites();
    });

    it('moves the duty to the target with a conditional claim, first writer wins', async () => {
      duty = pending();
      personaTeamPlayerId = 'tp-b';

      await service.acceptSwap('club-1', 'team-1', 'event-1', args);

      expect(prisma.eventJerseyDuty.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', swapToTeamPlayerId: 'tp-b' },
        data: expect.objectContaining({
          teamPlayerId: 'tp-b',
          source: 'SWAP',
          acceptedAt: NOW,
          acceptedByUserId: USER,
          swapToTeamPlayerId: null,
          swapRequestedAt: null,
          doneAt: null,
          voidedAt: null,
        }),
      });
    });

    it('answers success when a second guardian answers the same proposal', async () => {
      duty = pending();
      personaTeamPlayerId = 'tp-b';
      prisma.eventJerseyDuty.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.acceptSwap('club-1', 'team-1', 'event-1', args)).resolves.toBeDefined();
    });

    it('refuses a swap that is not proposed to the persona', async () => {
      duty = pending();
      personaTeamPlayerId = 'tp-c';

      await expect(service.acceptSwap('club-1', 'team-1', 'event-1', args)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.refuseSwap('club-1', 'team-1', 'event-1', args)).rejects.toThrow(
        ForbiddenException,
      );
      noWrites();
    });

    it('refuses to accept when the target is no longer in the pool', async () => {
      duty = pending();
      personaTeamPlayerId = 'tp-b';
      roster = DEFAULT_ROSTER.map((r) => (r.id === 'tp-b' ? { ...r, going: false } : r));

      await expect(service.acceptSwap('club-1', 'team-1', 'event-1', args)).rejects.toThrow(
        ConflictException,
      );
      noWrites();
    });

    it('lets the target refuse, leaving the holder in place', async () => {
      duty = pending();
      personaTeamPlayerId = 'tp-b';

      await service.refuseSwap('club-1', 'team-1', 'event-1', args);

      expect(prisma.eventJerseyDuty.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', swapToTeamPlayerId: 'tp-b' },
        data: { swapToTeamPlayerId: null, swapRequestedAt: null },
      });
    });
  });

  describe('assign (manager)', () => {
    const assign = (teamPlayerId: string | null) =>
      service.assign('club-1', 'team-1', 'event-1', USER, teamPlayerId);

    it('assigns any roster member, pool and exemption not required, as MANAGER and un-accepted', async () => {
      roster = [
        ...DEFAULT_ROSTER,
        { id: 'tp-x', first: 'Xena', last: 'Zed', exempt: true, going: false },
      ];

      await assign('tp-x');

      expect(prisma.eventJerseyDuty.upsert).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
        create: { eventId: 'event-1', teamPlayerId: 'tp-x', source: 'MANAGER' },
        update: expect.objectContaining({
          teamPlayerId: 'tp-x',
          source: 'MANAGER',
          acceptedAt: null,
          acceptedByUserId: null,
          swapToTeamPlayerId: null,
          doneAt: null,
          voidedAt: null,
        }),
      });
    });

    it('does nothing when the player already holds it', async () => {
      duty = dutyRow({ teamPlayerId: 'tp-a', acceptedAt: NOW });

      await assign('tp-a');

      noWrites();
    });

    it('refuses someone who is not on the roster', async () => {
      await expect(assign('tp-nobody')).rejects.toThrow(BadRequestException);
      noWrites();
    });

    it('clears before kickoff by deleting the row', async () => {
      duty = dutyRow({ teamPlayerId: 'tp-a' });

      await assign(null);

      expect(prisma.eventJerseyDuty.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
      });
    });

    it('clears after kickoff by keeping the row with no holder, so the freeze skips it', async () => {
      match = { ...match, startsAt: PAST_MATCH };
      duty = dutyRow({ teamPlayerId: 'tp-a' });

      await assign(null);

      expect(prisma.eventJerseyDuty.deleteMany).not.toHaveBeenCalled();
      expect(prisma.eventJerseyDuty.update).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
        data: expect.objectContaining({ teamPlayerId: null, acceptedAt: null, doneAt: null }),
      });
    });

    it('may assign after kickoff', async () => {
      match = { ...match, startsAt: PAST_MATCH };

      await assign('tp-b');

      expect(prisma.eventJerseyDuty.upsert).toHaveBeenCalledTimes(1);
    });

    it('answers 409 when the rotation is off, 400 on a TRAINING', async () => {
      match = { ...match, type: 'TRAINING' };
      await expect(assign('tp-a')).rejects.toThrow(BadRequestException);

      match = { ...match, type: 'MATCH' };
      prisma.team.findUniqueOrThrow.mockResolvedValue({
        gender: 'WOMEN',
        jerseyRotationEnabled: false,
      });
      await expect(assign('tp-a')).rejects.toMatchObject({
        response: { code: 'JERSEY_ROTATION_DISABLED' },
      });
      noWrites();
    });
  });

  describe('setDone / setVoided (manager)', () => {
    beforeEach(() => {
      match = { ...match, startsAt: PAST_MATCH };
      nextMatch = null;
    });

    it('marks and unmarks « Fait », recording the manager', async () => {
      duty = dutyRow({ teamPlayerId: 'tp-a', acceptedAt: NOW });

      await service.setDone('club-1', 'team-1', 'event-1', USER, true);
      expect(prisma.eventJerseyDuty.update).toHaveBeenLastCalledWith({
        where: { eventId: 'event-1' },
        data: { doneAt: NOW, doneByUserId: USER },
      });

      await service.setDone('club-1', 'team-1', 'event-1', USER, false);
      expect(prisma.eventJerseyDuty.update).toHaveBeenLastCalledWith({
        where: { eventId: 'event-1' },
        data: { doneAt: null, doneByUserId: null },
      });
    });

    it('voids and unvoids a turn', async () => {
      duty = dutyRow({ teamPlayerId: 'tp-a' });

      await service.setVoided('club-1', 'team-1', 'event-1', USER, true);
      expect(prisma.eventJerseyDuty.update).toHaveBeenLastCalledWith({
        where: { eventId: 'event-1' },
        data: { voidedAt: NOW, voidedByUserId: USER },
      });

      await service.setVoided('club-1', 'team-1', 'event-1', USER, false);
      expect(prisma.eventJerseyDuty.update).toHaveBeenLastCalledWith({
        where: { eventId: 'event-1' },
        data: { voidedAt: null, voidedByUserId: null },
      });
    });

    it('refuses before kickoff with its machine code', async () => {
      match = { ...match, startsAt: NEXT_MATCH };
      duty = dutyRow({ teamPlayerId: 'tp-a' });

      await expect(
        service.setDone('club-1', 'team-1', 'event-1', USER, true),
      ).rejects.toMatchObject({ response: { code: 'JERSEY_DUTY_NOT_STARTED' } });
      noWrites();
    });

    it('refuses when nobody holds the turn', async () => {
      duty = null;
      await expect(service.setVoided('club-1', 'team-1', 'event-1', USER, true)).rejects.toThrow(
        ConflictException,
      );

      duty = dutyRow({ teamPlayerId: null });
      await expect(service.setDone('club-1', 'team-1', 'event-1', USER, true)).rejects.toThrow(
        ConflictException,
      );
      noWrites();
    });
  });

  describe('getOverview', () => {
    const overview = (season?: number, forPlayerId?: string) =>
      service.getOverview('club-1', 'team-1', USER, season, forPlayerId);

    it('lists the roster in suggestion order, exempted last, with the next match suggestion', async () => {
      roster = [
        { id: 'tp-a', first: 'Alice', last: 'Durand' },
        { id: 'tp-b', first: 'Bea', last: 'Martin', exempt: true },
        { id: 'tp-c', first: 'Cleo', last: 'Petit' },
        { id: 'tp-d', first: 'Dana', last: 'Roux', convoked: false },
      ];
      teamManagerGuard.isTeamManager.mockResolvedValue(true);

      const result = await overview();

      expect(result).toMatchObject({
        seasonYear: 2026,
        teamGender: 'WOMEN',
        enabled: true,
        canManage: true,
      });
      expect(result.rows.map((r) => [r.teamPlayerId, r.turnsThisSeason, r.exempt, r.isMe])).toEqual(
        [
          ['tp-c', 0, false, false],
          ['tp-d', 0, false, false],
          ['tp-a', 2, false, true],
          ['tp-b', 1, true, false],
        ],
      );
      expect(result.rows[0].playerId).toBe('p-tp-c');
      expect(result.nextMatch).toEqual({
        eventId: 'event-1',
        startsAt: NEXT_MATCH.toISOString(),
        holder: null,
        suggestion: { teamPlayerId: 'tp-c', firstName: 'Cleo', lastName: 'Petit' },
      });
    });

    it('shows the holder of the next match instead of a suggestion', async () => {
      prisma.eventJerseyDuty.findUnique.mockResolvedValue(dutyRow({ teamPlayerId: 'tp-b' }));

      const result = await overview();

      expect(result.nextMatch).toMatchObject({
        holder: { teamPlayerId: 'tp-b' },
        suggestion: null,
      });
    });

    it('shows no next match for another season', async () => {
      const result = await overview(2025);

      expect(result.seasonYear).toBe(2025);
      expect(result.nextMatch).toBeNull();
    });

    it('answers on a team with the rotation off so a manager can flip the switch', async () => {
      prisma.team.findUniqueOrThrow.mockResolvedValue({
        gender: 'MEN',
        jerseyRotationEnabled: false,
      });

      const result = await overview();

      expect(result).toMatchObject({ enabled: false, nextMatch: null, rows: [] });
      expect(prisma.teamPlayer.findMany).not.toHaveBeenCalled();
    });

    it('refuses a stranger forPlayerId, and a team outside the club', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue(null);
      prisma.player.findFirst.mockResolvedValue(null);
      await expect(overview(undefined, 'p-stranger')).rejects.toThrow(ForbiddenException);

      prisma.clubTeam.findUnique.mockResolvedValue(null);
      await expect(overview()).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveSummaries', () => {
    it('spends no query on a batch with no MATCH', async () => {
      const result = await service.resolveSummaries(
        'team-1',
        [{ id: 't1', type: 'TRAINING' }],
        null,
      );

      expect(result.size).toBe(0);
      expect(prisma.team.findUnique).not.toHaveBeenCalled();
    });

    it('answers nothing on a team with the rotation off', async () => {
      prisma.team.findUnique.mockResolvedValue({ jerseyRotationEnabled: false });

      const result = await service.resolveSummaries('team-1', [{ id: 'm1', type: 'MATCH' }], null);

      expect(result.size).toBe(0);
      expect(prisma.eventJerseyDuty.findMany).not.toHaveBeenCalled();
    });

    it('builds the holder, status, brought-by and isMine for the whole batch in a fixed number of queries', async () => {
      prisma.eventJerseyDuty.findMany.mockResolvedValue([
        dutyRow({ eventId: 'm1', teamPlayerId: 'tp-a', acceptedAt: NOW }),
      ]);
      prisma.$queryRaw.mockResolvedValue([{ eventId: 'm2', teamPlayerId: 'tp-a' }]);
      prisma.teamPlayer.findMany.mockResolvedValue([
        { id: 'tp-a', player: { firstName: 'Alice', lastName: 'Durand' } },
      ]);

      const result = await service.resolveSummaries(
        'team-1',
        [
          { id: 'm1', type: 'MATCH' },
          { id: 'm2', type: 'MATCH' },
          { id: 't1', type: 'TRAINING' },
        ],
        'tp-a',
      );

      const alice = { teamPlayerId: 'tp-a', firstName: 'Alice', lastName: 'Durand' };
      expect(result.get('m1')).toEqual({
        holder: alice,
        status: 'ACCEPTED',
        broughtBy: null,
        isMine: true,
      });
      expect(result.get('m2')).toEqual({
        holder: null,
        status: 'UNASSIGNED',
        broughtBy: alice,
        isMine: false,
      });
      expect(result.has('t1')).toBe(false);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.teamPlayer.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventJerseyDuty.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('freezeDue', () => {
    const due = [{ id: 'event-1', teamId: 'team-1', startsAt: PAST_MATCH }];

    it('selects started matches of the last 7 days with the rotation on and no row, oldest first, capped', async () => {
      await service.freezeDue(NOW);

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: {
          type: 'MATCH',
          startsAt: { gt: new Date('2026-09-24T12:00:00.000Z'), lte: NOW },
          team: { jerseyRotationEnabled: true },
          jerseyDuty: null,
        },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 200,
        select: { id: true, teamId: true, startsAt: true, opponentName: true },
      });
    });

    it('assigns the suggested player as SUGGESTION, letting a concurrent write win', async () => {
      prisma.event.findMany.mockResolvedValue(due);

      const summary = await service.freezeDue(NOW);

      expect(prisma.eventJerseyDuty.createMany).toHaveBeenCalledWith({
        data: [{ eventId: 'event-1', teamPlayerId: 'tp-c', source: 'SUGGESTION' }],
        skipDuplicates: true,
      });
      expect(summary).toEqual({ considered: 1, frozen: 1 });
    });

    it('records an empty pool as a holder-less SUGGESTION row, notifying nobody', async () => {
      prisma.event.findMany.mockResolvedValue(due);
      roster = DEFAULT_ROSTER.map((r) => ({ ...r, going: false }));

      const summary = await service.freezeDue(NOW);

      expect(prisma.eventJerseyDuty.createMany).toHaveBeenCalledWith({
        data: [{ eventId: 'event-1', teamPlayerId: null, source: 'SUGGESTION' }],
        skipDuplicates: true,
      });
      expect(notifications.notify).not.toHaveBeenCalled();
      expect(summary).toEqual({ considered: 1, frozen: 0 });
    });

    it('does not count a row a manager wrote first', async () => {
      prisma.event.findMany.mockResolvedValue(due);
      prisma.eventJerseyDuty.createMany.mockResolvedValue({ count: 0 });

      expect(await service.freezeDue(NOW)).toEqual({ considered: 1, frozen: 0 });
    });
  });
  describe('notifications', () => {
    const args = { userId: USER, forPlayerId: undefined };
    const sent = () => notifications.notify.mock.calls.flatMap(([inputs]) => inputs);
    const swapPending = () =>
      dutyRow({
        teamPlayerId: 'tp-a',
        acceptedAt: NOW,
        swapToTeamPlayerId: 'tp-b',
        swapRequestedAt: NOW,
      });

    it('tells a manager-assigned player, with the match and date', async () => {
      await service.assign('club-1', 'team-1', 'event-1', USER, 'tp-c');

      expect(sent()).toEqual([
        {
          userId: 'u-tp-c',
          type: 'JERSEY_DUTY_ASSIGNED',
          title: 'Lavage des maillots',
          body: 'Vous lavez les maillots après le match contre BC Rezé dimanche 4 oct.',
          subjectFirstName: null,
          deepLink: '/clubs/club-1/teams/team-1/events/event-1',
        },
      ]);
    });

    it('tells a child’s guardians, tagged and linked through the child’s club', async () => {
      roster = [{ id: 'tp-k', first: 'Léo', last: 'Roy', userId: null, guardians: 1 }, ...roster];
      prisma.clubMembership.findMany.mockResolvedValue([]);

      await service.assign('club-1', 'team-1', 'event-1', USER, 'tp-k');

      expect(sent()).toEqual([
        expect.objectContaining({
          userId: 'g-tp-k-0',
          body: 'Léo lave les maillots après le match contre BC Rezé dimanche 4 oct.',
          subjectFirstName: 'Léo',
          deepLink: '/clubs/club-1/teams/team-1/events/event-1?pour=p-tp-k',
        }),
      ]);
    });

    it('does not notify the caller about their own assignment', async () => {
      roster = [{ id: 'tp-m', first: 'Mia', last: 'Roy', userId: USER }, ...roster];

      await service.assign('club-1', 'team-1', 'event-1', USER, 'tp-m');

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('sends nothing when the same holder is re-assigned', async () => {
      duty = dutyRow({ teamPlayerId: 'tp-c' });

      await service.assign('club-1', 'team-1', 'event-1', USER, 'tp-c');

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('sends nothing when a holder is cleared', async () => {
      duty = dutyRow({ teamPlayerId: 'tp-c' });

      await service.assign('club-1', 'team-1', 'event-1', USER, null);

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('sends nothing for a player nobody can reach', async () => {
      roster = [{ id: 'tp-n', first: 'Noa', last: 'Roy', userId: null }, ...roster];

      await service.assign('club-1', 'team-1', 'event-1', USER, 'tp-n');

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('links a self reader through the club they belong to on a CTC team', async () => {
      prisma.clubTeam.findMany.mockResolvedValue([
        { clubId: 'club-1', isOwner: true },
        { clubId: 'club-2', isOwner: false },
      ]);
      prisma.clubMembership.findMany.mockResolvedValue([{ userId: 'u-tp-c', clubId: 'club-2' }]);

      await service.assign('club-1', 'team-1', 'event-1', USER, 'tp-c');

      expect(sent()[0].deepLink).toBe('/clubs/club-2/teams/team-1/events/event-1');
    });

    it('tells the swap target who proposes, and not the proposer', async () => {
      personaTeamPlayerId = 'tp-c';

      await service.proposeSwap('club-1', 'team-1', 'event-1', args, 'tp-b');

      expect(sent()).toEqual([
        expect.objectContaining({
          userId: 'u-tp-b',
          type: 'JERSEY_SWAP_REQUESTED',
          title: 'Échange proposé',
          body: 'Cleo P. vous propose de laver les maillots à sa place après le match contre BC Rezé dimanche 4 oct.',
        }),
      ]);
    });

    it('tells the previous holder, not the new one, when a swap is accepted', async () => {
      duty = swapPending();
      personaTeamPlayerId = 'tp-b';

      await service.acceptSwap('club-1', 'team-1', 'event-1', args);

      expect(sent()).toEqual([
        expect.objectContaining({
          userId: 'u-tp-a',
          type: 'JERSEY_DUTY_ASSIGNED',
          title: 'Lavage des maillots',
          body: 'Bea M. a accepté votre échange. Elle lave les maillots après le match contre BC Rezé.',
        }),
      ]);
    });

    it('sends nothing when the swap claim was lost', async () => {
      duty = swapPending();
      personaTeamPlayerId = 'tp-b';
      prisma.eventJerseyDuty.updateMany.mockResolvedValue({ count: 0 });

      await service.acceptSwap('club-1', 'team-1', 'event-1', args);

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('notifies nobody on a refused or cancelled swap', async () => {
      duty = swapPending();
      personaTeamPlayerId = 'tp-b';
      await service.refuseSwap('club-1', 'team-1', 'event-1', args);
      personaTeamPlayerId = 'tp-a';
      await service.cancelSwap('club-1', 'team-1', 'event-1', args);

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('never fails the write when notifying rejects', async () => {
      notifications.notify.mockRejectedValue(new Error('boom'));

      await expect(
        service.assign('club-1', 'team-1', 'event-1', USER, 'tp-c'),
      ).resolves.toBeDefined();
    });

    it('notifies only the rows the freeze job actually created', async () => {
      prisma.event.findMany.mockResolvedValue([
        { id: 'event-1', teamId: 'team-1', startsAt: PAST_MATCH, opponentName: 'BC Rezé' },
      ]);
      await service.freezeDue(NOW);
      expect(sent()).toEqual([
        expect.objectContaining({
          userId: 'u-tp-c',
          body: 'Vous lavez les maillots après le match contre BC Rezé dimanche 20 sept.',
        }),
      ]);

      notifications.notify.mockClear();
      prisma.eventJerseyDuty.createMany.mockResolvedValue({ count: 0 });
      await service.freezeDue(NOW);
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });
});
