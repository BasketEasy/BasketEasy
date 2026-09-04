import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FfbbPouleService } from './ffbb-poule.service';
import { FFBB_PROVIDER, FfbbPageFormatError } from './ffbb-provider';
import { PrismaService } from '../prisma/prisma.service';

describe('FfbbPouleService', () => {
  let service: FfbbPouleService;
  let prisma: {
    clubTeam: { findUnique: jest.Mock };
    teamFfbbLink: { findFirst: jest.Mock };
  };
  let ffbbProvider: { getMatchesForEngagement: jest.Mock; getPouleStandings: jest.Mock };

  beforeEach(async () => {
    prisma = {
      clubTeam: { findUnique: jest.fn() },
      teamFfbbLink: { findFirst: jest.fn() },
    };
    ffbbProvider = { getMatchesForEngagement: jest.fn(), getPouleStandings: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FfbbPouleService,
        { provide: PrismaService, useValue: prisma },
        { provide: FFBB_PROVIDER, useValue: ffbbProvider },
      ],
    }).compile();

    service = module.get<FfbbPouleService>(FfbbPouleService);
  });

  function stubTeamInClub() {
    prisma.clubTeam.findUnique.mockResolvedValue({ clubId: 'club-1', teamId: 'team-1' });
  }

  it('404s when the team is not in the club', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue(null);

    await expect(service.getPouleResults('club-1', 'team-1')).rejects.toThrow(NotFoundException);
    expect(prisma.teamFfbbLink.findFirst).not.toHaveBeenCalled();
  });

  it('404s when the team has no FFBB link', async () => {
    stubTeamInClub();
    prisma.teamFfbbLink.findFirst.mockResolvedValue(null);

    await expect(service.getPouleResults('club-1', 'team-1')).rejects.toThrow(NotFoundException);
    expect(ffbbProvider.getMatchesForEngagement).not.toHaveBeenCalled();
  });

  it('picks the most recently created link when the team has several', async () => {
    stubTeamInClub();
    prisma.teamFfbbLink.findFirst.mockResolvedValue({
      id: 'link-1',
      ffbbEngagementRef: 'ligues/pdl/comites/0044/clubs/pdl0044190/equipes/200000005346381',
    });
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: 'Seniors M D3',
      matches: [],
      pouleRef: 'ligues/pdl/comites/0044/competitions/dm3?phase=1&poule=2',
    });
    ffbbProvider.getPouleStandings.mockResolvedValue({ standings: [], matchdays: [] });

    await service.getPouleResults('club-1', 'team-1');

    expect(prisma.teamFfbbLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: 'team-1' }, orderBy: { createdAt: 'desc' } }),
    );
  });

  it('resolves ourEngagementId from the stored ref and passes it through', async () => {
    stubTeamInClub();
    prisma.teamFfbbLink.findFirst.mockResolvedValue({
      id: 'link-1',
      ffbbEngagementRef: 'ligues/pdl/comites/0044/clubs/pdl0044190/equipes/200000005346381',
    });
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: 'Seniors M D3',
      matches: [],
      pouleRef: 'ligues/pdl/comites/0044/competitions/dm3?phase=1&poule=2',
    });
    ffbbProvider.getPouleStandings.mockResolvedValue({ standings: [], matchdays: [] });

    await service.getPouleResults('club-1', 'team-1');

    expect(ffbbProvider.getPouleStandings).toHaveBeenCalledWith(
      'ligues/pdl/comites/0044/competitions/dm3?phase=1&poule=2',
      '200000005346381',
    );
  });

  it('returns the combined competitionLabel/standings/matchdays', async () => {
    stubTeamInClub();
    prisma.teamFfbbLink.findFirst.mockResolvedValue({
      id: 'link-1',
      ffbbEngagementRef: 'ligues/pdl/comites/0044/clubs/pdl0044190/equipes/200000005346381',
    });
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: 'Seniors M D3',
      matches: [],
      pouleRef: 'ligues/pdl/comites/0044/competitions/dm3?phase=1&poule=2',
    });
    const standings = [{ teamLabel: 'Us', played: 3, won: 2, lost: 1, points: 5, isOurTeam: true }];
    const matchdays = [
      {
        matchdayLabel: 'Journée 2',
        results: [
          {
            homeLabel: 'Us',
            awayLabel: 'Them',
            homeScore: 68,
            awayScore: 61,
            involvesOurTeam: true,
          },
        ],
      },
    ];
    ffbbProvider.getPouleStandings.mockResolvedValue({ standings, matchdays });

    const result = await service.getPouleResults('club-1', 'team-1');

    expect(result).toEqual({ competitionLabel: 'Seniors M D3', standings, matchdays });
  });

  it('wraps a null pouleRef into the friendly not-available error', async () => {
    stubTeamInClub();
    prisma.teamFfbbLink.findFirst.mockResolvedValue({
      id: 'link-1',
      ffbbEngagementRef: 'ligues/pdl/comites/0044/clubs/pdl0044190/equipes/200000005346381',
    });
    ffbbProvider.getMatchesForEngagement.mockResolvedValue({
      competitionLabel: null,
      matches: [],
      pouleRef: null,
    });

    await expect(service.getPouleResults('club-1', 'team-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FFBB_POULE_UNAVAILABLE' }),
    });
    expect(ffbbProvider.getPouleStandings).not.toHaveBeenCalled();
  });

  it('wraps an FfbbPageFormatError from either provider call into the friendly not-available error', async () => {
    stubTeamInClub();
    prisma.teamFfbbLink.findFirst.mockResolvedValue({
      id: 'link-1',
      ffbbEngagementRef: 'ligues/pdl/comites/0044/clubs/pdl0044190/equipes/200000005346381',
    });
    ffbbProvider.getMatchesForEngagement.mockRejectedValue(new FfbbPageFormatError('unreachable'));

    await expect(service.getPouleResults('club-1', 'team-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FFBB_POULE_UNAVAILABLE' }),
    });
  });
});
