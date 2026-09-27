import { ForbiddenException } from '@nestjs/common';
import type { Prisma, PrismaClient, TeamPlayer } from '@prisma/client';

type PrismaReader = PrismaClient | Prisma.TransactionClient;

const ACTING_AS_FORBIDDEN_MESSAGE = 'Vous ne pouvez pas répondre pour ce joueur';

/**
 * The one place that decides « may this user act for this player on this
 * team ». Every read and write that has a « me » (RSVP, travel mode, the
 * caller's own event state) resolves its roster slot through here, so a
 * body- or query-supplied player id is never trusted on its own.
 *
 * - No `forPlayerId`: the caller's own `TeamPlayer` on the team, or null when
 *   they aren't rostered — today's behaviour.
 * - `forPlayerId`: that player's `TeamPlayer` on the team, only when the
 *   player is the caller themself or someone they are a guardian of. A player
 *   the caller may act for but who isn't on this team resolves to null (the
 *   caller then behaves as « not rostered », same as without the parameter);
 *   a player they may not act for is a 403, so a stranger's id can't be
 *   probed for roster membership.
 *
 * A plain function over Prisma rather than an injectable, same convention as
 * `startParentalConsentRetention`: modules query Prisma directly instead of
 * injecting each other's services.
 */
export async function resolveActingTeamPlayer(
  prisma: PrismaReader,
  { userId, teamId, forPlayerId }: { userId: string; teamId: string; forPlayerId?: string },
): Promise<TeamPlayer | null> {
  if (!forPlayerId) {
    return prisma.teamPlayer.findFirst({ where: { teamId, player: { userId } } });
  }

  const teamPlayer = await prisma.teamPlayer.findFirst({
    where: {
      teamId,
      playerId: forPlayerId,
      player: { OR: [{ userId }, { guardians: { some: { userId } } }] },
    },
  });
  if (teamPlayer) {
    return teamPlayer;
  }

  // Nothing found: either the player isn't on this team, or the caller may
  // not act for them. Only the first is an answer the caller is entitled to.
  if (!(await canActForPlayer(prisma, userId, forPlayerId))) {
    throw new ForbiddenException(ACTING_AS_FORBIDDEN_MESSAGE);
  }
  return null;
}

/** Whether `userId` is the player themself or one of their guardians. */
export async function canActForPlayer(
  prisma: PrismaReader,
  userId: string,
  playerId: string,
): Promise<boolean> {
  const player = await prisma.player.findFirst({
    where: { id: playerId, OR: [{ userId }, { guardians: { some: { userId } } }] },
    select: { id: true },
  });
  return player !== null;
}
