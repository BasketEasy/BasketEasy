import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Gender } from '@prisma/client';
import type {
  ChildPersona,
  MyChildProfile,
  MyPersonas,
  MyPlayerGuardians,
  PersonaTeam,
} from '@basketeasy/types/guardians';
import { isMinorBirthDate } from '@basketeasy/types/parental-consent';
import { PrismaService } from '../prisma/prisma.service';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
// How far ahead « à répondre » looks: two weeks covers the next match and the
// trainings around it without counting a whole imported season as pending.
const PENDING_WINDOW_DAYS = 14;

type TeamPlayerWithTeam = { id: string; teamId: string; team: { name: string } };

const teamPlayerWithTeam = {
  id: true,
  teamId: true,
  team: { select: { name: true } },
} as const;

/**
 * The « me » side of guardian links: who the caller can act for (personas),
 * a parent's view of one child, and a player's view of who follows them. Not
 * club-scoped, same reasoning as MyTeamsController — there is no :clubId to
 * key these off.
 */
@Injectable()
export class MyGuardiansService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every persona the caller can act as, with its unanswered count. Bounded
   * regardless of how many children or teams: four parallel reads to find the
   * personas, then one events read over the union of their teams and one RSVP
   * read over the union of their roster slots.
   */
  async getPersonas(userId: string): Promise<MyPersonas> {
    const [membershipCount, teamAdminCount, ownPlayers, links] = await Promise.all([
      this.prisma.clubMembership.count({ where: { userId } }),
      this.prisma.teamAdmin.count({ where: { userId } }),
      this.prisma.player.findMany({
        where: { userId },
        select: { id: true, teamPlayers: { select: teamPlayerWithTeam } },
      }),
      this.prisma.playerGuardian.findMany({
        where: { userId },
        select: {
          player: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              clubId: true,
              club: { select: { name: true } },
              teamPlayers: { select: teamPlayerWithTeam },
            },
          },
        },
      }),
    ]);

    const ownSlots = ownPlayers.flatMap((p) => p.teamPlayers);
    const childSlots = links.flatMap((l) => l.player.teamPlayers);
    const pendingBySlot = await this.countPending([...ownSlots, ...childSlots]);
    const pendingFor = (slots: TeamPlayerWithTeam[]) =>
      slots.reduce((sum, slot) => sum + (pendingBySlot.get(slot.id) ?? 0), 0);

    const hasOwnRole = membershipCount > 0 || teamAdminCount > 0 || ownSlots.length > 0;
    const children: ChildPersona[] = links
      .map(({ player }) => ({
        playerId: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        clubId: player.clubId,
        clubName: player.club.name,
        teams: toPersonaTeams(player.teamPlayers),
        pendingCount: pendingFor(player.teamPlayers),
      }))
      .sort((a, b) => a.firstName.localeCompare(b.firstName, 'fr'));

    return {
      self: hasOwnRole
        ? { pendingCount: pendingFor(ownSlots), playerIds: ownPlayers.map((p) => p.id) }
        : null,
      children,
    };
  }

  // Events in the window on each slot's team, minus the ones that slot has
  // already answered — one events read and one RSVP read for every slot.
  private async countPending(slots: TeamPlayerWithTeam[]): Promise<Map<string, number>> {
    if (slots.length === 0) {
      return new Map();
    }
    const now = new Date();
    const until = new Date(now.getTime() + PENDING_WINDOW_DAYS * DAY_IN_MS);
    const teamIds = [...new Set(slots.map((s) => s.teamId))];
    const events = await this.prisma.event.findMany({
      where: { teamId: { in: teamIds }, startsAt: { gte: now, lte: until } },
      select: { id: true, teamId: true },
    });
    if (events.length === 0) {
      return new Map();
    }
    const answers = await this.prisma.eventRsvp.findMany({
      where: {
        teamPlayerId: { in: slots.map((s) => s.id) },
        eventId: { in: events.map((e) => e.id) },
      },
      select: { teamPlayerId: true, eventId: true },
    });
    const answered = new Set(answers.map((a) => `${a.teamPlayerId}:${a.eventId}`));

    const pending = new Map<string, number>();
    for (const slot of slots) {
      const count = events.filter(
        (e) => e.teamId === slot.teamId && !answered.has(`${slot.id}:${e.id}`),
      ).length;
      pending.set(slot.id, count);
    }
    return pending;
  }

  async getChild(userId: string, playerId: string): Promise<MyChildProfile> {
    await this.assertGuardian(userId, playerId);
    const [player, coGuardians, consent] = await Promise.all([
      this.prisma.player.findUniqueOrThrow({
        where: { id: playerId },
        include: { club: { select: { name: true } }, teamPlayers: { select: teamPlayerWithTeam } },
      }),
      this.prisma.playerGuardian.findMany({
        where: { playerId, userId: { not: userId } },
        select: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.parentalConsent.findFirst({
        where: { playerId },
        orderBy: { consentGivenAt: 'desc' },
        select: { consentGivenAt: true, attestedByName: true, source: true },
      }),
    ]);

    return {
      playerId: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      birthDate: player.birthDate?.toISOString() ?? null,
      gender: player.gender,
      isMinor: isMinorBirthDate(player.birthDate?.toISOString()),
      clubId: player.clubId,
      clubName: player.club.name,
      teams: toPersonaTeams(player.teamPlayers),
      // Names only — a guardian never sees another parent's address.
      coGuardians: coGuardians.map((g) => ({
        firstName: g.user.firstName,
        lastName: g.user.lastName,
      })),
      consent: consent
        ? {
            consentGivenAt: consent.consentGivenAt.toISOString(),
            attestedByName: consent.attestedByName,
            source: consent.source,
          }
        : null,
    };
  }

  // Only the four fields a family is the source of truth for. Licence fields,
  // the national id and teams come from the federation and stay admin-only —
  // the DTO doesn't accept them at all.
  async updateChild(
    userId: string,
    playerId: string,
    data: {
      firstName?: string;
      lastName?: string;
      birthDate?: string | null;
      gender?: Gender | null;
    },
  ): Promise<MyChildProfile> {
    await this.assertGuardian(userId, playerId);
    await this.prisma.player.update({
      where: { id: playerId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        gender: data.gender,
        birthDate:
          data.birthDate === undefined
            ? undefined
            : data.birthDate
              ? new Date(data.birthDate)
              : null,
      },
    });
    return this.getChild(userId, playerId);
  }

  async stopFollowing(userId: string, playerId: string): Promise<void> {
    const { count } = await this.prisma.playerGuardian.deleteMany({ where: { playerId, userId } });
    if (count === 0) {
      throw new NotFoundException('Joueur introuvable');
    }
  }

  async listMyGuardians(userId: string, playerId: string): Promise<MyPlayerGuardians> {
    const player = await this.findOwnPlayer(userId, playerId);
    const links = await this.prisma.playerGuardian.findMany({
      where: { playerId },
      select: {
        userId: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      playerId,
      isMinor: isMinorBirthDate(player.birthDate?.toISOString()),
      guardians: links.map((link) => ({
        userId: link.userId,
        firstName: link.user.firstName,
        lastName: link.user.lastName,
        linkedAt: link.createdAt.toISOString(),
      })),
    };
  }

  // An adult player decides who follows them; a minor can see the list but
  // not change it (design decision 13). Nothing is cut automatically at 18.
  async removeMyGuardian(userId: string, playerId: string, guardianUserId: string): Promise<void> {
    const player = await this.findOwnPlayer(userId, playerId);
    if (isMinorBirthDate(player.birthDate?.toISOString())) {
      throw new ForbiddenException('Un joueur mineur ne peut pas retirer ses parents');
    }
    const { count } = await this.prisma.playerGuardian.deleteMany({
      where: { playerId, userId: guardianUserId },
    });
    if (count === 0) {
      throw new NotFoundException('Ce parent n’est pas lié à votre profil');
    }
  }

  private async assertGuardian(userId: string, playerId: string): Promise<void> {
    const link = await this.prisma.playerGuardian.findUnique({
      where: { playerId_userId: { playerId, userId } },
      select: { playerId: true },
    });
    if (!link) {
      throw new NotFoundException('Joueur introuvable');
    }
  }

  private async findOwnPlayer(
    userId: string,
    playerId: string,
  ): Promise<{ birthDate: Date | null }> {
    const player = await this.prisma.player.findFirst({
      where: { id: playerId, userId },
      select: { birthDate: true },
    });
    if (!player) {
      throw new NotFoundException('Joueur introuvable');
    }
    return player;
  }
}

function toPersonaTeams(slots: TeamPlayerWithTeam[]): PersonaTeam[] {
  return slots
    .map((slot) => ({ teamId: slot.teamId, teamName: slot.team.name }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName, 'fr'));
}
