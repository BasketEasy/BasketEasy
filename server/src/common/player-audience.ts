import type { Prisma, PrismaClient } from '@prisma/client';

type PrismaReader = PrismaClient | Prisma.TransactionClient;

/** Everyone a notification about one roster slot reaches. */
export interface PlayerAudienceEntry {
  teamPlayerId: string;
  playerId: string;
  firstName: string;
  /** The player's own club — the one a guardian's deep link must go through. */
  clubId: string;
  /** The player's own account; null for a player who never claimed one. */
  userId: string | null;
  guardianUserIds: string[];
}

/**
 * The player behind each roster slot, their own account and their guardians,
 * in one query however many slots are passed. Every emission point that used
 * to map `TeamPlayer → Player.userId` goes through here, so a child with no
 * account of their own still reaches their parents (design decision 10).
 */
export async function resolvePlayerAudience(
  prisma: PrismaReader,
  teamPlayerIds: string[],
): Promise<PlayerAudienceEntry[]> {
  if (teamPlayerIds.length === 0) {
    return [];
  }
  const rows = await prisma.teamPlayer.findMany({
    where: { id: { in: teamPlayerIds } },
    select: {
      id: true,
      player: {
        select: {
          id: true,
          firstName: true,
          clubId: true,
          userId: true,
          guardians: { select: { userId: true } },
        },
      },
    },
  });
  return rows.map((row) => ({
    teamPlayerId: row.id,
    playerId: row.player.id,
    firstName: row.player.firstName,
    clubId: row.player.clubId,
    userId: row.player.userId,
    guardianUserIds: row.player.guardians.map((g) => g.userId),
  }));
}

interface RecipientChild {
  playerId: string;
  firstName: string;
  clubId: string;
}

/** One reader and every subject of one notification they are concerned by. */
export interface RecipientSubjects {
  userId: string;
  /** The reader is themself one of the players concerned. */
  self: boolean;
  /** The reader's children concerned, ordered by first name. */
  children: RecipientChild[];
}

/**
 * Merges an audience into one row per reader: a playing parent convoked with
 * their child, or a parent of two convoked children, is told once, in one
 * sentence naming everyone concerned — never once per subject.
 */
export function groupByRecipient(entries: PlayerAudienceEntry[]): RecipientSubjects[] {
  const byUser = new Map<string, RecipientSubjects>();
  const get = (userId: string) => {
    let recipient = byUser.get(userId);
    if (!recipient) {
      recipient = { userId, self: false, children: [] };
      byUser.set(userId, recipient);
    }
    return recipient;
  };

  for (const entry of entries) {
    if (entry.userId) {
      get(entry.userId).self = true;
    }
    for (const guardianUserId of entry.guardianUserIds) {
      // A player who is also listed as their own guardian can't happen (the
      // invite refuses it), but guard anyway: « self » already covers them.
      if (guardianUserId === entry.userId) continue;
      const recipient = get(guardianUserId);
      if (!recipient.children.some((c) => c.playerId === entry.playerId)) {
        recipient.children.push({
          playerId: entry.playerId,
          firstName: entry.firstName,
          clubId: entry.clubId,
        });
      }
    }
  }

  for (const recipient of byUser.values()) {
    recipient.children.sort((a, b) => a.firstName.localeCompare(b.firstName, 'fr'));
  }
  return [...byUser.values()];
}

/**
 * The deep link for one reader: unchanged for a reader concerned themself;
 * for a parent, rebased onto the child's own club (the one @AllowGuardians()
 * accepts, even on a CTC team) and tagged `?pour=<playerId>` so opening it
 * switches the app to that child.
 */
export function recipientDeepLink(
  recipient: RecipientSubjects,
  selfPath: string,
  childPath: (clubId: string) => string,
): string {
  if (recipient.self || recipient.children.length === 0) {
    return selfPath;
  }
  const child = recipient.children[0];
  return `${childPath(child.clubId)}?pour=${child.playerId}`;
}
