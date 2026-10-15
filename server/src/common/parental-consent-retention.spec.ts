import type { Prisma } from '@prisma/client';
import {
  parentalConsentRetentionExpiry,
  startParentalConsentRetention,
} from './parental-consent-retention';

describe('parentalConsentRetentionExpiry', () => {
  it('is five years after the deletion, not after the consent', () => {
    expect(parentalConsentRetentionExpiry(new Date('2026-09-06T00:00:00.000Z'))).toEqual(
      new Date('2031-09-06T00:00:00.000Z'),
    );
  });
});

describe('startParentalConsentRetention', () => {
  const now = new Date('2026-09-06T00:00:00.000Z');
  let tx: { parentalConsent: { updateMany: jest.Mock } };

  beforeEach(() => {
    tx = { parentalConsent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
  });

  function run(playerIds: string[]) {
    return startParentalConsentRetention(tx as unknown as Prisma.TransactionClient, playerIds, now);
  }

  it('starts the clock on the players’ consent records', async () => {
    await expect(run(['player-1'])).resolves.toBe(1);

    expect(tx.parentalConsent.updateMany).toHaveBeenCalledWith({
      where: { playerId: { in: ['player-1'] }, retentionExpiresAt: null },
      data: { retentionExpiresAt: new Date('2031-09-06T00:00:00.000Z') },
    });
  });

  it('never extends a clock that is already ticking', async () => {
    await run(['player-1']);

    expect(tx.parentalConsent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ retentionExpiresAt: null }) }),
    );
  });

  it('does not query at all for an empty player list', async () => {
    await expect(run([])).resolves.toBe(0);

    expect(tx.parentalConsent.updateMany).not.toHaveBeenCalled();
  });
});
