import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import {
  minorBirthDateBound,
  parseStatusList,
  PlatformAdminBrowseService,
} from './platform-admin-browse.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const DAY = 24 * 60 * 60 * 1000;

function buildRequest(): Request {
  return {
    headers: { 'user-agent': 'jest' },
    socket: { remoteAddress: '203.0.113.7' },
  } as unknown as Request;
}

function mockModel() {
  return {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    groupBy: jest.fn().mockResolvedValue([]),
  };
}

const dpo = { id: 'admin-1', email: 'dpo@kluvo.net', role: 'DATA_OFFICER' as const };
const support = { id: 'admin-2', email: 'support@kluvo.net', role: 'SUPPORT' as const };

const team = { id: 'team-1', name: 'U13 F', category: 'U13', gender: 'WOMEN' };

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-9',
    email: 'jean.dupont@example.org',
    firstName: 'Jean',
    lastName: 'Dupont',
    emailVerifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastActiveAt: new Date(Date.now() - 10 * DAY),
    platformAdmin: null,
    _count: { memberships: 2, guardianOf: 1 },
    ...overrides,
  };
}

function playerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'player-3',
    firstName: 'Léo',
    lastName: 'Martin',
    user: null,
    userId: null,
    birthDate: new Date(Date.now() - 12 * 365 * DAY),
    createdAt: new Date('2026-02-01T00:00:00Z'),
    club: { id: 'club-1', name: 'BC Nantes' },
    _count: { teamPlayers: 1, parentalConsents: 0 },
    ...overrides,
  };
}

describe('PlatformAdminBrowseService', () => {
  let service: PlatformAdminBrowseService;
  let audit: { recordAndWait: jest.Mock };
  let prisma: Record<string, ReturnType<typeof mockModel>>;

  beforeEach(async () => {
    audit = { recordAndWait: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      club: mockModel(),
      clubMembership: mockModel(),
      team: mockModel(),
      teamPlayer: mockModel(),
      user: mockModel(),
      refreshToken: mockModel(),
      player: mockModel(),
      event: mockModel(),
      eventRsvp: mockModel(),
      eventScoresheet: mockModel(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAdminBrowseService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(PlatformAdminBrowseService);
  });

  describe('listClubs', () => {
    it('matches the name by substring or the FFBB code exactly, and counts admins in one query', async () => {
      prisma.club.count.mockResolvedValue(1);
      prisma.club.findMany.mockResolvedValue([
        {
          id: 'club-1',
          name: 'BC Nantes',
          ffbbClubCode: 'PDL0044001',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          _count: { memberships: 12, clubTeams: 3, players: 40 },
        },
      ]);
      prisma.clubMembership.groupBy.mockResolvedValue([{ clubId: 'club-1', _count: { _all: 2 } }]);

      const result = await service.listClubs({ q: 'pdl0044001', hasAdmin: 'false' });

      expect(prisma.club.findMany.mock.calls[0][0].where).toEqual({
        AND: [
          {
            OR: [
              { name: { contains: 'pdl0044001', mode: 'insensitive' } },
              { ffbbClubCode: 'PDL0044001' },
            ],
          },
          { memberships: { none: { role: 'ADMIN' } } },
        ],
      });
      expect(result.items[0]).toMatchObject({ memberCount: 12, adminCount: 2, teamCount: 3 });
      expect(prisma.clubMembership.groupBy).toHaveBeenCalledTimes(1);
    });

    it('ignores a one-character search', async () => {
      await service.listClubs({ q: 'a' });
      expect(prisma.club.findMany.mock.calls[0][0].where).toEqual({ AND: [] });
    });

    it('404s an unknown club', async () => {
      await expect(service.getClub('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listTeams', () => {
    it('splits the owning club from its CTC partners', async () => {
      prisma.team.findMany.mockResolvedValue([
        {
          ...team,
          createdAt: new Date(),
          clubTeams: [
            { isOwner: false, club: { id: 'club-2', name: 'ES Rezé' } },
            { isOwner: true, club: { id: 'club-1', name: 'BC Nantes' } },
          ],
          _count: { teamPlayers: 11, teamAdmins: 0 },
        },
      ]);

      const result = await service.listTeams({ clubId: 'club-2', hasAdmin: 'false' });

      expect(prisma.team.findMany.mock.calls[0][0].where).toEqual({
        AND: [{ clubTeams: { some: { clubId: 'club-2' } } }, { teamAdmins: { none: {} } }],
      });
      expect(result.items[0].ownerClub).toEqual({ id: 'club-1', name: 'BC Nantes' });
      expect(result.items[0].partnerClubs).toEqual([{ id: 'club-2', name: 'ES Rezé' }]);
    });
  });

  describe('listUsers', () => {
    it('gives SUPPORT an exact e-mail match only, and redacted rows', async () => {
      prisma.user.findMany.mockResolvedValue([userRow()]);

      const result = await service.listUsers('SUPPORT', { q: 'Jean.Dupont@example.org' });

      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        AND: [{ email: { equals: 'Jean.Dupont@example.org', mode: 'insensitive' } }],
      });
      expect(result.items[0].person.displayName).toBe('J. D.');
      expect(JSON.stringify(result)).not.toContain('Dupont');
    });

    it('gives a DATA_OFFICER substring search over names and addresses', async () => {
      await service.listUsers('DATA_OFFICER', { q: 'jean dup' });

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.AND[0].OR).toEqual(
        expect.arrayContaining([
          { email: { contains: 'jean dup', mode: 'insensitive' } },
          {
            AND: [
              { firstName: { contains: 'jean', mode: 'insensitive' } },
              { lastName: { contains: 'dup', mode: 'insensitive' } },
            ],
          },
        ]),
      );
    });

    it("finds a team's managers, linked players and their parents", async () => {
      await service.listUsers('DATA_OFFICER', { teamId: 'team-1' });

      const onTeam = { teamPlayers: { some: { teamId: 'team-1' } } };
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        AND: [
          {
            OR: [
              { teamAdmins: { some: { teamId: 'team-1' } } },
              { linkedPlayers: { some: onTeam } },
              { guardianOf: { some: { player: onTeam } } },
            ],
          },
        ],
      });
    });

    it('lists the inactivity cutoff oldest first, with a negative countdown past it', async () => {
      prisma.user.findMany.mockResolvedValue([
        userRow({ lastActiveAt: new Date(Date.now() - 400 * DAY) }),
      ]);

      const result = await service.listUsers('SUPPORT', { inactiveSoon: 'true' });

      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual([{ lastActiveAt: 'asc' }, { id: 'asc' }]);
      expect(args.where.AND[0].lastActiveAt.lt).toBeInstanceOf(Date);
      expect(result.items[0].daysUntilErasure).toBeLessThan(0);
    });
  });

  describe('getUser', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        ...userRow(),
        memberships: [
          { role: 'ADMIN', createdAt: new Date(), club: { id: 'club-1', name: 'BC Nantes' } },
        ],
        teamAdmins: [{ createdAt: new Date(), team }],
        linkedPlayers: [
          {
            ...playerRow({ id: 'player-1', firstName: 'Jean', lastName: 'Dupont' }),
            teamPlayers: [{ team }],
          },
        ],
        guardianOf: [{ createdAt: new Date(), player: playerRow() }],
      });
      prisma.refreshToken.count.mockResolvedValue(2);
    });

    it('audits a DATA_OFFICER read before returning it', async () => {
      const order: string[] = [];
      audit.recordAndWait.mockImplementation(async () => order.push('audit'));

      const detail = await service.getUser(dpo, 'user-9', buildRequest());
      order.push('returned');

      expect(order).toEqual(['audit', 'returned']);
      expect(audit.recordAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ADMIN_PII_VIEWED',
          userId: 'admin-1',
          metadata: { subjectUserId: 'user-9', subjectEmail: 'jean.dupont@example.org' },
          context: { ipAddress: '203.0.113.7', userAgent: 'jest' },
        }),
      );
      expect(detail.person.email).toBe('jean.dupont@example.org');
      expect(detail.linkedPlayers[0].teams).toEqual([team]);
      expect(detail.activeSessionCount).toBe(2);
    });

    it('lets SUPPORT read the record redacted, without an audit row', async () => {
      const detail = await service.getUser(support, 'user-9', buildRequest());

      expect(audit.recordAndWait).not.toHaveBeenCalled();
      expect(detail.person).toMatchObject({ displayName: 'J. D.', email: null });
      expect(detail.guardianOf[0].player.displayName).toBe('L. M.');
      expect(JSON.stringify(detail)).not.toContain('Dupont');
    });

    it('does not audit a view of an account that does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getUser(dpo, 'ghost', buildRequest())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(audit.recordAndWait).not.toHaveBeenCalled();
    });
  });

  describe('listPlayers', () => {
    it('finds minors with no consent on record, in SQL', async () => {
      prisma.player.findMany.mockResolvedValue([playerRow()]);

      const result = await service.listPlayers('SUPPORT', { missingConsent: 'true' });

      const clause = prisma.player.findMany.mock.calls[0][0].where.AND[0];
      expect(clause.parentalConsents).toEqual({ none: {} });
      expect(clause.birthDate.gt).toBeInstanceOf(Date);
      expect(result.items[0]).toMatchObject({ isMinor: true, consentState: 'missing' });
    });

    it('reports an unknown birth date as unknown, not as an adult', async () => {
      prisma.player.findMany.mockResolvedValue([playerRow({ birthDate: null })]);

      const result = await service.listPlayers('SUPPORT', {});

      expect(result.items[0]).toMatchObject({ isMinor: null, consentState: 'unknown' });
    });

    it('searches players for SUPPORT by the linked account e-mail only', async () => {
      await service.listPlayers('SUPPORT', { q: 'Martin' });
      expect(prisma.player.findMany.mock.calls[0][0].where).toEqual({
        AND: [{ user: { email: { equals: 'Martin', mode: 'insensitive' } } }],
      });
    });
  });

  describe('getPlayer', () => {
    beforeEach(() => {
      prisma.player.findUnique.mockResolvedValue({
        ...playerRow({
          userId: 'user-5',
          user: { id: 'user-5', email: 'leo@example.org', firstName: 'Léo', lastName: 'Martin' },
        }),
        gender: 'MEN',
        licenseNumber: 'VT123456',
        teamPlayers: [{ id: 'tp-1', role: 'PLAYER', team }],
        guardians: [
          {
            createdAt: new Date(),
            user: {
              id: 'user-6',
              email: 'sophie@example.org',
              firstName: 'Sophie',
              lastName: 'Martin',
            },
          },
        ],
        guardianInvites: [
          {
            id: 'gi-1',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() - DAY),
            acceptedAt: null,
          },
          {
            id: 'gi-2',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + DAY),
            acceptedAt: null,
          },
        ],
        invite: { createdAt: new Date(), expiresAt: new Date(), acceptedAt: new Date() },
        parentalConsents: [
          {
            id: 'pc-1',
            source: 'STAFF_ATTESTATION',
            attestedByName: 'Sophie Martin',
            consentGivenAt: new Date(),
          },
        ],
      });
    });

    it('audits a DATA_OFFICER read with the player, and the account when linked', async () => {
      const detail = await service.getPlayer(dpo, 'player-3', buildRequest());

      expect(audit.recordAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ADMIN_PII_VIEWED',
          metadata: { subjectPlayerId: 'player-3', subjectUserId: 'user-5' },
        }),
      );
      expect(detail.licenseNumber).toBe('VT123456');
      expect(detail.birthDate).not.toBeNull();
      expect(detail.guardianInvites.map((invite) => invite.state)).toEqual(['expired', 'live']);
      expect(detail.playerInvite?.state).toBe('accepted');
    });

    it('hides birth date, licence and the attester from SUPPORT', async () => {
      const detail = await service.getPlayer(support, 'player-3', buildRequest());

      expect(audit.recordAndWait).not.toHaveBeenCalled();
      expect(detail).toMatchObject({ birthDate: null, licenseNumber: null, isMinor: true });
      expect(detail.consents[0].attestedBy).toBe('S. M.');
      expect(JSON.stringify(detail)).not.toMatch(/Sophie|Martin|VT123456/);
    });
  });

  describe('listEvents', () => {
    it('counts answers per event in one grouped query', async () => {
      prisma.event.findMany.mockResolvedValue([
        {
          id: 'event-1',
          type: 'MATCH',
          startsAt: new Date('2026-10-03T14:00:00Z'),
          location: 'Gymnase',
          opponentName: 'ASB Rezé',
          team,
          scoresheet: { status: 'FAILED' },
          _count: { convocations: 10 },
        },
      ]);
      prisma.eventRsvp.groupBy.mockResolvedValue([
        { eventId: 'event-1', status: 'GOING', _count: { _all: 7 } },
        { eventId: 'event-1', status: 'MAYBE', _count: { _all: 1 } },
      ]);

      const result = await service.listEvents({ clubId: 'club-1' });

      expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({
        AND: [{ team: { clubTeams: { some: { clubId: 'club-1' } } } }],
      });
      expect(result.items[0]).toMatchObject({
        rsvpCounts: { going: 7, notGoing: 0, maybe: 1 },
        convocationCount: 10,
        scoresheetStatus: 'FAILED',
      });
    });
  });

  describe('listScoresheets', () => {
    it('filters on a list of statuses', async () => {
      await service.listScoresheets({ status: 'FAILED,NEEDS_REVIEW' });
      expect(prisma.eventScoresheet.findMany.mock.calls[0][0].where).toEqual({
        AND: [{ status: { in: ['FAILED', 'NEEDS_REVIEW'] } }],
      });
    });
  });

  describe('helpers', () => {
    it('drops unknown statuses from a list', () => {
      expect(parseStatusList('FAILED, nope,QUEUED')).toEqual(['FAILED', 'QUEUED']);
    });

    it('puts the minor bound eighteen years back', () => {
      expect(minorBirthDateBound(new Date('2026-09-28T10:00:00Z')).toISOString()).toBe(
        '2008-09-28T10:00:00.000Z',
      );
    });
  });
});
