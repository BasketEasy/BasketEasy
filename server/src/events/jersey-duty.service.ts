import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventType, JerseyDutySource, Prisma, type PrismaClient } from '@prisma/client';
import type { EventLogisticsAssignee } from '@basketeasy/types/events';
import {
  JERSEY_DUTY_ERROR_CODES,
  type EventJerseyDutySummary,
  type JerseyDutyCandidate,
  type JerseyDutyDetail,
  type JerseyDutyPerson,
  type JerseyRotationOverview,
  type JerseyRotationRow,
} from '@basketeasy/types/jersey-duty';
import type { Gender } from '@basketeasy/types/teams';
import { PrismaService } from '../prisma/prisma.service';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { resolveActingTeamPlayer } from '../common/acting-as';
import { RSVP_RESPONDENT_SELECT, toRsvpRespondent } from '../common/rsvp-respondent';
import { seasonWindow, seasonYearFor } from '../common/season';
import {
  isConvokedGoing,
  isCountedTurn,
  isFewestTurns,
  isInPool,
  jerseyDutyStatus,
  orderCandidates,
  planSuggestion,
  type RotationMember,
} from './jersey-duty-rules';

type Db = PrismaClient | Prisma.TransactionClient;

// A new holder starts a clean turn: nothing of the previous holder's « Fait »
// or void carries over to them.
const RESET_TURN_FLAGS = {
  doneAt: null,
  doneByUserId: null,
  voidedAt: null,
  voidedByUserId: null,
} as const;

// What the rotation needs of a match: nothing else is read off the event.
type MatchRow = { id: string; teamId: string; type: EventType; startsAt: Date };

// A roster slot as the rotation reads it for one match: the rules' view plus
// what a screen needs to draw the person.
interface RosterEntry extends RotationMember {
  playerId: string;
  gender: Gender | null;
  /** An account or a guardian exists to tell. */
  reachable: boolean;
}

type DutyRow = Prisma.EventJerseyDutyGetPayload<{
  include: { acceptedBy: typeof RSVP_RESPONDENT_SELECT };
}>;

interface TeamFacts {
  gender: Gender;
  jerseyRotationEnabled: boolean;
}

// A roster query that must report no convocation, RSVP or decline (the
// overview with no upcoming match) filters on an event id that cannot exist.
const NO_EVENT = '00000000-0000-0000-0000-000000000000';

// A match started this long ago and still without a duty row is no longer
// frozen: a manager can still assign it, nothing automatic reaches that far.
const FREEZE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const FREEZE_BATCH_SIZE = 200;

interface DetailState {
  detail: JerseyDutyDetail;
  duty: DutyRow | null;
  holderId: string | null;
  /** Suggestion order, the persona included. */
  pool: RosterEntry[];
}

interface PersonaArgs {
  userId: string;
  forPlayerId?: string;
}

const ref = (entry: Pick<RosterEntry, 'teamPlayerId' | 'firstName' | 'lastName'>) => ({
  teamPlayerId: entry.teamPlayerId,
  firstName: entry.firstName,
  lastName: entry.lastName,
});

function refused(
  Exception: typeof ConflictException | typeof BadRequestException,
  message: string,
  code: string,
) {
  return new Exception({ message, code });
}

/**
 * The jersey wash rotation: who takes the team's jersey set home after a
 * MATCH and brings it back to the next one. Reads and writes the
 * `EventJerseyDuty` row of a match; queries Prisma directly like the rest of
 * the Events module (cross-module convention). Decisions and the rules:
 * docs/decisions/events.md; the pure definitions live in jersey-duty-rules.ts.
 */
@Injectable()
export class JerseyDutyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamManagerGuard: TeamManagerGuard,
  ) {}

  // ---------------------------------------------------------------- reads

  async getDetail(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    forPlayerId?: string,
  ): Promise<JerseyDutyDetail> {
    const { event, team } = await this.loadMatch(clubId, teamId, eventId);
    const [persona, isManager] = await Promise.all([
      resolveActingTeamPlayer(this.prisma, { userId, teamId, forPlayerId }),
      forPlayerId ? false : this.teamManagerGuard.isTeamManager(clubId, teamId, userId),
    ]);
    const state = await this.buildState(this.prisma, {
      event,
      team,
      personaId: persona?.id ?? null,
      userId,
      isManager,
      now: new Date(),
    });
    return state.detail;
  }

  async getOverview(
    clubId: string,
    teamId: string,
    userId: string,
    seasonParam?: number,
    forPlayerId?: string,
  ): Promise<JerseyRotationOverview> {
    await this.assertTeamInClub(clubId, teamId);
    const now = new Date();
    const seasonYear = seasonParam ?? seasonYearFor(now);
    const [team, persona, isManager] = await Promise.all([
      this.prisma.team.findUniqueOrThrow({
        where: { id: teamId },
        select: { gender: true, jerseyRotationEnabled: true },
      }),
      resolveActingTeamPlayer(this.prisma, { userId, teamId, forPlayerId }),
      forPlayerId ? false : this.teamManagerGuard.isTeamManager(clubId, teamId, userId),
    ]);
    const base = {
      seasonYear,
      teamGender: team.gender,
      enabled: team.jerseyRotationEnabled,
      canManage: isManager,
    };
    // The one duty route that answers on a team with the rotation off, so a
    // manager can still see and flip the switch.
    if (!team.jerseyRotationEnabled) {
      return { ...base, nextMatch: null, rows: [] };
    }

    const nextMatch = await this.findNextMatch(this.prisma, teamId, now);
    const [turns, nextDuty] = await Promise.all([
      this.loadSeasonTurns(this.prisma, teamId, seasonYear, now),
      nextMatch
        ? this.prisma.eventJerseyDuty.findUnique({ where: { eventId: nextMatch.id } })
        : null,
    ]);
    const roster = await this.loadRoster(this.prisma, teamId, nextMatch?.id ?? NO_EVENT, turns);

    const rows: JerseyRotationRow[] = [
      ...orderCandidates(roster.filter((entry) => !entry.exempt)),
      ...orderCandidates(roster.filter((entry) => entry.exempt)),
    ].map((entry) => ({
      ...this.candidate(entry),
      playerId: entry.playerId,
      exempt: entry.exempt,
      isMe: entry.teamPlayerId === persona?.id,
    }));

    // The next match belongs to the season it falls in: showing its suggestion
    // against another season's turn counts would be wrong, so a past-season
    // view shows no « next match ».
    let next: JerseyRotationOverview['nextMatch'] = null;
    if (nextMatch && seasonYearFor(nextMatch.startsAt) === seasonYear) {
      const holder = roster.find((entry) => entry.teamPlayerId === nextDuty?.teamPlayerId);
      const suggested = holder ? undefined : orderCandidates(roster.filter(isInPool))[0];
      next = {
        eventId: nextMatch.id,
        startsAt: nextMatch.startsAt.toISOString(),
        holder: holder ? ref(holder) : null,
        suggestion: suggested ? ref(suggested) : null,
      };
    }
    return { ...base, nextMatch: next, rows };
  }

  /**
   * `TeamEvent.jerseyDuty` for a batch of one team's events: null for a
   * TRAINING and on a team with the rotation off. Bounded — one team read,
   * one read of the batch's duty rows, one `LAG` query for « apportés par »
   * and one name lookup — whatever the batch size. Never computes a
   * suggestion (that is `getDetail`'s job, for the next match only).
   */
  async resolveSummaries(
    teamId: string,
    events: Pick<MatchRow, 'id' | 'type'>[],
    personaTeamPlayerId: string | null,
  ): Promise<Map<string, EventJerseyDutySummary>> {
    const matchIds = events.filter((e) => e.type === EventType.MATCH).map((e) => e.id);
    if (matchIds.length === 0) return new Map();
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { jerseyRotationEnabled: true },
    });
    if (!team?.jerseyRotationEnabled) return new Map();

    const [duties, brought] = await Promise.all([
      this.prisma.eventJerseyDuty.findMany({ where: { eventId: { in: matchIds } } }),
      // « Apportés par »: the holder of the team's previous MATCH, unless that
      // turn was voided. The window runs over every match of the team so the
      // first match of the batch still sees its predecessor.
      this.prisma.$queryRaw<{ eventId: string; teamPlayerId: string }[]>(Prisma.sql`
        SELECT cur."id" AS "eventId", d."teamPlayerId" AS "teamPlayerId"
        FROM (
          SELECT "id", LAG("id") OVER (PARTITION BY "teamId" ORDER BY "startsAt", "id") AS "prevId"
          FROM "Event"
          WHERE "teamId" = ${teamId} AND "type" = 'MATCH'
        ) AS cur
        JOIN "EventJerseyDuty" d ON d."eventId" = cur."prevId"
        WHERE cur."id" IN (${Prisma.join(matchIds)})
          AND d."teamPlayerId" IS NOT NULL
          AND d."voidedAt" IS NULL
      `),
    ]);
    const dutyByEvent = new Map(duties.map((d) => [d.eventId, d]));
    const broughtByEvent = new Map(brought.map((row) => [row.eventId, row.teamPlayerId]));

    const nameIds = new Set<string>(brought.map((row) => row.teamPlayerId));
    for (const duty of duties) {
      if (duty.teamPlayerId) nameIds.add(duty.teamPlayerId);
    }
    const people = nameIds.size
      ? await this.prisma.teamPlayer.findMany({
          where: { id: { in: Array.from(nameIds) } },
          select: { id: true, player: { select: { firstName: true, lastName: true } } },
        })
      : [];
    const assignees = new Map<string, EventLogisticsAssignee>(
      people.map((tp) => [
        tp.id,
        { teamPlayerId: tp.id, firstName: tp.player.firstName, lastName: tp.player.lastName },
      ]),
    );

    return new Map(
      matchIds.map((id) => {
        const duty = dutyByEvent.get(id) ?? null;
        const holderId = duty?.teamPlayerId ?? null;
        const broughtId = broughtByEvent.get(id);
        return [
          id,
          {
            holder: holderId ? (assignees.get(holderId) ?? null) : null,
            status: jerseyDutyStatus(duty),
            broughtBy: broughtId ? (assignees.get(broughtId) ?? null) : null,
            isMine: holderId !== null && holderId === personaTeamPlayerId,
          },
        ];
      }),
    );
  }

  // --------------------------------------------------------- player writes

  /** Takes the duty (or confirms it): the suggested player, the holder, or a pool member volunteering. */
  async accept(
    clubId: string,
    teamId: string,
    eventId: string,
    { userId, forPlayerId }: PersonaArgs,
  ): Promise<JerseyDutyDetail> {
    return this.playerWrite(clubId, teamId, eventId, { userId, forPlayerId }, async (tx, s, me) => {
      if (s.holderId === me && s.duty?.acceptedAt) return; // another guardian got there first
      if (!s.detail.rights.canAccept) {
        throw new ForbiddenException('Vous ne pouvez pas prendre le lavage des maillots');
      }
      await this.takeDuty(tx, s, me, userId, new Date());
    });
  }

  /** « Je ne peux pas »: drops the duty if held, and the suggestion skips this player for this match. */
  async decline(
    clubId: string,
    teamId: string,
    eventId: string,
    { userId, forPlayerId }: PersonaArgs,
  ): Promise<JerseyDutyDetail> {
    return this.playerWrite(clubId, teamId, eventId, { userId, forPlayerId }, async (tx, s, me) => {
      if (!s.detail.rights.canDecline) {
        throw new ForbiddenException(
          "Le lavage des maillots ne vous est pas attribué pour l'instant",
        );
      }
      // No holder before kickoff means no row: the pending swap goes with it.
      if (s.holderId === me) {
        await tx.eventJerseyDuty.deleteMany({ where: { eventId, teamPlayerId: me } });
      }
      await tx.eventJerseyDecline.upsert({
        where: { eventId_teamPlayerId: { eventId, teamPlayerId: me } },
        create: { eventId, teamPlayerId: me },
        update: {},
      });
    });
  }

  /** Proposing a swap implies taking the duty: the proposer stays responsible until the target accepts. */
  async proposeSwap(
    clubId: string,
    teamId: string,
    eventId: string,
    { userId, forPlayerId }: PersonaArgs,
    targetTeamPlayerId: string,
  ): Promise<JerseyDutyDetail> {
    return this.playerWrite(clubId, teamId, eventId, { userId, forPlayerId }, async (tx, s, me) => {
      const holdsOrIsSuggested =
        s.holderId === me ||
        (s.detail.suggestion?.kind === 'SUGGESTED' &&
          s.detail.suggestion.candidate.teamPlayerId === me);
      if (!holdsOrIsSuggested) {
        throw new ForbiddenException("Vous ne pouvez pas proposer d'échange pour ce match");
      }
      if (s.duty?.swapToTeamPlayerId) {
        throw new ConflictException('Un échange est déjà en attente');
      }
      if (targetTeamPlayerId === me || !s.pool.some((e) => e.teamPlayerId === targetTeamPlayerId)) {
        throw new BadRequestException(
          'Cette personne ne peut pas laver les maillots de ce match (absente, exemptée ou indisponible)',
        );
      }
      const now = new Date();
      await this.takeDuty(tx, s, me, userId, now);
      await tx.eventJerseyDuty.update({
        where: { eventId },
        data: { swapToTeamPlayerId: targetTeamPlayerId, swapRequestedAt: now },
      });
    });
  }

  async cancelSwap(
    clubId: string,
    teamId: string,
    eventId: string,
    { userId, forPlayerId }: PersonaArgs,
  ): Promise<JerseyDutyDetail> {
    return this.playerWrite(clubId, teamId, eventId, { userId, forPlayerId }, async (tx, s, me) => {
      if (s.holderId !== me) {
        throw new ForbiddenException("Seule la personne qui a le lavage peut annuler l'échange");
      }
      if (!s.duty?.swapToTeamPlayerId) {
        throw new NotFoundException('Aucun échange en attente');
      }
      await tx.eventJerseyDuty.update({
        where: { eventId },
        data: { swapToTeamPlayerId: null, swapRequestedAt: null },
      });
    });
  }

  async acceptSwap(
    clubId: string,
    teamId: string,
    eventId: string,
    { userId, forPlayerId }: PersonaArgs,
  ): Promise<JerseyDutyDetail> {
    return this.playerWrite(clubId, teamId, eventId, { userId, forPlayerId }, async (tx, s, me) => {
      if (s.duty?.swapToTeamPlayerId !== me) {
        throw new ForbiddenException('Cet échange ne vous est pas proposé');
      }
      if (!s.pool.some((e) => e.teamPlayerId === me)) {
        throw new ConflictException(
          'Vous ne pouvez plus laver les maillots de ce match (absence, exemption ou refus)',
        );
      }
      // First writer wins: a second guardian answering the same proposal finds
      // nothing to claim and reads the settled state, not an error.
      await tx.eventJerseyDuty.updateMany({
        where: { eventId, swapToTeamPlayerId: me },
        data: {
          teamPlayerId: me,
          source: JerseyDutySource.SWAP,
          acceptedAt: new Date(),
          acceptedByUserId: userId,
          swapToTeamPlayerId: null,
          swapRequestedAt: null,
          ...RESET_TURN_FLAGS,
        },
      });
    });
  }

  async refuseSwap(
    clubId: string,
    teamId: string,
    eventId: string,
    { userId, forPlayerId }: PersonaArgs,
  ): Promise<JerseyDutyDetail> {
    return this.playerWrite(clubId, teamId, eventId, { userId, forPlayerId }, async (tx, s, me) => {
      if (s.duty?.swapToTeamPlayerId !== me) {
        throw new ForbiddenException('Cet échange ne vous est pas proposé');
      }
      await tx.eventJerseyDuty.updateMany({
        where: { eventId, swapToTeamPlayerId: me },
        data: { swapToTeamPlayerId: null, swapRequestedAt: null },
      });
    });
  }

  // -------------------------------------------------------- manager writes

  /** Assigns any roster member (pool and exemption not required) or clears the duty. */
  async assign(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    teamPlayerId: string | null,
  ): Promise<JerseyDutyDetail> {
    const { event } = await this.loadMatch(clubId, teamId, eventId);
    const started = event.startsAt.getTime() <= Date.now();
    if (teamPlayerId) {
      const onRoster = await this.prisma.teamPlayer.findFirst({
        where: { id: teamPlayerId, teamId },
        select: { id: true },
      });
      if (!onRoster) {
        throw new BadRequestException("Ce membre n'est pas inscrit sur l'effectif de cette équipe");
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.eventJerseyDuty.findUnique({ where: { eventId } });
      if (teamPlayerId) {
        if (current?.teamPlayerId === teamPlayerId) return;
        await tx.eventJerseyDuty.upsert({
          where: { eventId },
          create: { eventId, teamPlayerId, source: JerseyDutySource.MANAGER },
          update: {
            teamPlayerId,
            source: JerseyDutySource.MANAGER,
            acceptedAt: null,
            acceptedByUserId: null,
            swapToTeamPlayerId: null,
            swapRequestedAt: null,
            ...RESET_TURN_FLAGS,
          },
        });
      } else if (!started) {
        // Before kickoff « no holder » is « no row ».
        await tx.eventJerseyDuty.deleteMany({ where: { eventId } });
      } else if (current) {
        // After kickoff the row stays with no holder, so the freeze job never
        // re-assigns a match a manager cleared on purpose.
        await tx.eventJerseyDuty.update({
          where: { eventId },
          data: {
            teamPlayerId: null,
            acceptedAt: null,
            acceptedByUserId: null,
            swapToTeamPlayerId: null,
            swapRequestedAt: null,
            ...RESET_TURN_FLAGS,
          },
        });
      }
    });
    return this.getDetail(clubId, teamId, eventId, userId);
  }

  /** « Fait » (the clean set came back): status only, the turn counts from kickoff either way. */
  setDone(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    done: boolean,
  ): Promise<JerseyDutyDetail> {
    return this.markTurn(clubId, teamId, eventId, userId, {
      doneAt: done ? new Date() : null,
      doneByUserId: done ? userId : null,
    });
  }

  /** Voids a turn (the bag stayed in the gym, the match was cancelled on site) so it doesn't count. */
  setVoided(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    voided: boolean,
  ): Promise<JerseyDutyDetail> {
    return this.markTurn(clubId, teamId, eventId, userId, {
      voidedAt: voided ? new Date() : null,
      voidedByUserId: voided ? userId : null,
    });
  }

  // ---------------------------------------------------------------- freeze

  /**
   * Freezes the suggestion of every match that kicked off in the last 7 days
   * with no duty row: whoever the order picks as of now holds the turn. A
   * match with an empty pool stays unassigned, and `skipDuplicates` lets a
   * manager's concurrent write win. Capped per run; the rest waits ten minutes.
   */
  async freezeDue(now: Date): Promise<{ considered: number; frozen: number }> {
    const matches = await this.prisma.event.findMany({
      where: {
        type: EventType.MATCH,
        startsAt: { gt: new Date(now.getTime() - FREEZE_LOOKBACK_MS), lte: now },
        team: { jerseyRotationEnabled: true },
        jerseyDuty: null,
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: FREEZE_BATCH_SIZE,
      select: { id: true, teamId: true, startsAt: true },
    });

    let frozen = 0;
    // In kickoff order, so a team's earlier match is frozen (and counts) before
    // the next one's pool is ordered.
    for (const match of matches) {
      const turns = await this.loadSeasonTurns(
        this.prisma,
        match.teamId,
        seasonYearFor(match.startsAt),
        now,
      );
      const roster = await this.loadRoster(this.prisma, match.teamId, match.id, turns);
      const [first] = orderCandidates(roster.filter(isInPool));
      if (!first) continue;
      const { count } = await this.prisma.eventJerseyDuty.createMany({
        data: [
          {
            eventId: match.id,
            teamPlayerId: first.teamPlayerId,
            source: JerseyDutySource.SUGGESTION,
          },
        ],
        skipDuplicates: true,
      });
      frozen += count;
    }
    return { considered: matches.length, frozen };
  }

  // -------------------------------------------------------------- internals

  private async playerWrite(
    clubId: string,
    teamId: string,
    eventId: string,
    { userId, forPlayerId }: PersonaArgs,
    apply: (tx: Prisma.TransactionClient, state: DetailState, personaId: string) => Promise<void>,
  ): Promise<JerseyDutyDetail> {
    const { event, team } = await this.loadMatch(clubId, teamId, eventId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const persona = await resolveActingTeamPlayer(tx, { userId, teamId, forPlayerId });
      if (!persona) {
        throw new ForbiddenException("Vous ne faites pas partie de l'effectif de cette équipe");
      }
      if (event.startsAt.getTime() <= now.getTime()) {
        throw refused(
          ConflictException,
          'Le match a commencé: seul un responsable peut modifier le lavage des maillots',
          JERSEY_DUTY_ERROR_CODES.LOCKED,
        );
      }
      const state = await this.buildState(tx, {
        event,
        team,
        personaId: persona.id,
        userId,
        isManager: false,
        now,
      });
      await apply(tx, state, persona.id);
    });
    return this.getDetail(clubId, teamId, eventId, userId, forPlayerId);
  }

  private async markTurn(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    data: Prisma.EventJerseyDutyUncheckedUpdateInput,
  ): Promise<JerseyDutyDetail> {
    const { event } = await this.loadMatch(clubId, teamId, eventId);
    if (event.startsAt.getTime() > Date.now()) {
      throw refused(
        ConflictException,
        "Le match n'a pas encore commencé",
        JERSEY_DUTY_ERROR_CODES.NOT_STARTED,
      );
    }
    const duty = await this.prisma.eventJerseyDuty.findUnique({ where: { eventId } });
    if (!duty?.teamPlayerId) {
      throw new ConflictException('Personne ne tient ce tour de lavage');
    }
    await this.prisma.eventJerseyDuty.update({ where: { eventId }, data });
    return this.getDetail(clubId, teamId, eventId, userId);
  }

  // The persona becomes the holder. An already-accepted holder keeps their
  // acceptance (and its author); a different holder starts clean, so a
  // volunteer never inherits the previous holder's swap, « Fait » or void.
  private async takeDuty(
    tx: Prisma.TransactionClient,
    state: DetailState,
    personaId: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    const { duty } = state;
    const sameHolder = duty?.teamPlayerId === personaId;
    const keepAcceptance = sameHolder && duty?.acceptedAt != null;
    await tx.eventJerseyDuty.upsert({
      where: { eventId: state.detail.eventId },
      create: {
        eventId: state.detail.eventId,
        teamPlayerId: personaId,
        source: JerseyDutySource.SELF,
        acceptedAt: now,
        acceptedByUserId: userId,
      },
      update: {
        teamPlayerId: personaId,
        source: JerseyDutySource.SELF,
        ...(keepAcceptance ? {} : { acceptedAt: now, acceptedByUserId: userId }),
        ...(sameHolder
          ? {}
          : { swapToTeamPlayerId: null, swapRequestedAt: null, ...RESET_TURN_FLAGS }),
      },
    });
  }

  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Team not found');
    }
  }

  // Team in club, event in team, a MATCH, and the rotation on: the
  // preconditions of every duty route.
  private async loadMatch(
    clubId: string,
    teamId: string,
    eventId: string,
  ): Promise<{ event: MatchRow; team: TeamFacts }> {
    await this.assertTeamInClub(clubId, teamId);
    const [event, team] = await Promise.all([
      this.prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, teamId: true, type: true, startsAt: true },
      }),
      this.prisma.team.findUniqueOrThrow({
        where: { id: teamId },
        select: { gender: true, jerseyRotationEnabled: true },
      }),
    ]);
    if (!event || event.teamId !== teamId) {
      throw new NotFoundException('Event not found');
    }
    if (event.type !== EventType.MATCH) {
      throw new BadRequestException('Le lavage des maillots ne concerne que les matchs');
    }
    if (!team.jerseyRotationEnabled) {
      throw refused(
        ConflictException,
        'Le roulement de lavage des maillots est désactivé pour cette équipe',
        JERSEY_DUTY_ERROR_CODES.ROTATION_DISABLED,
      );
    }
    return { event, team };
  }

  // The team's earliest MATCH that hasn't started: the only one that gets a suggestion.
  private findNextMatch(db: Db, teamId: string, now: Date) {
    return db.event.findFirst({
      where: { teamId, type: EventType.MATCH, startsAt: { gt: now } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      select: { id: true, startsAt: true },
    });
  }

  // Counted turns of one season, per roster slot: the rules' `isCountedTurn`
  // over the season's duty rows (one query, bounded by the season's matches).
  private async loadSeasonTurns(
    db: Db,
    teamId: string,
    seasonYear: number,
    now: Date,
  ): Promise<Map<string, { turns: number; lastTurnAt: Date }>> {
    const season = seasonWindow(seasonYear);
    const rows = await db.eventJerseyDuty.findMany({
      where: {
        teamPlayerId: { not: null },
        voidedAt: null,
        event: {
          teamId,
          type: EventType.MATCH,
          startsAt: { gte: season.start, lte: season.end },
        },
      },
      select: { teamPlayerId: true, voidedAt: true, event: { select: { startsAt: true } } },
    });
    const turns = new Map<string, { turns: number; lastTurnAt: Date }>();
    for (const row of rows) {
      if (!row.teamPlayerId || !isCountedTurn(row, row.event, now, season)) continue;
      const known = turns.get(row.teamPlayerId);
      turns.set(row.teamPlayerId, {
        turns: (known?.turns ?? 0) + 1,
        lastTurnAt:
          known && known.lastTurnAt > row.event.startsAt ? known.lastTurnAt : row.event.startsAt,
      });
    }
    return turns;
  }

  // The whole roster as the rotation sees it for one match, in one query: a
  // player who never washed still appears, at zero.
  private async loadRoster(
    db: Db,
    teamId: string,
    eventId: string,
    turns: Map<string, { turns: number; lastTurnAt: Date }>,
  ): Promise<RosterEntry[]> {
    const roster = await db.teamPlayer.findMany({
      where: { teamId },
      select: {
        id: true,
        playerId: true,
        jerseyDutyExempt: true,
        player: {
          select: {
            firstName: true,
            lastName: true,
            gender: true,
            userId: true,
            guardians: { select: { userId: true }, take: 1 },
          },
        },
        convocations: { where: { eventId }, select: { eventId: true } },
        rsvps: { where: { eventId }, select: { status: true } },
        jerseyDeclines: { where: { eventId }, select: { eventId: true } },
      },
    });
    return roster.map((tp) => ({
      teamPlayerId: tp.id,
      playerId: tp.playerId,
      firstName: tp.player.firstName,
      lastName: tp.player.lastName,
      gender: tp.player.gender,
      reachable: tp.player.userId !== null || tp.player.guardians.length > 0,
      convoked: tp.convocations.length > 0,
      going: tp.rsvps[0]?.status === 'GOING',
      exempt: tp.jerseyDutyExempt,
      declined: tp.jerseyDeclines.length > 0,
      turns: turns.get(tp.id)?.turns ?? 0,
      lastTurnAt: turns.get(tp.id)?.lastTurnAt ?? null,
    }));
  }

  private candidate(entry: RosterEntry): JerseyDutyCandidate {
    return {
      ...ref(entry),
      turnsThisSeason: entry.turns,
      lastTurnAt: entry.lastTurnAt?.toISOString() ?? null,
    };
  }

  // `reachable` is a manager's warning (« Personne ne sera prévenu »). Any other
  // reader gets true: whether a teammate has an account is not theirs to know
  // (the guest link's invite request keeps the same promise).
  private person(entry: RosterEntry, revealReachable: boolean): JerseyDutyPerson {
    return {
      ...this.candidate(entry),
      gender: entry.gender,
      reachable: revealReachable ? entry.reachable : true,
    };
  }

  // The state of one match's duty as one persona reads it. Used by the GET,
  // and inside the write transactions so the rights a write checks are the
  // very ones the screen was drawn from.
  private async buildState(
    db: Db,
    {
      event,
      team,
      personaId,
      userId,
      isManager,
      now,
    }: {
      event: MatchRow;
      team: TeamFacts;
      personaId: string | null;
      userId: string;
      isManager: boolean;
      now: Date;
    },
  ): Promise<DetailState> {
    const [duty, turns, nextMatch, previous, following] = await Promise.all([
      db.eventJerseyDuty.findUnique({
        where: { eventId: event.id },
        include: { acceptedBy: RSVP_RESPONDENT_SELECT },
      }),
      this.loadSeasonTurns(db, event.teamId, seasonYearFor(event.startsAt), now),
      this.findNextMatch(db, event.teamId, now),
      db.event.findFirst({
        where: {
          teamId: event.teamId,
          type: EventType.MATCH,
          OR: [
            { startsAt: { lt: event.startsAt } },
            { startsAt: event.startsAt, id: { lt: event.id } },
          ],
        },
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        select: { jerseyDuty: { select: { teamPlayerId: true, voidedAt: true } } },
      }),
      db.event.findFirst({
        where: { teamId: event.teamId, type: EventType.MATCH, startsAt: { gt: event.startsAt } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: { startsAt: true },
      }),
    ]);
    const roster = await this.loadRoster(db, event.teamId, event.id, turns);
    const byId = new Map(roster.map((entry) => [entry.teamPlayerId, entry]));

    const locked = event.startsAt.getTime() <= now.getTime();
    const holderId = duty?.teamPlayerId ?? null;
    const holder = holderId ? (byId.get(holderId) ?? null) : null;
    const pool = orderCandidates(roster.filter(isInPool));
    const convokedGoing = roster.filter(isConvokedGoing);

    let suggestion: JerseyDutyDetail['suggestion'] = null;
    if (!locked && !holder) {
      const plan = planSuggestion(event, nextMatch);
      if (plan.kind === 'AFTER_PREVIOUS') {
        suggestion = {
          kind: 'AFTER_PREVIOUS',
          previousMatchStartsAt: plan.previousMatchStartsAt.toISOString(),
        };
      } else if (pool.length === 0) {
        suggestion = { kind: 'EMPTY_POOL' };
      } else {
        suggestion = {
          kind: 'SUGGESTED',
          candidate: this.person(pool[0], isManager),
          isFewest: isFewestTurns(pool),
        };
      }
    }

    const me = personaId !== null ? (byId.get(personaId) ?? null) : null;
    const isHolder = me !== null && holderId === me.teamPlayerId;
    const isSuggested =
      suggestion?.kind === 'SUGGESTED' && suggestion.candidate.teamPlayerId === personaId;
    const holderAccepted = holder !== null && duty?.acceptedAt != null;
    const pendingTargetId = holder ? (duty?.swapToTeamPlayerId ?? null) : null;
    const pendingTarget = pendingTargetId ? (byId.get(pendingTargetId) ?? null) : null;

    const canAccept =
      !locked &&
      me !== null &&
      (isHolder
        ? !holderAccepted
        : !holderAccepted && (isSuggested || pool.some((e) => e.teamPlayerId === me.teamPlayerId)));
    const canDecline = !locked && me !== null && (isHolder || isSuggested);
    const canSwap = canDecline && pendingTarget === null;

    const previousDuty = previous?.jerseyDuty ?? null;
    const broughtBy =
      previousDuty?.teamPlayerId && !previousDuty.voidedAt
        ? (byId.get(previousDuty.teamPlayerId) ?? null)
        : null;

    const detail: JerseyDutyDetail = {
      eventId: event.id,
      teamGender: team.gender,
      locked,
      status: jerseyDutyStatus(duty),
      holder: holder ? this.person(holder, isManager) : null,
      acceptedBy: holder && duty?.acceptedAt ? toRsvpRespondent(duty.acceptedBy, userId) : null,
      broughtBy: broughtBy ? ref(broughtBy) : null,
      suggestion,
      pool: {
        convokedGoingCount: convokedGoing.length,
        exemptedCount: convokedGoing.filter((entry) => entry.exempt).length,
      },
      swapCandidates: canSwap
        ? pool.filter((entry) => entry.teamPlayerId !== personaId).map((e) => this.candidate(e))
        : [],
      pendingSwap:
        pendingTarget && duty?.swapRequestedAt
          ? { to: ref(pendingTarget), requestedAt: duty.swapRequestedAt.toISOString() }
          : null,
      nextMatchStartsAt: following?.startsAt.toISOString() ?? null,
      rights: {
        canAccept,
        canDecline,
        canSwap,
        canCancelSwap: !locked && isHolder && pendingTarget !== null,
        canRespondToSwap: !locked && me !== null && pendingTargetId === me.teamPlayerId,
        canManage: isManager,
      },
    };
    return { detail, duty, holderId, pool };
  }
}
