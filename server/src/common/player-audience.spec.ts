import type { PrismaClient } from '@prisma/client';
import {
  groupByRecipient,
  recipientDeepLink,
  resolvePlayerAudience,
  type PlayerAudienceEntry,
} from './player-audience';

function entry(overrides: Partial<PlayerAudienceEntry>): PlayerAudienceEntry {
  return {
    teamPlayerId: 'tp-1',
    playerId: 'player-1',
    firstName: 'Léo',
    clubId: 'club-1',
    userId: null,
    guardianUserIds: [],
    ...overrides,
  };
}

describe('resolvePlayerAudience', () => {
  it('reads every slot’s player and guardians in one query', async () => {
    const prisma = {
      teamPlayer: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tp-1',
            player: {
              id: 'player-1',
              firstName: 'Léo',
              clubId: 'club-1',
              userId: null,
              guardians: [{ userId: 'parent-1' }],
            },
          },
        ]),
      },
    };

    const result = await resolvePlayerAudience(prisma as unknown as PrismaClient, ['tp-1']);

    expect(prisma.teamPlayer.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual([entry({ guardianUserIds: ['parent-1'] })]);
  });

  it('skips the query for nobody', async () => {
    const prisma = { teamPlayer: { findMany: jest.fn() } };
    await expect(resolvePlayerAudience(prisma as unknown as PrismaClient, [])).resolves.toEqual([]);
    expect(prisma.teamPlayer.findMany).not.toHaveBeenCalled();
  });
});

describe('groupByRecipient', () => {
  it('merges a playing parent and their child into one reader', () => {
    const result = groupByRecipient([
      entry({
        teamPlayerId: 'tp-p',
        playerId: 'player-p',
        firstName: 'Sophie',
        userId: 'parent-1',
      }),
      entry({ guardianUserIds: ['parent-1'] }),
    ]);

    expect(result).toEqual([
      {
        userId: 'parent-1',
        self: true,
        children: [{ playerId: 'player-1', firstName: 'Léo', clubId: 'club-1' }],
      },
    ]);
  });

  it('gives each guardian and the child’s own account a row, children by first name', () => {
    const result = groupByRecipient([
      entry({ playerId: 'p-leo', firstName: 'Léo', userId: 'leo', guardianUserIds: ['mum'] }),
      entry({ playerId: 'p-emma', firstName: 'Emma', guardianUserIds: ['mum', 'dad'] }),
    ]);

    expect(result).toEqual([
      { userId: 'leo', self: true, children: [] },
      {
        userId: 'mum',
        self: false,
        children: [
          { playerId: 'p-emma', firstName: 'Emma', clubId: 'club-1' },
          { playerId: 'p-leo', firstName: 'Léo', clubId: 'club-1' },
        ],
      },
      {
        userId: 'dad',
        self: false,
        children: [{ playerId: 'p-emma', firstName: 'Emma', clubId: 'club-1' }],
      },
    ]);
  });

  it('notifies nobody for a player with no account and no parent', () => {
    expect(groupByRecipient([entry({})])).toEqual([]);
  });

  it('counts a child once however many slots they hold', () => {
    const [mum] = groupByRecipient([
      entry({ teamPlayerId: 'tp-a', guardianUserIds: ['mum'] }),
      entry({ teamPlayerId: 'tp-b', guardianUserIds: ['mum'] }),
    ]);
    expect(mum.children).toHaveLength(1);
  });
});

describe('recipientDeepLink', () => {
  const child = { playerId: 'p-leo', firstName: 'Léo', clubId: 'club-2' };
  const childPath = (clubId: string) => `/clubs/${clubId}/x`;

  it('keeps the reader’s own link when they are concerned themself', () => {
    expect(
      recipientDeepLink(
        { userId: 'u', self: true, children: [child] },
        '/clubs/club-1/x',
        childPath,
      ),
    ).toBe('/clubs/club-1/x');
  });

  it('goes through the child’s club and switches to them for a parent', () => {
    expect(
      recipientDeepLink(
        { userId: 'u', self: false, children: [child] },
        '/clubs/club-1/x',
        childPath,
      ),
    ).toBe('/clubs/club-2/x?pour=p-leo');
  });
});
