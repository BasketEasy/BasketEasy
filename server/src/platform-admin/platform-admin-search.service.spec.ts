import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PlatformAdminSearchService } from './platform-admin-search.service';
import { PrismaService } from '../prisma/prisma.service';

const ID = '4f2c9a1e-8b3d-4c55-9e10-7a6b2d9c0f31';

function mockModel() {
  return {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  };
}

describe('PlatformAdminSearchService', () => {
  let service: PlatformAdminSearchService;
  let prisma: Record<'club' | 'team' | 'user' | 'player' | 'event', ReturnType<typeof mockModel>>;

  beforeEach(async () => {
    prisma = {
      club: mockModel(),
      team: mockModel(),
      user: mockModel(),
      player: mockModel(),
      event: mockModel(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlatformAdminSearchService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PlatformAdminSearchService);
  });

  it('refuses a query too short to mean anything', async () => {
    await expect(service.search('DATA_OFFICER', ' a ')).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('an id', () => {
    it('is looked up in every table at once, whatever it identifies', async () => {
      prisma.player.findUnique.mockResolvedValue({
        id: ID,
        firstName: 'Léo',
        lastName: 'Bernard',
        user: null,
        club: { name: 'BC Nantes Erdre' },
      });

      const result = await service.search('SUPPORT', ID.toUpperCase());

      for (const model of Object.values(prisma)) {
        expect(model.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: ID } }),
        );
        expect(model.findMany).not.toHaveBeenCalled();
      }
      // SUPPORT gets the redacted label, as in every list.
      expect(result.exactId).toEqual({
        kind: 'player',
        id: ID,
        label: 'L. B.',
        sublabel: 'BC Nantes Erdre',
      });
      expect(result.unknownId).toBe(false);
    });

    it('labels an event by what it is', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: ID,
        type: 'MATCH',
        opponentName: 'ASB Rezé',
        startsAt: new Date('2026-10-03T12:00:00Z'),
        team: { name: 'U13 F' },
      });

      const result = await service.search('DATA_OFFICER', ID);

      expect(result.exactId?.label).toBe('Match · ASB Rezé');
      expect(result.exactId?.sublabel).toContain('U13 F');
    });

    it('says so when nothing has that id', async () => {
      const result = await service.search('DATA_OFFICER', ID);
      expect(result).toMatchObject({ exactId: null, unknownId: true });
    });
  });

  describe('text', () => {
    it('matches clubs by name or FFBB code and caps each group at five', async () => {
      await service.search('SUPPORT', 'pdl0044012');

      expect(prisma.club.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'pdl0044012', mode: 'insensitive' } },
              { ffbbClubCode: 'PDL0044012' },
            ],
          },
          take: 5,
        }),
      );
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });

    it('matches people for SUPPORT by exact e-mail only', async () => {
      await service.search('SUPPORT', 'bernard');

      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        email: { equals: 'bernard', mode: 'insensitive' },
      });
      expect(prisma.player.findMany.mock.calls[0][0].where).toEqual({
        user: { email: { equals: 'bernard', mode: 'insensitive' } },
      });
    });

    it('matches people for a DATA_OFFICER by name and labels them in full', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'n.bernard@example.fr',
          firstName: 'Nicolas',
          lastName: 'Bernard',
          emailVerifiedAt: null,
        },
      ]);

      const result = await service.search('DATA_OFFICER', 'bernard');

      expect(prisma.user.findMany.mock.calls[0][0].where.OR).toEqual(
        expect.arrayContaining([{ lastName: { contains: 'bernard', mode: 'insensitive' } }]),
      );
      expect(result.groups.user).toEqual([
        {
          kind: 'user',
          id: 'user-1',
          label: 'Nicolas Bernard',
          sublabel: 'n.bernard@example.fr',
          emailVerified: false,
        },
      ]);
    });
  });
});
