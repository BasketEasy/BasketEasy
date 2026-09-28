import { BadRequestException, Injectable } from '@nestjs/common';
import type { PlatformRole } from '@prisma/client';
import {
  ADMIN_SEARCH_GROUP_LIMIT,
  ADMIN_SEARCH_MAX_LENGTH,
  ADMIN_SEARCH_MIN_LENGTH,
  type AdminSearchHit,
  type AdminSearchResult,
} from '@basketeasy/types/platform-admin-search';
import type { AdminPersonRef } from '@basketeasy/types/platform-admin-browse';
import { PrismaService } from '../prisma/prisma.service';
import { playerSearchWhere, userSearchWhere } from './platform-admin-browse.service';
import { playerRef, userRef } from './redaction';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EVENT_DATE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeZone: 'Europe/Paris',
});

/**
 * The back-office's one search box.
 *
 * An id is looked up in every table at once, because an id pasted from a log
 * line or a support e-mail rarely says what it identifies. Anything else is
 * matched by name, five hits per kind, with people matched under the same
 * per-role rule as the lists (substring for a DATA_OFFICER, exact e-mail for
 * SUPPORT) and labelled through the same redaction. Events are found by id
 * only: a free-text match on « match » or an opponent's name would flood the
 * results without identifying anything.
 *
 * Not audited, like the lists: a hit is a reference, not the record. Opening
 * it is the audited moment.
 */
@Injectable()
export class PlatformAdminSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(role: PlatformRole, rawQuery: string): Promise<AdminSearchResult> {
    const query = rawQuery.trim();
    if (query.length < ADMIN_SEARCH_MIN_LENGTH || query.length > ADMIN_SEARCH_MAX_LENGTH) {
      throw new BadRequestException(
        `La recherche doit compter entre ${ADMIN_SEARCH_MIN_LENGTH} et ${ADMIN_SEARCH_MAX_LENGTH} caractères`,
      );
    }

    const empty = { club: [], team: [], user: [], player: [] };
    if (UUID.test(query)) {
      const exactId = await this.findById(role, query.toLowerCase());
      return { query, exactId, unknownId: exactId === null, groups: empty };
    }
    return { query, exactId: null, unknownId: false, groups: await this.findByText(role, query) };
  }

  private async findById(role: PlatformRole, id: string): Promise<AdminSearchHit | null> {
    const [club, team, user, player, event] = await Promise.all([
      this.prisma.club.findUnique({ where: { id }, select: clubSelect }),
      this.prisma.team.findUnique({ where: { id }, select: teamSelect }),
      this.prisma.user.findUnique({ where: { id }, select: userSelect }),
      this.prisma.player.findUnique({ where: { id }, select: playerSelect }),
      this.prisma.event.findUnique({
        where: { id },
        select: {
          id: true,
          type: true,
          opponentName: true,
          startsAt: true,
          team: { select: { name: true } },
        },
      }),
    ]);

    if (club) return clubHit(club);
    if (team) return teamHit(team);
    if (user) return personHit('user', userRef(role, user));
    if (player) return personHit('player', playerRef(role, player), player.club.name);
    if (event) {
      return {
        kind: 'event',
        id: event.id,
        label:
          event.type === 'TRAINING'
            ? 'Entraînement'
            : event.opponentName
              ? `Match · ${event.opponentName}`
              : 'Match',
        sublabel: `${event.team.name} · ${EVENT_DATE.format(event.startsAt)}`,
      };
    }
    return null;
  }

  private async findByText(
    role: PlatformRole,
    query: string,
  ): Promise<AdminSearchResult['groups']> {
    const take = ADMIN_SEARCH_GROUP_LIMIT;
    const [clubs, teams, users, players] = await Promise.all([
      this.prisma.club.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { ffbbClubCode: query.toUpperCase() },
          ],
        },
        orderBy: { name: 'asc' },
        take,
        select: clubSelect,
      }),
      this.prisma.team.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take,
        select: teamSelect,
      }),
      this.prisma.user.findMany({
        where: userSearchWhere(role, query),
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        take,
        select: userSelect,
      }),
      this.prisma.player.findMany({
        where: playerSearchWhere(role, query),
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        take,
        select: playerSelect,
      }),
    ]);

    return {
      club: clubs.map(clubHit),
      team: teams.map(teamHit),
      user: users.map((user) => personHit('user', userRef(role, user))),
      player: players.map((player) =>
        personHit('player', playerRef(role, player), player.club.name),
      ),
    };
  }
}

const clubSelect = { id: true, name: true, ffbbClubCode: true } as const;

const teamSelect = {
  id: true,
  name: true,
  clubTeams: { where: { isOwner: true }, select: { club: { select: { name: true } } } },
} as const;

const userSelect = { id: true, email: true, firstName: true, lastName: true } as const;

const playerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  user: { select: { email: true } },
  club: { select: { name: true } },
} as const;

function clubHit(club: { id: string; name: string; ffbbClubCode: string | null }): AdminSearchHit {
  return {
    kind: 'club',
    id: club.id,
    label: club.name,
    sublabel: club.ffbbClubCode ? `FFBB ${club.ffbbClubCode}` : null,
  };
}

function teamHit(team: {
  id: string;
  name: string;
  clubTeams: { club: { name: string } }[];
}): AdminSearchHit {
  return {
    kind: 'team',
    id: team.id,
    label: team.name,
    sublabel: team.clubTeams[0]?.club.name ?? null,
  };
}

function personHit(
  kind: 'user' | 'player',
  person: AdminPersonRef,
  context?: string,
): AdminSearchHit {
  const contact = person.email ?? (person.emailDomain ? `…@${person.emailDomain}` : null);
  return {
    kind,
    id: person.id,
    label: person.displayName,
    sublabel: context ?? contact,
  };
}
