import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import type {
  ConfirmScoresheetExtractionRequest,
  ParsedScoresheetData,
  ScoresheetExtraction,
  ScoresheetRosterMappingEntry,
  ScoresheetTeamSide,
  SuggestedRosterMappingEntry,
} from '@basketeasy/types/scoresheet-extraction';
import type { EventScoresheet } from '@basketeasy/types/events';
import { PrismaService } from '../prisma/prisma.service';
import { SCORESHEET_OCR_QUEUE } from '../queue/queue.module';
import { asParsedScoresheetData } from '../common/parsed-scoresheet-data';

// BullMQ retries a failed job this many times (exponential backoff, set at
// enqueue time) before the processor gives up and marks the scoresheet
// FAILED — see ScoresheetOcrProcessor's 'failed' listener.
//
// Sized for the failure that actually happens: the vision provider answering
// 503 "currently experiencing high demand". Those spikes last minutes, so the
// previous 3 attempts 5s apart burned every retry inside 15 seconds and marked
// a perfectly readable sheet FAILED. 5 attempts from 30s (30s, 1m, 2m, 4m)
// spans about 7.5 minutes instead, which is what a temporary spike needs —
// and a manager can still relaunch by hand afterwards (retryOcr).
const OCR_JOB_ATTEMPTS = 5;
const OCR_JOB_BACKOFF_DELAY_MS = 30_000;

export interface ScoresheetOcrJobData {
  eventScoresheetId: string;
}

// A roster member as far as the mapping code is concerned.
interface RosterEntry {
  id: string;
  lastName: string;
}

// One player's stats folded out of a confirmed sheet, before it becomes a row.
interface FoldedPlayerStat {
  teamPlayerId: string;
  jerseyNumber: number;
  points: number | null;
  fouls: number | null;
  freeThrowPoints: number | null;
  twoPointPoints: number | null;
  threePointPoints: number | null;
}

// The sheet's Équipe A is the receiving team, Équipe B the visitor — the same
// pairing homeScore/awayScore already use — so the event's own venue says
// which column is ours without asking the manager a second time.
function ourSideOf(venue: 'HOME' | 'AWAY'): ScoresheetTeamSide {
  return venue === 'HOME' ? 'home' : 'away';
}

// Names on the sheet are handwritten and transcribed by a vision model, so
// they arrive with inconsistent case, accents and punctuation. Fold all three
// away before comparing; everything else (nicknames, initials, misreads) is
// left for the manager to resolve rather than guessed at.
function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Only 1 (free throw), 2 and 3 are scorable — anything else means the
// notation around a jersey number was misread, and the play is dropped rather
// than folded into a total it would corrupt. Same rule ScoresheetOcrProcessor
// checks for consistency.
const PLAY_POINT_BUCKETS: Record<number, keyof PointBuckets> = {
  1: 'freeThrowPoints',
  2: 'twoPointPoints',
  3: 'threePointPoints',
};

interface PointBuckets {
  freeThrowPoints: number;
  twoPointPoints: number;
  threePointPoints: number;
}

// Turns the confirmed sheet plus the manager's mapping into one row per mapped
// player. Only our own side is folded: the opposing squad isn't in any roster
// this app manages.
//
// Zero versus unknown, carried over from the points-parsing spec: a mapped
// player with no play of their own scored 0 — but only once at least one play
// was read for our side at all. If our column came back empty, their points
// stay null, so an unreadable running score reports "unknown" rather than
// reporting a whole squad as having scored nothing.
function foldPlayerStats(
  data: ParsedScoresheetData,
  ourSide: ScoresheetTeamSide,
  rosterMapping: ScoresheetRosterMappingEntry[],
): FoldedPlayerStat[] {
  const buckets = new Map<number, PointBuckets>();
  let ourSideHasPlays = false;
  for (const play of data.scoringPlays) {
    if (play.team !== ourSide || play.jerseyNumber === null || play.points === null) {
      continue;
    }
    const bucket = PLAY_POINT_BUCKETS[play.points];
    if (!bucket) {
      continue;
    }
    ourSideHasPlays = true;
    const totals = buckets.get(play.jerseyNumber) ?? {
      freeThrowPoints: 0,
      twoPointPoints: 0,
      threePointPoints: 0,
    };
    totals[bucket] += play.points;
    buckets.set(play.jerseyNumber, totals);
  }

  // Fouls are the one stat genuinely read off the left-hand roster block —
  // its five-cell grid is a thing to look at, unlike points — so they are
  // copied as-is, with no matching row meaning unknown rather than zero.
  const foulsByNumber = new Map<number, number | null>();
  for (const row of data.players) {
    if (row.team === ourSide && row.number !== null) {
      foulsByNumber.set(row.number, row.fouls);
    }
  }

  return rosterMapping.map((entry) => {
    const totals = buckets.get(entry.jerseyNumber);
    if (!totals) {
      const unscored = ourSideHasPlays ? 0 : null;
      return {
        teamPlayerId: entry.teamPlayerId,
        jerseyNumber: entry.jerseyNumber,
        points: unscored,
        fouls: foulsByNumber.get(entry.jerseyNumber) ?? null,
        freeThrowPoints: unscored,
        twoPointPoints: unscored,
        threePointPoints: unscored,
      };
    }
    return {
      teamPlayerId: entry.teamPlayerId,
      jerseyNumber: entry.jerseyNumber,
      points: totals.freeThrowPoints + totals.twoPointPoints + totals.threePointPoints,
      fouls: foulsByNumber.get(entry.jerseyNumber) ?? null,
      ...totals,
    };
  });
}

// The sheet writes a full name in no fixed order ("DUPONT Jean", "Jean
// Dupont"), so match on the surname appearing as a whole token rather than on
// the string as a whole. A surname shared by two roster members resolves to
// nothing: an ambiguity goes to the manager, it is never broken by picking
// the first hit.
function suggestTeamPlayerId(sheetName: string | null, roster: RosterEntry[]): string | null {
  if (!sheetName) {
    return null;
  }
  const tokens = new Set(normalizeName(sheetName).split(' ').filter(Boolean));
  if (tokens.size === 0) {
    return null;
  }
  const matches = roster.filter((entry) => {
    const lastName = normalizeName(entry.lastName);
    return lastName.length > 0 && tokens.has(lastName);
  });
  return matches.length === 1 ? matches[0].id : null;
}

@Injectable()
export class ScoresheetsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SCORESHEET_OCR_QUEUE) private readonly ocrQueue: Queue<ScoresheetOcrJobData>,
  ) {}

  // Called by EventsService right after confirmScoresheetUpload persists the
  // EventScoresheet row — this module owns the async parsing lifecycle from
  // here on, EventsService just hands off the id. Enqueues before writing
  // QUEUED (not after): if the Redis/BullMQ call throws, the row is left at
  // its previous status (UPLOADED) instead of being permanently stranded at
  // QUEUED with no job ever created and no worker to pick it up.
  // jobId: eventScoresheetId lets BullMQ dedupe — a re-upload while the
  // previous job is still queued/processing replaces it instead of running
  // two extractions concurrently against the same row. Since EventScoresheet
  // is upserted (one row per event, not one per upload — see
  // EventsService.confirmScoresheetUpload), the same id is reused across
  // every re-upload of that event's scoresheet, so BullMQ's dedup-by-jobId
  // would otherwise also silently block a *later* re-upload made after the
  // first job already reached a terminal state (Redis keeps a completed/
  // failed job under its id indefinitely by default) — removeOnComplete/
  // removeOnFail free the id back up once the job is actually done, so
  // dedup only ever applies to a genuinely in-flight job.
  async enqueueOcr(eventScoresheetId: string): Promise<void> {
    await this.ocrQueue.add(
      'extract',
      { eventScoresheetId },
      {
        jobId: eventScoresheetId,
        attempts: OCR_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: OCR_JOB_BACKOFF_DELAY_MS },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    await this.prisma.eventScoresheet.update({
      where: { id: eventScoresheetId },
      data: { status: 'QUEUED' },
    });
  }

  // Re-runs the OCR against the file already archived in R2, so recovering
  // from a transient provider outage doesn't ask the manager to find the
  // photo again — the sheet's own storageKey is unchanged, only the job is
  // new. Same audience as the upload it re-runs (a rostered member, narrowed
  // here rather than in the guard, mirroring EventsService's scoresheet
  // routes), since the button sits in the same card.
  async retryOcr(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
  ): Promise<EventScoresheet> {
    await this.assertEventInTeam(clubId, teamId, eventId);
    const myTeamPlayer = await this.findMyTeamPlayer(teamId, userId);
    if (!myTeamPlayer) {
      throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
    }
    const scoresheet = await this.prisma.eventScoresheet.findUnique({ where: { eventId } });
    if (!scoresheet) {
      throw new NotFoundException('Aucune feuille de match à analyser pour ce match');
    }
    // A confirmed sheet's data is a manager's ground truth, and its
    // MatchPlayerStat rows are already folded from it — re-reading the photo
    // over the top of that would silently replace reviewed data with a fresh
    // guess. Replacing the file is the deliberate way back to square one.
    if (scoresheet.status === 'CONFIRMED') {
      throw new BadRequestException(
        'Cette feuille a déjà été confirmée : renvoyez le fichier pour relancer une analyse',
      );
    }
    await this.enqueueOcr(scoresheet.id);
    return {
      status: 'QUEUED',
      uploadedByTeamPlayerId: scoresheet.uploadedByTeamPlayerId,
      uploadedAt: scoresheet.uploadedAt.toISOString(),
    };
  }

  // Same "resolved from the caller's own linked Player, never a body-supplied
  // id" lookup EventsService uses for every self-service scoresheet route —
  // duplicated rather than imported across modules, like assertEventInTeam
  // below.
  private async findMyTeamPlayer(teamId: string, userId: string): Promise<{ id: string } | null> {
    return this.prisma.teamPlayer.findFirst({
      where: { teamId, player: { userId } },
      select: { id: true },
    });
  }

  async getExtraction(
    clubId: string,
    teamId: string,
    eventId: string,
  ): Promise<ScoresheetExtraction | null> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const scoresheet = await this.prisma.eventScoresheet.findUnique({
      where: { eventId },
      include: { extraction: true },
    });
    if (!scoresheet) {
      return null;
    }
    const parsedData = asParsedScoresheetData(scoresheet.extraction?.parsedData);
    const suggestedRosterMapping = await this.buildSuggestedRosterMapping(
      teamId,
      event.venue,
      parsedData,
    );
    return this.toScoresheetExtraction(
      scoresheet.status,
      scoresheet.extraction,
      parsedData,
      suggestedRosterMapping,
    );
  }

  // One suggestion per jersey number our own side of the sheet carries, in
  // sheet order. Computed on read rather than stored: it is a proposal about
  // the current roster, so it must follow a roster that changed since the
  // sheet was parsed rather than freeze the roster as it was.
  private async buildSuggestedRosterMapping(
    teamId: string,
    venue: 'HOME' | 'AWAY' | null,
    parsedData: ParsedScoresheetData | null,
  ): Promise<SuggestedRosterMappingEntry[]> {
    if (!parsedData || venue === null) {
      return [];
    }
    const ourSide = ourSideOf(venue);
    const sheetRows = parsedData.players.filter(
      (player) => player.team === ourSide && player.number !== null,
    );
    if (sheetRows.length === 0) {
      return [];
    }
    const roster = await this.prisma.teamPlayer.findMany({
      where: { teamId },
      select: { id: true, player: { select: { lastName: true } } },
    });
    const rosterEntries: RosterEntry[] = roster.map((entry) => ({
      id: entry.id,
      lastName: entry.player.lastName,
    }));
    const seen = new Set<number>();
    const suggestions: SuggestedRosterMappingEntry[] = [];
    for (const row of sheetRows) {
      const jerseyNumber = row.number as number;
      // A number read twice on one sheet is one player misread as two rows;
      // suggesting them twice would only offer the manager a duplicate the
      // confirm endpoint then rejects.
      if (seen.has(jerseyNumber)) {
        continue;
      }
      seen.add(jerseyNumber);
      suggestions.push({
        jerseyNumber,
        teamPlayerId: suggestTeamPlayerId(row.name, rosterEntries),
        sheetName: row.name,
      });
    }
    return suggestions;
  }

  async confirmExtraction(
    clubId: string,
    teamId: string,
    eventId: string,
    reviewerUserId: string,
    request: ConfirmScoresheetExtractionRequest,
  ): Promise<ScoresheetExtraction> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const scoresheet = await this.prisma.eventScoresheet.findUnique({
      where: { eventId },
      include: { extraction: true },
    });
    if (!scoresheet || !scoresheet.extraction) {
      throw new NotFoundException('Aucune extraction à confirmer pour cette feuille de match');
    }
    // EventsService keeps venue non-null on every MATCH, so this can only
    // fire on data that predates that rule — refuse rather than pick a side
    // and silently credit the opposing squad's points to our roster.
    if (event.venue === null) {
      throw new BadRequestException(
        'Le lieu du match (domicile ou extérieur) doit être renseigné avant de confirmer la feuille',
      );
    }
    // The confirmed data is what the stats are folded from: a manager's
    // corrections are ground truth, so they win over the model's read here
    // exactly as they do for parsedData itself.
    // A FAILED (or partially written) extraction has nothing to fold, so a
    // confirm on one is refused rather than folded into a squad-wide row of
    // nulls — unless the manager sent corrections, which are ground truth and
    // stand in for the read entirely.
    const parsedData =
      request.corrections ?? asParsedScoresheetData(scoresheet.extraction.parsedData);
    if (!parsedData) {
      throw new BadRequestException(
        "L'analyse de la feuille n'a produit aucune donnée : relancez-la ou saisissez les corrections avant de confirmer",
      );
    }
    await this.assertRosterMappingValid(teamId, request.rosterMapping);
    const stats = foldPlayerStats(parsedData, ourSideOf(event.venue), request.rosterMapping);

    // One transaction: a confirm either records the review, the status and
    // the stats it implies, or none of them. Half-confirming would leave a
    // CONFIRMED sheet whose stats are the previous mapping's.
    const extraction = await this.prisma.$transaction(async (tx) => {
      // Deliberately doesn't re-run ScoresheetOcrProcessor's isConsistent
      // check on `corrections` — a manager confirming/editing the data is the
      // human review step NEEDS_REVIEW exists to route to, so their corrected
      // values are trusted as ground truth rather than re-validated against
      // the same heuristic that flagged the original read.
      const updated = await tx.scoresheetExtraction.update({
        where: { id: scoresheet.extraction!.id },
        data: {
          ...(request.corrections
            ? { parsedData: request.corrections as unknown as Prisma.InputJsonValue }
            : {}),
          reviewedByUserId: reviewerUserId,
          reviewedAt: new Date(),
        },
      });
      await tx.eventScoresheet.update({
        where: { id: scoresheet.id },
        data: { status: 'CONFIRMED' },
      });
      // Replaced wholesale rather than upserted: a re-confirm that drops a
      // player from the mapping must drop their row too, not leave the
      // previous read's stats behind under a mapping that no longer claims
      // them.
      await tx.matchPlayerStat.deleteMany({ where: { eventId } });
      if (stats.length > 0) {
        await tx.matchPlayerStat.createMany({
          data: stats.map((stat) => ({ eventId, ...stat })),
        });
      }
      return updated;
    });

    const confirmedParsedData = asParsedScoresheetData(extraction.parsedData);
    const suggestedRosterMapping = await this.buildSuggestedRosterMapping(
      teamId,
      event.venue,
      confirmedParsedData,
    );
    return this.toScoresheetExtraction(
      'CONFIRMED',
      extraction,
      confirmedParsedData,
      suggestedRosterMapping,
    );
  }

  // Validates the whole mapping before anything is written, in one query
  // rather than one per entry. Same shape as EventsService.setEventConvocations'
  // "every id must be on this team's own roster" check.
  private async assertRosterMappingValid(
    teamId: string,
    rosterMapping: ScoresheetRosterMappingEntry[],
  ): Promise<void> {
    const teamPlayerIds = rosterMapping.map((entry) => entry.teamPlayerId);
    if (new Set(teamPlayerIds).size !== teamPlayerIds.length) {
      throw new BadRequestException('Un même joueur ne peut pas être associé à deux numéros');
    }
    const jerseyNumbers = rosterMapping.map((entry) => entry.jerseyNumber);
    if (new Set(jerseyNumbers).size !== jerseyNumbers.length) {
      throw new BadRequestException('Un même numéro ne peut pas être associé à deux joueurs');
    }
    if (teamPlayerIds.length === 0) {
      return;
    }
    const found = await this.prisma.teamPlayer.findMany({
      where: { teamId, id: { in: teamPlayerIds } },
      select: { id: true },
    });
    if (found.length !== teamPlayerIds.length) {
      throw new BadRequestException(
        "Un joueur sélectionné n'appartient pas à l'effectif de l'équipe",
      );
    }
  }

  private toScoresheetExtraction(
    status: string,
    extraction: {
      confidence: number | null;
      failureReason: string | null;
      reviewedByUserId: string | null;
      reviewedAt: Date | null;
    } | null,
    parsedData: ParsedScoresheetData | null,
    suggestedRosterMapping: SuggestedRosterMappingEntry[],
  ): ScoresheetExtraction {
    return {
      status: status as ScoresheetExtraction['status'],
      parsedData,
      confidence: extraction?.confidence ?? null,
      failureReason: extraction?.failureReason ?? null,
      reviewedByUserId: extraction?.reviewedByUserId ?? null,
      reviewedAt: extraction?.reviewedAt?.toISOString() ?? null,
      suggestedRosterMapping,
    };
  }

  // Duplicated from EventsService rather than imported across modules — same
  // defense-in-depth re-verification pattern (see CLAUDE.md's Teams module
  // section), kept local since this module doesn't otherwise depend on
  // EventsService.
  // Returns the fetched row rather than just asserting, the same way
  // EventsService.assertEventInTeam does — both callers need the event's own
  // venue to know which column of the sheet is ours.
  private async assertEventInTeam(
    clubId: string,
    teamId: string,
    eventId: string,
  ): Promise<{ venue: 'HOME' | 'AWAY' | null }> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Team not found');
    }
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.teamId !== teamId) {
      throw new NotFoundException('Event not found');
    }
    if (event.type !== 'MATCH') {
      throw new BadRequestException('La feuille de match ne concerne que les matchs');
    }
    return { venue: event.venue };
  }
}
