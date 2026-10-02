import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EventRsvpSource,
  EventRsvpStatus,
  EventTravelMode,
  EventType,
  EventVenue,
  EventVoteCategory,
  Prisma,
} from '@prisma/client';
import type {
  EventConvocationRosterEntry,
  EventLogisticsAssignee,
  EventLogisticsField,
  EventMatchPlayerStats,
  EventMatchResult,
  EventRecurrenceRequest,
  EventRsvpRespondent,
  EventRsvpRosterEntry,
  EventRsvpSummary,
  EventScoresheet,
  EventScoresheetUploadUrlResponse,
  EventUpdateScope,
  EventVoteCandidateResult,
  EventVoteResults,
  TeamEvent,
} from '@basketeasy/types/events';
import {
  eventVenueLabel,
  isSameEventLocation,
  isUnknownEventLocation,
} from '@basketeasy/types/events';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import {
  JERSEY_DUTY_ERROR_CODES,
  type EventJerseyDutySummary,
} from '@basketeasy/types/jersey-duty';
import type { EventShareStatus, EventWhatsAppSettings } from '@basketeasy/types/whatsapp-reminder';
import { PrismaService } from '../prisma/prisma.service';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { StorageService } from '../storage/storage.service';
import { ScoresheetsService } from '../scoresheets/scoresheets.service';
import { resolvePagination } from '../common/pagination';
import { computeEventRsvpSummaries } from '../common/event-rsvp-summary';
import { asParsedScoresheetData } from '../common/parsed-scoresheet-data';
import { deriveMatchResult } from '../common/match-result';
import { assertCanActForPlayer, resolveActingTeamPlayer } from '../common/acting-as';
import {
  groupByRecipient,
  recipientDeepLink,
  resolvePlayerAudience,
} from '../common/player-audience';
import { subjectLabel } from '../common/notification-subject';
import { RSVP_RESPONDENT_SELECT, toRsvpRespondent } from '../common/rsvp-respondent';
import { NotificationsService } from '../notifications/notifications.service';
import { MeetingPointsService } from '../meeting-points/meeting-points.service';
import { addParisWeeks, withParisTimeOfDay } from '../common/paris-time';
import { voteClosesAt, voteOpensAt } from '../common/vote-window';
import { resolveSettings } from '../whatsapp-reminders/whatsapp-reminder.scheduler';
import { WhatsAppReminderService } from '../whatsapp-reminders/whatsapp-reminder.service';
import { JerseyDutyService } from './jersey-duty.service';
import { ListEventsDto } from './dto/list-events.dto';
import {
  cancellationNotification,
  convocationNotification,
  venueChangedNotification,
} from './event-notification-copy';

// Caps a single recurring create at ~2 years of weekly occurrences, so a
// distant `until` date can't be used to write an unbounded number of rows.
const MAX_RECURRING_OCCURRENCES = 104;
// Allowlisted scoresheet formats and their storageKey file extension — kept
// as one map so the content-type check and the extension picked for the
// object key can never disagree. A scoresheet capture may be a PDF export
// (some e-Marque flows produce one) as well as a photo.
const SCORESHEET_CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

type EventRow = {
  id: string;
  teamId: string;
  type: EventType;
  startsAt: Date;
  location: string;
  locationName: string | null;
  notes: string | null;
  opponentName: string | null;
  venue: EventVenue | null;
  jerseysTeamPlayerId: string | null;
  ballsTeamPlayerId: string | null;
  recurrenceId: string | null;
  externalId: string | null;
  timeConfirmed: boolean;
  createdAt: Date;
  waReminderOverride: boolean | null;
  waOffsetMinutes: number | null;
};

// Who gave an answer, and when — read off the same EventRsvp row as its status.
type RsvpAnswerMeta = { respondedAt: Date; respondedBy: EventRsvpRespondent | null };

// The persona's slice of a batch — the caller's own, or the player they act
// for through `forPlayerId`: their RSVP and convocation per event, and their
// TeamPlayer on this team (null when not rostered).
type CallerEventState = {
  rsvpStatuses: Map<string, EventRsvpStatus>;
  answers: Map<string, RsvpAnswerMeta>;
  convokedEventIds: Set<string>;
  // Read off the same EventRsvp rows as rsvpStatuses — no extra query.
  travelModes: Map<string, EventTravelMode>;
  myTeamPlayerId: string | null;
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamManagerGuard: TeamManagerGuard,
    private readonly storage: StorageService,
    private readonly scoresheets: ScoresheetsService,
    private readonly notifications: NotificationsService,
    private readonly meetingPoints: MeetingPointsService,
    private readonly whatsAppReminders: WhatsAppReminderService,
    private readonly jerseyDuty: JerseyDutyService,
  ) {}

  async listEvents(
    clubId: string,
    teamId: string,
    query: ListEventsDto,
    userId: string,
  ): Promise<PaginatedResult<TeamEvent>> {
    await this.assertTeamInClub(clubId, teamId);
    const { skip, take, page, pageSize } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.EventWhereInput = {
      teamId,
      ...(query.from || query.to
        ? {
            startsAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { location: { contains: query.search, mode: 'insensitive' } },
              { notes: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.EventOrderByWithRelationInput = { startsAt: query.sortOrder ?? 'asc' };

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({ where, orderBy, skip, take }),
      this.prisma.event.count({ where }),
    ]);

    return {
      items: await this.buildTeamEventsForUser(clubId, teamId, userId, events, query.forPlayerId),
      total,
      page,
      pageSize,
    };
  }

  // Single-event fetch backing the match detail page — reuses
  // assertEventInTeam's existing defense-in-depth check rather than a new
  // lookup, same pattern every other single-event route in this service
  // already follows.
  async getEvent(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    forPlayerId?: string,
  ): Promise<TeamEvent> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const [teamEvent] = await this.buildTeamEventsForUser(
      clubId,
      teamId,
      userId,
      [event],
      forPlayerId,
    );
    return teamEvent;
  }

  async createEvent(
    clubId: string,
    teamId: string,
    data: {
      type: EventType;
      startsAt: string;
      location: string;
      locationName?: string | null;
      notes?: string;
      opponentName?: string;
      venue?: EventVenue;
      recurrence?: EventRecurrenceRequest;
      waReminderOverride?: boolean | null;
      waOffsetMinutes?: number | null;
    },
    userId: string,
  ): Promise<TeamEvent[]> {
    await this.assertTeamInClub(clubId, teamId);
    if (data.type === EventType.MATCH && !data.opponentName) {
      throw new BadRequestException("Le nom de l'adversaire est requis pour un match");
    }
    if (data.type === EventType.MATCH && !data.venue) {
      throw new BadRequestException('Le domicile/extérieur est requis pour un match');
    }
    // The placeholder is the FFBB import's word, never a manager's.
    if (isUnknownEventLocation(data.location)) {
      throw new BadRequestException('Le lieu doit être une adresse');
    }
    const locationName = data.locationName ?? null;

    const occurrences = this.buildOccurrences(data.startsAt, data.recurrence);
    // One recurrenceId is shared by every row in this batch — only when the
    // caller actually asked for recurrence — so a plain single event stays
    // un-grouped, same as before this feature existed.
    const recurrenceId = data.recurrence ? randomUUID() : null;
    const opponentName = data.type === EventType.MATCH ? (data.opponentName ?? null) : null;
    const venue = data.type === EventType.MATCH ? (data.venue ?? null) : null;

    const events = await this.prisma.$transaction(
      occurrences.map((startsAt) =>
        this.prisma.event.create({
          data: {
            teamId,
            type: data.type,
            startsAt,
            location: data.location,
            locationName,
            notes: data.notes ?? null,
            opponentName,
            venue,
            recurrenceId,
            waReminderOverride: data.waReminderOverride ?? null,
            waOffsetMinutes: data.waOffsetMinutes ?? null,
          },
        }),
      ),
    );
    // One reconcile for the whole series, after the commit.
    await this.syncWhatsAppReminders(
      clubId,
      teamId,
      userId,
      events.map((e) => e.id),
      data.waReminderOverride === true,
    );
    // A fresh event has no logistics assignee and no confirmed scoresheet,
    // so those resolvers short-circuit without a query.
    return this.buildTeamEventsForUser(clubId, teamId, userId, events);
  }

  // A recurring create is materialized as one independent Event row per
  // week, rather than a stored rule expanded at read time — occurrences
  // share a recurrenceId (see createEvent) so they can still be bulk
  // edited/deleted as a group via updateEvent/deleteEvent's scope param.
  private buildOccurrences(startsAt: string, recurrence?: EventRecurrenceRequest): Date[] {
    const start = new Date(startsAt);
    if (!recurrence) {
      return [start];
    }

    const until = new Date(recurrence.until);
    if (until < start) {
      throw new BadRequestException(
        'La date de fin de récurrence doit être postérieure à la date de début',
      );
    }

    // Stepped in Paris weeks, not 7 × 24 h: a series crossing a DST change
    // keeps its wall-clock time instead of drifting by an hour.
    const occurrences: Date[] = [];
    for (
      let current = start;
      current <= until && occurrences.length < MAX_RECURRING_OCCURRENCES;
      current = addParisWeeks(start, occurrences.length)
    ) {
      occurrences.push(current);
    }
    return occurrences;
  }

  async updateEvent(
    clubId: string,
    teamId: string,
    eventId: string,
    data: {
      type?: EventType;
      startsAt?: string;
      location?: string;
      locationName?: string | null;
      notes?: string;
      opponentName?: string;
      venue?: EventVenue;
      scope?: EventUpdateScope;
      waReminderOverride?: boolean | null;
      waOffsetMinutes?: number | null;
    },
    userId: string,
  ): Promise<TeamEvent[]> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const scope = data.scope ?? 'THIS';

    if (scope !== 'THIS' && !event.recurrenceId) {
      throw new BadRequestException("Cet événement ne fait pas partie d'une série récurrente");
    }
    if (scope !== 'THIS' && data.startsAt !== undefined) {
      throw new BadRequestException('La date ne peut être modifiée que pour cet événement seul');
    }

    const resultingType = data.type ?? event.type;
    const resultingOpponent =
      data.opponentName !== undefined ? data.opponentName : event.opponentName;
    if (resultingType === EventType.MATCH && !resultingOpponent) {
      throw new BadRequestException("Le nom de l'adversaire est requis pour un match");
    }
    const resultingVenue = data.venue !== undefined ? data.venue : event.venue;
    if (resultingType === EventType.MATCH && !resultingVenue) {
      throw new BadRequestException('Le domicile/extérieur est requis pour un match');
    }

    // The placeholder is the FFBB import's word, never a manager's: refused
    // when it would replace something else, but EventEditModal re-sends
    // `location` on every save, so an unchanged placeholder passes.
    const resultingLocation = data.location ?? event.location;
    const locationChanged = data.location !== undefined && data.location !== event.location;
    if (
      data.location !== undefined &&
      isUnknownEventLocation(data.location) &&
      !isUnknownEventLocation(event.location)
    ) {
      throw new BadRequestException('Le lieu doit être une adresse');
    }
    // A name describes an address: a new address sent without one clears the
    // old name rather than pinning it to the wrong place.
    const resultingLocationName =
      data.locationName !== undefined
        ? data.locationName
        : locationChanged
          ? null
          : event.locationName;
    // A name without an address can't be geocoded, and the timeline would lie.
    if (resultingLocationName && isUnknownEventLocation(resultingLocation)) {
      throw new BadRequestException("Renseignez l'adresse de la salle");
    }

    const ids = scope === 'THIS' ? [eventId] : await this.resolveScopeIds(teamId, event, scope);

    const updateData: Prisma.EventUpdateInput = {
      ...(data.startsAt !== undefined ? { startsAt: new Date(data.startsAt) } : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
      ...(data.locationName !== undefined || locationChanged
        ? { locationName: resultingLocationName }
        : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.waReminderOverride !== undefined
        ? { waReminderOverride: data.waReminderOverride }
        : {}),
      ...(data.waOffsetMinutes !== undefined ? { waOffsetMinutes: data.waOffsetMinutes } : {}),
      // Switching to TRAINING always clears the opponent, even if one was
      // also passed in the same request — there's nothing sensible to keep
      // it for once the event isn't a match. Skipped when it's already
      // null, so a plain training-event edit doesn't touch the column.
      ...(resultingType === EventType.TRAINING && event.opponentName !== null
        ? { opponentName: null }
        : resultingType === EventType.MATCH && data.opponentName !== undefined
          ? { opponentName: data.opponentName }
          : {}),
      // Same rule as opponentName above, applied to venue.
      ...(resultingType === EventType.TRAINING && event.venue !== null
        ? { venue: null }
        : resultingType === EventType.MATCH && data.venue !== undefined
          ? { venue: data.venue }
          : {}),
    };

    const becomesTraining = resultingType === EventType.TRAINING && event.type === EventType.MATCH;
    // The meeting point is a MATCH concept — a switch to TRAINING drops the
    // whole EventMeeting row rather than leaving a hidden override behind.
    // Otherwise, a meeting-time override was set against the old tip-off,
    // and keeping it across a reschedule would send the group to the wrong
    // hour. Same transaction as the event write, so neither lands alone.
    const meetingCleanup = becomesTraining
      ? [
          this.prisma.eventMeeting.deleteMany({ where: { eventId: { in: ids } } }),
          // The jersey wash is a MATCH concept too: its duty and declines go
          // with the switch (a TRAINING → MATCH needs nothing).
          this.prisma.eventJerseyDuty.deleteMany({ where: { eventId: { in: ids } } }),
          this.prisma.eventJerseyDecline.deleteMany({ where: { eventId: { in: ids } } }),
        ]
      : data.startsAt !== undefined
        ? [
            this.prisma.eventMeeting.updateMany({
              where: { eventId: { in: ids } },
              data: { meetsAtOverride: null },
            }),
          ]
        : [];
    // « Changement de salle » compares against the address each row had
    // before the write, so it is read now: the anchor already is, a series'
    // other occurrences need one read.
    const previousLocations =
      data.location === undefined
        ? null
        : scope === 'THIS'
          ? new Map([[event.id, event.location]])
          : new Map(
              (
                await this.prisma.event.findMany({
                  where: { id: { in: ids } },
                  select: { id: true, location: true },
                })
              ).map((row) => [row.id, row.location]),
            );

    const results = await this.prisma.$transaction([
      ...ids.map((id) => this.prisma.event.update({ where: { id }, data: updateData })),
      ...meetingCleanup,
    ]);
    const updated = results.slice(0, ids.length) as EventRow[];
    // A TRAINING that becomes a MATCH has no EventMeeting row yet, so no
    // travel time and no known meeting hour: announcing now would be a no-op.
    // Queue the route instead; the recompute job announces once the hour is
    // known (« RDV fixé »). A new kick-off on an existing match moves an
    // already-known meeting time with it, which announces straight away.
    const becomesMatch = resultingType === EventType.MATCH && event.type === EventType.TRAINING;
    // A new address on a match makes the stored route stale: queue the
    // recompute now rather than waiting for someone to read the match, so
    // the RDV announcement doesn't wait on a reader either.
    if (becomesMatch || (locationChanged && resultingType === EventType.MATCH)) {
      await this.meetingPoints.enqueueRecompute(ids);
    } else if (data.startsAt !== undefined && !becomesTraining) {
      await this.meetingPoints.announceMeetingChanges(ids);
    }
    if (previousLocations) {
      await this.notifyVenueChange(clubId, teamId, updated, previousLocations);
    }
    await this.syncWhatsAppReminders(clubId, teamId, userId, ids, data.waReminderOverride === true);
    // Sync first, then prompts: an event whose reminder is still scheduled has
    // nothing to correct, and this only raises for what the group already read.
    await this.whatsAppReminders.onEventsChanged(ids);
    return this.buildTeamEventsForUser(clubId, teamId, userId, updated);
  }

  // The reminder is best-effort like every other notification: the sync logs
  // and swallows its own failures, so a dead Redis is never a 500 on the event
  // write. Rule 7: an event override to « on » needs a link to carry, so it
  // switches the team's guest link on first (idempotent, audited as any enable).
  private async syncWhatsAppReminders(
    clubId: string,
    teamId: string,
    userId: string,
    eventIds: string[],
    needsGuestLink: boolean,
  ): Promise<void> {
    if (needsGuestLink) await this.whatsAppReminders.ensureGuestLink(clubId, teamId, userId);
    await this.whatsAppReminders.syncEvents(eventIds);
  }

  // Retries a Serializable transaction on Postgres's serialization failure
  // (Prisma P2034) — the expected, intended outcome when two concurrent
  // requests race on the same rows (a genuine double-click, issue #141's own
  // scenario), not an error condition either caller should see. Without a
  // retry, the loser of the race would get a raw 500 instead of the request
  // simply re-reading the winner's already-committed state and succeeding.
  private async runSerializableTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const isSerializationFailure =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!isSerializationFailure || attempt === maxAttempts) throw error;
      }
    }
    throw new Error('unreachable');
  }

  async deleteEvent(
    clubId: string,
    teamId: string,
    eventId: string,
    scope: EventUpdateScope = 'THIS',
  ): Promise<void> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);

    if (scope !== 'THIS' && !event.recurrenceId) {
      throw new BadRequestException("Cet événement ne fait pas partie d'une série récurrente");
    }

    const ids = scope === 'THIS' ? [eventId] : await this.resolveScopeIds(teamId, event, scope);

    // R2 cleanup is best-effort external I/O, not a DB row (EventScoresheet's
    // row cascades with its Event regardless) — gathered and executed before
    // the transaction below, same as always, since it isn't part of the race
    // the transaction exists to close.
    await this.deleteScoresheetObjects(ids);

    // Read the current convocations *and* delete the event(s) inside one
    // Serializable transaction — the same pattern issue #141 used for
    // setEventConvocations. A convocation change (add/remove a player) racing
    // with this delete on the same event must not be able to read a
    // convocation list that a concurrent write is about to change (or just
    // changed): a player added moments before deletion could otherwise be
    // missed, and a player removed moments before could otherwise still get
    // a cancellation notice. Because EventConvocation cascade-deletes with
    // its Event, the read has to happen before deleteMany, but "before" is
    // only race-free when both live in the same isolated transaction as
    // setEventConvocations's own read+write. runSerializableTransaction
    // retries the (expected, occasional) loser of that race instead of
    // surfacing a serialization failure as a 500.
    // The meeting plans a cancellation snapshots are resolved here, outside the
    // transaction: the resolver reads through the base client.
    const cancellationPlans = await this.whatsAppReminders.resolveCancellationPlans(teamId, ids);
    const { convokedTeamPlayerIds, cancellations } = await this.runSerializableTransaction(
      async (tx) => {
        const convocations = await tx.eventConvocation.findMany({
          where: { eventId: { in: ids }, teamPlayer: { teamId } },
          select: { teamPlayerId: true },
        });

        // WhatsApp: cancelling deletes the event, so a CANCELLATION share for
        // each event the group was told about is written here, with a snapshot,
        // before its rows go — and no reminder or update is left orphaned.
        const cancellations = await this.whatsAppReminders.prepareCancellations(
          tx,
          teamId,
          ids,
          cancellationPlans,
        );

        await tx.event.deleteMany({ where: { id: { in: ids } } });

        // Everyone convoked to any of the events being cancelled, deduplicated
        // by roster slot. Deliberately the convoked list rather than the whole
        // roster: a cancellation is only news to someone who was expecting to
        // play, and notifying an entire roster about a training two of them
        // were called up for is noise that trains people to ignore the bell.
        // Slots, not users: the audience (the player and their guardians) is
        // resolved after the delete, which removes events, never roster slots.
        return {
          convokedTeamPlayerIds: [...new Set(convocations.map((row) => row.teamPlayerId))],
          cancellations,
        };
      },
    );

    await this.whatsAppReminders.afterCancellations(teamId, cancellations);
    await this.notifyCancellation(clubId, teamId, event, ids.length, convokedTeamPlayerIds);
  }

  private async notifyCancellation(
    clubId: string,
    teamId: string,
    event: EventRow,
    cancelledCount: number,
    teamPlayerIds: string[],
  ): Promise<void> {
    if (teamPlayerIds.length === 0) return;

    const [team, audience] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }),
      resolvePlayerAudience(this.prisma, teamPlayerIds),
    ]);
    const recipients = groupByRecipient(audience);
    if (recipients.length === 0) return;
    const teamName = team?.name ?? 'votre équipe';

    await this.notifications.notify(
      recipients.map((recipient) => {
        const copy = cancellationNotification(teamName, event, cancelledCount, recipient);
        return {
          userId: recipient.userId,
          type: 'EVENT_CANCELLED' as const,
          title: copy.title,
          body: copy.body,
          subjectFirstName: subjectLabel(recipient),
          // The team's calendar, not the event: the event no longer exists,
          // so its own page would 404 the moment the reader tapped through.
          deepLink: recipientDeepLink(
            recipient,
            `/clubs/${clubId}/teams/${teamId}`,
            (childClubId) => `/clubs/${childClubId}/teams/${teamId}`,
          ),
        };
      }),
    );
  }

  // Only a known venue moving to another is news: filling in « Lieu non
  // communiqué » tells nobody anything they were relying on, a name-only or
  // case-only edit sends nobody anywhere new, and a TRAINING's gym is known
  // to the team. Readers are the players expected there (convoked or
  // GOING) and their guardians, one message each for the whole edit.
  // Best-effort: the edit has already been written.
  private async notifyVenueChange(
    clubId: string,
    teamId: string,
    updated: EventRow[],
    previousLocations: Map<string, string>,
  ): Promise<void> {
    const now = new Date();
    const moved = updated.filter((row) => {
      const previous = previousLocations.get(row.id);
      return (
        previous !== undefined &&
        row.type === EventType.MATCH &&
        row.startsAt > now &&
        !isUnknownEventLocation(previous) &&
        !isSameEventLocation(previous, row.location)
      );
    });
    if (moved.length === 0) return;

    try {
      const eventIds = moved.map((row) => row.id);
      const [convocations, going, team] = await Promise.all([
        this.prisma.eventConvocation.findMany({
          where: { eventId: { in: eventIds }, teamPlayer: { teamId } },
          select: { teamPlayerId: true },
        }),
        this.prisma.eventRsvp.findMany({
          where: {
            eventId: { in: eventIds },
            status: EventRsvpStatus.GOING,
            teamPlayer: { teamId },
          },
          select: { teamPlayerId: true },
        }),
        this.prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }),
      ]);
      const teamPlayerIds = [
        ...new Set([...convocations, ...going].map((row) => row.teamPlayerId)),
      ];
      if (teamPlayerIds.length === 0) return;
      const recipients = groupByRecipient(await resolvePlayerAudience(this.prisma, teamPlayerIds));
      if (recipients.length === 0) return;

      const teamName = team?.name ?? 'votre équipe';
      const first = moved.reduce((a, b) => (b.startsAt < a.startsAt ? b : a));
      const newLabel = eventVenueLabel(first);
      const single = moved.length === 1;
      await this.notifications.notify(
        recipients.map((recipient) => {
          const copy = venueChangedNotification(teamName, first, newLabel, moved.length, recipient);
          return {
            userId: recipient.userId,
            type: 'EVENT_VENUE_CHANGED' as const,
            title: copy.title,
            body: copy.body,
            subjectFirstName: subjectLabel(recipient),
            // One match links to it; a series to the team's calendar.
            deepLink: single
              ? recipientDeepLink(
                  recipient,
                  `/clubs/${clubId}/teams/${teamId}/events/${first.id}`,
                  (childClubId) => `/clubs/${childClubId}/teams/${teamId}/events/${first.id}`,
                )
              : recipientDeepLink(
                  recipient,
                  `/clubs/${clubId}/teams/${teamId}`,
                  (childClubId) => `/clubs/${childClubId}/teams/${teamId}`,
                ),
          };
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Venue change notification failed: ${message}`);
    }
  }

  // EventScoresheet's onDelete: Cascade removes the DB row automatically
  // when its Event is deleted, but never the underlying R2 object — deleted
  // here first (best-effort) so deleting a match doesn't leave its
  // scoresheet file permanently orphaned in the bucket. Doesn't cover every
  // path an Event can disappear through (e.g. disbanding the whole team) —
  // an R2 lifecycle rule expiring untouched objects under scoresheets/ is
  // the intended backstop for those, not more cascade-cleanup code wired
  // into every service that can indirectly delete an Event.
  private async deleteScoresheetObjects(eventIds: string[]): Promise<void> {
    const scoresheets = await this.prisma.eventScoresheet.findMany({
      where: { eventId: { in: eventIds } },
      select: { storageKey: true },
    });
    await Promise.all(scoresheets.map((s) => this.deleteStorageObjectSafely(s.storageKey)));
  }

  // Bulk-changes only hour/minute across a series, leaving each occurrence's
  // own date untouched — the narrower counterpart to updateEvent's full
  // startsAt replace (which stays THIS-only). hour/minute are a Paris
  // wall-clock time, resolved per row so occurrences on either side of a
  // DST change all land on it.
  async updateEventTimeOfDay(
    clubId: string,
    teamId: string,
    eventId: string,
    data: {
      scope: Extract<EventUpdateScope, 'THIS_AND_FUTURE' | 'ALL'>;
      hour: number;
      minute: number;
    },
    userId: string,
  ): Promise<TeamEvent[]> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    if (!event.recurrenceId) {
      throw new BadRequestException("Cet événement ne fait pas partie d'une série récurrente");
    }

    const ids = await this.resolveScopeIds(teamId, event, data.scope);
    const rows = await this.prisma.event.findMany({ where: { id: { in: ids } } });

    const results = await this.prisma.$transaction([
      ...rows.map((row) => {
        const startsAt = withParisTimeOfDay(row.startsAt, data.hour, data.minute);
        return this.prisma.event.update({ where: { id: row.id }, data: { startsAt } });
      }),
      // Same rule as updateEvent: a meeting-time override belongs to the old
      // kick-off.
      this.prisma.eventMeeting.updateMany({
        where: { eventId: { in: ids } },
        data: { meetsAtOverride: null },
      }),
    ]);
    const updated = results.slice(0, rows.length) as EventRow[];
    await this.meetingPoints.announceMeetingChanges(ids);
    await this.whatsAppReminders.syncEvents(ids);
    await this.whatsAppReminders.onEventsChanged(ids);
    return this.buildTeamEventsForUser(clubId, teamId, userId, updated);
  }

  // Self-service only: the caller can only ever set/clear the status of a
  // persona they may act for — their own TeamPlayer, or with `forPlayerId` a
  // child they are a guardian of — resolved through resolveActingTeamPlayer,
  // never an arbitrary teamPlayerId from the request. The row records who
  // answered (respondedByUserId: the caller, never the persona), which is
  // what « Répondu par Sophie M. » reads.
  //
  // The resulting myRsvpStatus is already known from the write itself (it's
  // exactly `status`), and the event row doesn't change from the write —
  // so this avoids re-validating the event and re-resolving the caller's
  // TeamPlayer a second time through a shared helper, which used to turn a
  // single RSVP write into ~9 DB round trips. It does still pay
  // resolveEventRosterSummaries's fixed, bounded cost (3 queries) to return
  // a fresh whole-roster rsvpSummary reflecting the write just made — that
  // one is unavoidable, not a regression of the round-trip fix above.
  async setMyRsvp(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    status: EventRsvpStatus,
    forPlayerId?: string,
  ): Promise<TeamEvent> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const teamPlayer = await this.findActingTeamPlayer(teamId, userId, forPlayerId);
    const respondedAt = new Date();
    // The answer and its history row commit together: a history that can miss
    // an answer is worse than none, since a coach reads it to spot tampering.
    const rsvp = await this.prisma.$transaction(async (tx) => {
      const written = await tx.eventRsvp.upsert({
        where: { eventId_teamPlayerId: { eventId, teamPlayerId: teamPlayer.id } },
        create: {
          eventId,
          teamPlayerId: teamPlayer.id,
          status,
          respondedAt,
          respondedByUserId: userId,
          source: EventRsvpSource.APP,
        },
        update: {
          status,
          respondedAt,
          respondedByUserId: userId,
          source: EventRsvpSource.APP,
          // Leaving GOING drops the travel choice, so GOING → MAYBE → GOING
          // starts again from the meeting point rather than a stale « Direct ».
          // Re-answering GOING keeps it: re-tapping « Présent » mustn't undo it.
          ...(status !== EventRsvpStatus.GOING
            ? { travelMode: EventTravelMode.MEETING_POINT }
            : {}),
        },
        include: { respondedBy: RSVP_RESPONDENT_SELECT },
      });
      await tx.eventRsvpChange.create({
        data: {
          eventId,
          teamPlayerId: teamPlayer.id,
          status,
          travelMode: status === EventRsvpStatus.GOING ? written.travelMode : null,
          source: EventRsvpSource.APP,
          respondedByUserId: userId,
        },
      });
      return written;
    });
    return this.buildOwnAnswer(teamId, event, teamPlayer.id, {
      status,
      travelMode: rsvp.travelMode,
      respondedAt: rsvp.respondedAt,
      respondedBy: toRsvpRespondent(rsvp.respondedBy, userId),
    });
  }

  // Same round-trip-avoiding shape as setMyRsvp above — myRsvpStatus is
  // known to be null after a clear, no need to re-read it.
  async clearMyRsvp(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    forPlayerId?: string,
  ): Promise<TeamEvent> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const teamPlayer = await this.findActingTeamPlayer(teamId, userId, forPlayerId);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.eventRsvp.deleteMany({
        where: { eventId, teamPlayerId: teamPlayer.id },
      });
      // Clearing an answer that was never given is not a change.
      if (count > 0) {
        await tx.eventRsvpChange.create({
          data: {
            eventId,
            teamPlayerId: teamPlayer.id,
            status: null,
            travelMode: null,
            source: EventRsvpSource.APP,
            respondedByUserId: userId,
          },
        });
      }
    });
    return this.buildOwnAnswer(teamId, event, teamPlayer.id, null);
  }

  // Self-service like RSVP (same persona rule), and only once the persona is
  // coming: a travel choice means nothing for someone who isn't. The
  // respondent isn't rewritten — « Répondu par » is about the presence
  // answer, and switching RDV to Direct isn't a new one.
  async setMyTravelMode(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    travelMode: EventTravelMode,
    forPlayerId?: string,
  ): Promise<TeamEvent> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    if (event.type !== EventType.MATCH) {
      throw new BadRequestException('Le mode de déplacement ne concerne que les matchs');
    }
    const teamPlayer = await this.findActingTeamPlayer(teamId, userId, forPlayerId);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.eventRsvp.updateMany({
        where: { eventId, teamPlayerId: teamPlayer.id, status: EventRsvpStatus.GOING },
        data: { travelMode },
      });
      if (count === 0) {
        throw new BadRequestException("Indiquez d'abord que vous êtes présent·e");
      }
      await tx.eventRsvpChange.create({
        data: {
          eventId,
          teamPlayerId: teamPlayer.id,
          status: EventRsvpStatus.GOING,
          travelMode,
          source: EventRsvpSource.APP,
          respondedByUserId: userId,
        },
      });
    });
    const rsvp = await this.prisma.eventRsvp.findUniqueOrThrow({
      where: { eventId_teamPlayerId: { eventId, teamPlayerId: teamPlayer.id } },
      select: { respondedAt: true, respondedBy: RSVP_RESPONDENT_SELECT },
    });
    return this.buildOwnAnswer(teamId, event, teamPlayer.id, {
      status: EventRsvpStatus.GOING,
      travelMode,
      respondedAt: rsvp.respondedAt,
      respondedBy: toRsvpRespondent(rsvp.respondedBy, userId),
    });
  }

  // The persona's roster slot for a write, or the 403 every self-service
  // write has always answered for someone who isn't on the team.
  private async findActingTeamPlayer(teamId: string, userId: string, forPlayerId?: string) {
    const teamPlayer = await resolveActingTeamPlayer(this.prisma, {
      userId,
      teamId,
      forPlayerId,
    });
    if (!teamPlayer) {
      throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
    }
    return teamPlayer;
  }

  // The TeamEvent after the caller changed their own answer: that answer is
  // known from the write, so only the convocation flag is read back.
  private async buildOwnAnswer(
    teamId: string,
    event: EventRow,
    teamPlayerId: string,
    answer: ({ status: EventRsvpStatus; travelMode: EventTravelMode } & RsvpAnswerMeta) | null,
  ): Promise<TeamEvent> {
    const convoked = await this.isConvoked(event.id, teamPlayerId);
    const [teamEvent] = await this.buildTeamEvents(teamId, [event], {
      rsvpStatuses: answer ? new Map([[event.id, answer.status]]) : new Map(),
      answers: answer
        ? new Map([
            [event.id, { respondedAt: answer.respondedAt, respondedBy: answer.respondedBy }],
          ])
        : new Map(),
      travelModes: answer ? new Map([[event.id, answer.travelMode]]) : new Map(),
      convokedEventIds: convoked ? new Set([event.id]) : new Set(),
      myTeamPlayerId: teamPlayerId,
    });
    return teamEvent;
  }

  // Full roster (not just responders) so managers/teammates see who hasn't
  // answered yet, not only who has — and who gave each answer, which is the
  // coach's « Sophie M. · parent ».
  async listEventRsvps(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    forPlayerId?: string,
  ): Promise<EventRsvpRosterEntry[]> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const isPersona = await this.personaMatcher(userId, forPlayerId);
    const roster = await this.prisma.teamPlayer.findMany({
      where: { teamId },
      include: {
        player: true,
        rsvps: { where: { eventId }, include: { respondedBy: RSVP_RESPONDENT_SELECT } },
      },
      orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
    });
    return roster.map((tp) => {
      const rsvp = tp.rsvps[0];
      return {
        teamPlayerId: tp.id,
        playerId: tp.playerId,
        firstName: tp.player.firstName,
        lastName: tp.player.lastName,
        role: tp.role,
        status: rsvp?.status ?? null,
        respondedAt: rsvp?.respondedAt.toISOString() ?? null,
        respondedBy: toRsvpRespondent(rsvp?.respondedBy ?? null, userId),
        respondedByGuardian:
          !!rsvp?.respondedByUserId && rsvp.respondedByUserId !== tp.player.userId,
        viaLink: rsvp?.source === EventRsvpSource.GUEST_LINK,
        travelMode:
          event.type === EventType.MATCH && rsvp?.status === EventRsvpStatus.GOING
            ? rsvp.travelMode
            : null,
        isMe: isPersona(tp),
      };
    });
  }

  // Which roster row is « me »: the persona's when acting for someone (after
  // checking the caller may), the caller's own otherwise.
  private async personaMatcher(
    userId: string,
    forPlayerId?: string,
  ): Promise<(tp: { playerId: string; player: { userId: string | null } }) => boolean> {
    if (!forPlayerId) {
      return (tp) => tp.player.userId === userId;
    }
    await assertCanActForPlayer(this.prisma, userId, forPlayerId);
    return (tp) => tp.playerId === forPlayerId;
  }

  // Full replace: every id in teamPlayerIds ends up convoked, every other
  // roster member on this event ends up not convoked — a coach fills out
  // the whole call-up list in one submit rather than toggling players one
  // at a time. An empty array clears the list back to nobody. Independent
  // of EventRsvp — never reads or writes RSVP state.
  async setEventConvocations(
    clubId: string,
    teamId: string,
    eventId: string,
    teamPlayerIds: string[],
    userId: string,
  ): Promise<EventConvocationRosterEntry[]> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);

    if (teamPlayerIds.length > 0) {
      const rosterCount = await this.prisma.teamPlayer.count({
        where: { id: { in: teamPlayerIds }, teamId },
      });
      if (rosterCount !== teamPlayerIds.length) {
        throw new BadRequestException(
          "Un ou plusieurs joueurs ne font pas partie de l'effectif de cette équipe",
        );
      }
    }

    // Read the current list *and* perform the replace inside one
    // Serializable transaction, so two near-simultaneous PATCHes (a
    // double-click, a client retry) can't both read the same
    // pre-existing list before either commits and both fire
    // notifications for the same "newly convoked" players. Postgres
    // aborts the loser of the race with a serialization failure rather
    // than letting it commit against data that shifted under it, and
    // runSerializableTransaction retries that loser transparently — a
    // genuine double-click still succeeds once (rather than 500ing) and
    // still ends up notifying each newly-convoked player exactly once.
    // Without this, the read-before-transaction shape let both requests
    // diff against the same stale "already convoked" set.
    const newlyConvokedIds = await this.runSerializableTransaction(async (tx) => {
      const alreadyConvoked = new Set(
        (
          await tx.eventConvocation.findMany({
            where: { eventId },
            select: { teamPlayerId: true },
          })
        ).map((row) => row.teamPlayerId),
      );

      await tx.eventConvocation.deleteMany({
        where: { eventId, teamPlayerId: { notIn: teamPlayerIds } },
      });
      for (const teamPlayerId of teamPlayerIds) {
        await tx.eventConvocation.upsert({
          where: { eventId_teamPlayerId: { eventId, teamPlayerId } },
          create: { eventId, teamPlayerId },
          update: {},
        });
      }

      return teamPlayerIds.filter((id) => !alreadyConvoked.has(id));
    });

    await this.notifyNewlyConvoked(clubId, teamId, event, newlyConvokedIds);

    // No re-assertEventInTeam here — already verified above in this same
    // call, unlike listEventConvocations's own public entry point.
    return this.fetchConvocationRoster(teamId, eventId, userId);
  }

  // Notifying is a side effect of the convocation, never a precondition for
  // it: NotificationsService.notify only awaits the in-app row write and
  // hands e-mail/push off to a fire-and-forget path of its own, so a mail or
  // push outage can't roll back a call-up a manager has already made.
  private async notifyNewlyConvoked(
    clubId: string,
    teamId: string,
    event: EventRow,
    newlyConvokedTeamPlayerIds: string[],
  ): Promise<void> {
    if (newlyConvokedTeamPlayerIds.length === 0) return;

    const [team, audience] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }),
      resolvePlayerAudience(this.prisma, newlyConvokedTeamPlayerIds),
    ]);

    // Each convoked player's own account (if they ever claimed one — a
    // player who hasn't has no userId, the dashboard's PLAYERS_WITHOUT_ACCOUNT
    // item) plus every guardian, merged so a parent convoked alongside their
    // child, or a parent of two convoked children, gets one message.
    const recipients = groupByRecipient(audience);
    if (recipients.length === 0) return;

    const plan = (await this.meetingPoints.resolvePlans(teamId, [event])).get(event.id);
    const meeting =
      plan?.meetingPoint && plan.meetsAt
        ? { meetsAt: new Date(plan.meetsAt), placeName: plan.meetingPoint.name }
        : null;
    const teamName = team?.name ?? 'votre équipe';
    await this.notifications.notify(
      recipients.map((recipient) => {
        const copy = convocationNotification(teamName, event, meeting, recipient);
        return {
          userId: recipient.userId,
          type: 'EVENT_CONVOCATION' as const,
          title: copy.title,
          body: copy.body,
          subjectFirstName: subjectLabel(recipient),
          deepLink: recipientDeepLink(
            recipient,
            `/clubs/${clubId}/teams/${teamId}/events/${event.id}`,
            (childClubId) => `/clubs/${childClubId}/teams/${teamId}/events/${event.id}`,
          ),
        };
      }),
    );
  }

  // Full roster (not just convoked players) so a manager sees who they
  // haven't picked yet — same shape as listEventRsvps.
  async listEventConvocations(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    forPlayerId?: string,
  ): Promise<EventConvocationRosterEntry[]> {
    await this.assertEventInTeam(clubId, teamId, eventId);
    return this.fetchConvocationRoster(teamId, eventId, userId, forPlayerId);
  }

  // Self-service: any rostered member may assign themself or clear their
  // own assignment. Assigning or clearing SOMEONE ELSE requires the same
  // manager check TeamManagerGuard already encodes (club ADMIN of a linked
  // club, or TeamAdmin of this team) — reused via the guard's own
  // isTeamManager method rather than duplicated here. Valid for both event
  // types — a TRAINING event uses the same slots for scrimmage bibs
  // ("Chasubles") instead of match jerseys ("Maillots"), see
  // eventLogisticsFieldLabel on the frontend; the ball slot is identical
  // copy for both. No event.type gate here on purpose — except the jersey slot
  // of a MATCH of a team with the wash rotation on, which is the duty routes'
  // (JerseyDutyController) and answers USE_JERSEY_DUTY here.
  async setEventLogistics(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    field: EventLogisticsField,
    teamPlayerId: string | null,
  ): Promise<TeamEvent> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    if (field === 'JERSEYS' && event.type === EventType.MATCH) {
      const team = await this.prisma.team.findUniqueOrThrow({
        where: { id: teamId },
        select: { jerseyRotationEnabled: true },
      });
      if (team.jerseyRotationEnabled) {
        throw new BadRequestException({
          message: "Le lavage des maillots d'un match se gère depuis le roulement de lavage",
          code: JERSEY_DUTY_ERROR_CODES.USE_JERSEY_DUTY,
        });
      }
    }
    const myTeamPlayer = await this.findMyTeamPlayer(teamId, userId);
    const currentValue = field === 'JERSEYS' ? event.jerseysTeamPlayerId : event.ballsTeamPlayerId;

    const isSelfAction = teamPlayerId
      ? teamPlayerId === myTeamPlayer?.id
      : currentValue === myTeamPlayer?.id;
    if (!isSelfAction && !(await this.teamManagerGuard.isTeamManager(clubId, teamId, userId))) {
      throw new ForbiddenException("Vous ne pouvez pas modifier l'affectation d'un·e autre membre");
    }
    if (teamPlayerId) {
      const onRoster = await this.prisma.teamPlayer.findFirst({
        where: { id: teamPlayerId, teamId },
      });
      if (!onRoster) {
        throw new BadRequestException("Ce membre n'est pas inscrit sur l'effectif de cette équipe");
      }
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data:
        field === 'JERSEYS'
          ? { jerseysTeamPlayerId: teamPlayerId }
          : { ballsTeamPlayerId: teamPlayerId },
    });
    const [teamEvent] = await this.buildTeamEventsForUser(clubId, teamId, userId, [updated]);
    return teamEvent;
  }

  // Anonymous peer voting — see the vote rules in
  // docs/decisions/events.md. Hard server-side window: opens VOTE_OPEN_DELAY_MS (common/vote-window.ts) after kickoff
  // (players are still on court right at the whistle) and closes
  // VOTE_CLOSE_DELAY_MS after kickoff, both enforced here, not just
  // client-displayed. Only a roster member both marked GOING on this event's
  // RSVP AND convoked for it may vote — you have to have actually been
  // called up and shown up. Upserts on recast (the unique index on
  // eventId/category/voterTeamPlayerId doubles as the upsert key), so
  // changing your vote updates the one row rather than accumulating history.
  async castVote(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    category: EventVoteCategory,
    votedTeamPlayerId: string,
  ): Promise<EventVoteResults> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    if (event.type !== EventType.MATCH) {
      throw new BadRequestException('Le vote ne concerne que les matchs');
    }
    const now = new Date();
    if (now < voteOpensAt(event.startsAt)) {
      throw new BadRequestException('Le vote ouvre 1h après le début du match');
    }
    if (now > voteClosesAt(event.startsAt)) {
      throw new BadRequestException('Le vote est fermé pour ce match');
    }
    const myTeamPlayer = await this.findMyTeamPlayer(teamId, userId);
    if (!myTeamPlayer) {
      throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
    }
    const [myRsvp, wasConvoked] = await Promise.all([
      this.prisma.eventRsvp.findUnique({
        where: { eventId_teamPlayerId: { eventId, teamPlayerId: myTeamPlayer.id } },
      }),
      this.isConvoked(eventId, myTeamPlayer.id),
    ]);
    if (myRsvp?.status !== EventRsvpStatus.GOING || !wasConvoked) {
      throw new ForbiddenException(
        'Seuls les joueurs convoqués et présents au match peuvent voter',
      );
    }
    if (votedTeamPlayerId === myTeamPlayer.id) {
      throw new BadRequestException('Vous ne pouvez pas voter pour vous-même');
    }
    const onRoster = await this.prisma.teamPlayer.findFirst({
      where: { id: votedTeamPlayerId, teamId },
    });
    if (!onRoster) {
      throw new BadRequestException("Ce membre n'est pas inscrit sur l'effectif de cette équipe");
    }

    await this.prisma.eventVote.upsert({
      where: {
        eventId_category_voterTeamPlayerId: {
          eventId,
          category,
          voterTeamPlayerId: myTeamPlayer.id,
        },
      },
      create: { eventId, category, voterTeamPlayerId: myTeamPlayer.id, votedTeamPlayerId },
      update: { votedTeamPlayerId },
    });
    return this.getEventVoteResults(clubId, teamId, eventId, userId);
  }

  async getEventVoteResults(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    hideMyVote = false,
  ): Promise<EventVoteResults> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    if (event.type !== EventType.MATCH) {
      throw new BadRequestException('Le vote ne concerne que les matchs');
    }
    const voteHasEnded = new Date() > voteClosesAt(event.startsAt);
    const [myTeamPlayer, votes, rosterSize] = await Promise.all([
      this.findMyTeamPlayer(teamId, userId),
      this.prisma.eventVote.findMany({
        where: { eventId },
        include: { votedFor: { include: { player: true } } },
      }),
      this.prisma.teamPlayer.count({ where: { teamId } }),
    ]);
    return this.buildVoteResults(
      votes,
      myTeamPlayer?.id ?? null,
      rosterSize,
      voteHasEnded,
      hideMyVote,
    );
  }

  // Groups the event's votes by category, counts per votedTeamPlayerId, and
  // sorts each category's leaderboard descending — never returns
  // voterTeamPlayerId (see EventVote's schema comment: this is the one field
  // in this whole feature that would be a real privacy regression if leaked).
  // The leaderboards themselves are withheld (empty arrays) until either the
  // caller has cast their own BEST vote ("vote to see results") or the vote
  // window has closed, at which point results become public to everyone
  // regardless of whether they voted — totalVoters/votesCast stay visible
  // throughout so the UI can show "N votes exprimés" even while withheld.
  private buildVoteResults(
    votes: {
      category: EventVoteCategory;
      voterTeamPlayerId: string;
      votedTeamPlayerId: string;
      votedFor: { player: { firstName: string; lastName: string } };
    }[],
    myTeamPlayerId: string | null,
    totalVoters: number,
    voteHasEnded: boolean,
    hideMyVote: boolean,
  ): EventVoteResults {
    const buildCategoryResults = (category: EventVoteCategory): EventVoteCandidateResult[] => {
      const counts = new Map<string, EventVoteCandidateResult>();
      for (const vote of votes) {
        if (vote.category !== category) {
          continue;
        }
        const existing = counts.get(vote.votedTeamPlayerId);
        if (existing) {
          existing.voteCount += 1;
        } else {
          counts.set(vote.votedTeamPlayerId, {
            teamPlayerId: vote.votedTeamPlayerId,
            firstName: vote.votedFor.player.firstName,
            lastName: vote.votedFor.player.lastName,
            voteCount: 1,
          });
        }
      }
      // Descending by voteCount; ties broken alphabetically (lastName, then
      // firstName) so a real tie's *order* is at least deterministic and
      // reproducible across requests — the incoming `votes` array carries no
      // orderBy of its own, so without this a tie's order would depend on
      // undocumented DB row order. This doesn't resolve who's "really"
      // first (nothing can), it just keeps the tied group stable — the
      // frontend (computeRanks/countTiedAtTop, app/src/clubs/voteTies.ts)
      // is what actually displays the tie.
      return Array.from(counts.values()).sort(
        (a, b) =>
          b.voteCount - a.voteCount ||
          a.lastName.localeCompare(b.lastName, 'fr') ||
          a.firstName.localeCompare(b.firstName, 'fr'),
      );
    };

    const myVoteFor = (category: EventVoteCategory): string | null =>
      votes.find((v) => v.category === category && v.voterTeamPlayerId === myTeamPlayerId)
        ?.votedTeamPlayerId ?? null;

    const myVote = {
      best: myVoteFor(EventVoteCategory.BEST),
      worst: myVoteFor(EventVoteCategory.WORST),
    };
    const showResults = voteHasEnded || myVote.best !== null;
    const distinctVoters = new Set(votes.map((v) => v.voterTeamPlayerId));

    return {
      best: showResults ? buildCategoryResults(EventVoteCategory.BEST) : [],
      worst: showResults ? buildCategoryResults(EventVoteCategory.WORST) : [],
      totalVoters,
      votesCast: distinctVoters.size,
      // Masked after showResults is decided, so the subject's screen keeps its
      // real shape (leaderboard visible once they voted) without saying whom.
      myVote: hideMyVote ? { best: null, worst: null } : myVote,
      myVoteHidden: hideMyVote,
    };
  }

  // Any rostered member (not manager-only) may capture the scoresheet —
  // practically, whoever's still at the gym after the game, not necessarily
  // the coach — same self-service framing as RSVP. The storageKey embeds
  // the event id so objects are scoped/collision-proof without a lookup,
  // and a fresh uuid per attempt so a retried upload never overwrites an
  // in-flight one at the same key. Named storageKey (not r2Key) so this
  // stays meaningful if the backing object store ever changes.
  async getScoresheetUploadUrl(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    contentType: string,
  ): Promise<EventScoresheetUploadUrlResponse> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    if (event.type !== EventType.MATCH) {
      throw new BadRequestException('La feuille de match ne concerne que les matchs');
    }
    const myTeamPlayer = await this.findMyTeamPlayer(teamId, userId);
    if (!myTeamPlayer) {
      throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
    }
    const extension = SCORESHEET_CONTENT_TYPE_EXTENSIONS[contentType];
    if (!extension) {
      throw new BadRequestException('Format de fichier non supporté');
    }
    const storageKey = `scoresheets/${eventId}/${randomUUID()}.${extension}`;
    const uploadUrl = await this.storage.getUploadUrl(storageKey, contentType);
    return { uploadUrl, storageKey };
  }

  // Confirms a completed direct-to-R2 upload and records it. @@unique on
  // eventId means a retry or a better file upserts this one row rather than
  // accumulating history — v1 doesn't need scoresheet-file versioning. The
  // previous row's object (if any, and if this call actually changed the
  // key — a retried confirm with the same key is a no-op here) is deleted
  // from R2 afterward so a replace/retry doesn't leave the old file
  // orphaned in the bucket forever.
  async confirmScoresheetUpload(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    storageKey: string,
  ): Promise<EventScoresheet> {
    await this.assertEventInTeam(clubId, teamId, eventId);
    const myTeamPlayer = await this.findMyTeamPlayer(teamId, userId);
    if (!myTeamPlayer) {
      throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
    }
    const previous = await this.prisma.eventScoresheet.findUnique({ where: { eventId } });
    const scoresheet = await this.prisma.eventScoresheet.upsert({
      where: { eventId },
      create: { eventId, storageKey, uploadedByTeamPlayerId: myTeamPlayer.id },
      update: {
        storageKey,
        uploadedByTeamPlayerId: myTeamPlayer.id,
        uploadedAt: new Date(),
        status: 'UPLOADED',
      },
    });
    if (previous && previous.storageKey !== storageKey) {
      await this.deleteStorageObjectSafely(previous.storageKey);
    }
    // Hand off to the scoresheets module's async OCR pipeline now that a
    // real upload exists — this call sets status to QUEUED, overwriting the
    // 'UPLOADED' just written above.
    await this.scoresheets.enqueueOcr(scoresheet.id);
    return this.toEventScoresheet({ ...scoresheet, status: 'QUEUED' });
  }

  // Best-effort: the DB write has already succeeded by the time this runs,
  // so a storage-delete failure here must never surface as an error to the
  // caller — it just means one orphaned object left in the bucket, not a
  // broken upload.
  private async deleteStorageObjectSafely(storageKey: string): Promise<void> {
    try {
      await this.storage.deleteObject(storageKey);
    } catch {
      // Swallowed on purpose — see comment above.
    }
  }

  async getScoresheetStatus(
    clubId: string,
    teamId: string,
    eventId: string,
  ): Promise<EventScoresheet | null> {
    await this.assertEventInTeam(clubId, teamId, eventId);
    const scoresheet = await this.prisma.eventScoresheet.findUnique({ where: { eventId } });
    return scoresheet ? this.toEventScoresheet(scoresheet) : null;
  }

  // Deliberately omits storageKey/id — the file isn't displayed anywhere in
  // this slice, only captured, so the frontend never needs a way to address it.
  private toEventScoresheet(scoresheet: {
    status: string;
    uploadedByTeamPlayerId: string | null;
    uploadedAt: Date;
  }): EventScoresheet {
    return {
      status: scoresheet.status as EventScoresheet['status'],
      uploadedByTeamPlayerId: scoresheet.uploadedByTeamPlayerId,
      uploadedAt: scoresheet.uploadedAt.toISOString(),
    };
  }

  private async fetchConvocationRoster(
    teamId: string,
    eventId: string,
    userId: string,
    forPlayerId?: string,
  ): Promise<EventConvocationRosterEntry[]> {
    const isPersona = await this.personaMatcher(userId, forPlayerId);
    const roster = await this.prisma.teamPlayer.findMany({
      where: { teamId },
      include: { player: true, convocations: { where: { eventId } } },
      orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
    });
    return roster.map((tp) => ({
      teamPlayerId: tp.id,
      playerId: tp.playerId,
      firstName: tp.player.firstName,
      lastName: tp.player.lastName,
      role: tp.role,
      convoked: tp.convocations.length > 0,
      convokedAt: tp.convocations[0]?.convokedAt.toISOString() ?? null,
      isMe: isPersona(tp),
    }));
  }

  // Resolves the display name for every distinct non-null jersey/ball
  // assignee across a batch of events in one query, rather than one lookup
  // per event — same batching shape as resolveMyEventState above.
  private async resolveLogisticsAssignees(
    events: Pick<EventRow, 'jerseysTeamPlayerId' | 'ballsTeamPlayerId'>[],
  ): Promise<Map<string, EventLogisticsAssignee>> {
    const teamPlayerIds = new Set<string>();
    for (const event of events) {
      if (event.jerseysTeamPlayerId) {
        teamPlayerIds.add(event.jerseysTeamPlayerId);
      }
      if (event.ballsTeamPlayerId) {
        teamPlayerIds.add(event.ballsTeamPlayerId);
      }
    }
    if (teamPlayerIds.size === 0) {
      return new Map();
    }
    const teamPlayers = await this.prisma.teamPlayer.findMany({
      where: { id: { in: Array.from(teamPlayerIds) } },
      include: { player: true },
    });
    return new Map(
      teamPlayers.map((tp) => [
        tp.id,
        { teamPlayerId: tp.id, firstName: tp.player.firstName, lastName: tp.player.lastName },
      ]),
    );
  }

  private async findMyTeamPlayer(teamId: string, userId: string) {
    return resolveActingTeamPlayer(this.prisma, { userId, teamId });
  }

  private async isConvoked(eventId: string, teamPlayerId: string): Promise<boolean> {
    const convocation = await this.prisma.eventConvocation.findUnique({
      where: { eventId_teamPlayerId: { eventId, teamPlayerId } },
    });
    return convocation !== null;
  }

  // Resolves the persona's RSVP status (and who gave it) and convocation flag
  // for a bounded set of events on one team, in at most three queries total
  // (one resolveActingTeamPlayer shared by both, plus one findMany per concern)
  // regardless of how many event ids are passed — never one query per event
  // (docs/decisions/events.md: no per-event aggregate embedded in TeamEvent).
  private async resolveMyEventState(
    teamId: string,
    userId: string,
    eventIds: string[],
    forPlayerId?: string,
  ): Promise<CallerEventState> {
    const nobody: CallerEventState = {
      rsvpStatuses: new Map(),
      answers: new Map(),
      travelModes: new Map(),
      convokedEventIds: new Set(),
      myTeamPlayerId: null,
    };
    if (eventIds.length === 0) return nobody;
    const teamPlayer = await resolveActingTeamPlayer(this.prisma, {
      userId,
      teamId,
      forPlayerId,
    });
    if (!teamPlayer) return nobody;
    const [rsvps, convocations] = await Promise.all([
      this.prisma.eventRsvp.findMany({
        where: { teamPlayerId: teamPlayer.id, eventId: { in: eventIds } },
        include: { respondedBy: RSVP_RESPONDENT_SELECT },
      }),
      this.prisma.eventConvocation.findMany({
        where: { teamPlayerId: teamPlayer.id, eventId: { in: eventIds } },
      }),
    ]);
    return {
      rsvpStatuses: new Map(rsvps.map((r) => [r.eventId, r.status])),
      answers: new Map(
        rsvps.map((r) => [
          r.eventId,
          { respondedAt: r.respondedAt, respondedBy: toRsvpRespondent(r.respondedBy, userId) },
        ]),
      ),
      travelModes: new Map(rsvps.map((r) => [r.eventId, r.travelMode])),
      convokedEventIds: new Set(convocations.map((c) => c.eventId)),
      myTeamPlayerId: teamPlayer.id,
    };
  }

  // Resolves the whole roster's RSVP/convocation aggregate for a bounded set
  // of events on one team, in at most three queries total (one
  // teamPlayer.count shared by every event on this team — they all belong
  // to the same team, so one roster size answers for all of them — plus one
  // findMany per concern) regardless of how many event ids are passed.
  // Sibling to resolveMyEventState above, not a replacement: that helper
  // resolves the caller's own RSVP/convocation state, this resolves the
  // whole roster's aggregate. See computeEventRsvpSummaries for the
  // per-event math, ported from app/src/clubs/useEventRoster.ts's
  // countEventRoster.
  private async resolveEventRosterSummaries(
    teamId: string,
    eventIds: string[],
  ): Promise<Map<string, EventRsvpSummary>> {
    if (eventIds.length === 0) {
      return new Map();
    }
    const [rosterSize, rsvps, convocations] = await Promise.all([
      this.prisma.teamPlayer.count({ where: { teamId } }),
      this.prisma.eventRsvp.findMany({
        where: { eventId: { in: eventIds } },
        select: { eventId: true, teamPlayerId: true, status: true },
      }),
      this.prisma.eventConvocation.findMany({
        where: { eventId: { in: eventIds } },
        select: { eventId: true, teamPlayerId: true },
      }),
    ]);
    const rosterSizeByEventId = new Map(eventIds.map((id) => [id, rosterSize]));
    return computeEventRsvpSummaries(eventIds, rosterSizeByEventId, rsvps, convocations);
  }

  // Resolves the projected match result and the caller's own per-match line
  // for a bounded set of events on one team, in at most two queries total
  // (one eventScoresheet.findMany scoped to CONFIRMED sheets, plus one
  // matchPlayerStat.findMany — skipped entirely when the caller isn't
  // rostered) regardless of how many event ids are passed. Takes an
  // already-resolved myTeamPlayerId rather than re-deriving it via
  // findMyTeamPlayer: every call site already resolves the caller's
  // TeamPlayer for this team (resolveMyEventState, or the RSVP/logistics
  // write's own lookup) — re-querying it here would silently regress the
  // per-request bounded-query property those call sites already guarantee
  // and their specs already assert.
  //
  // A player must never see an unconfirmed score (CLAUDE.md, Scoresheets
  // module) — only CONFIRMED sheets are read here, and parsedData is never
  // trusted directly: deriveMatchResult still checks it via
  // asParsedScoresheetData/the venue it's given. TRAINING events and
  // MATCHes with no confirmed sheet simply have no scoresheet row and never
  // populate the maps.
  private async resolveMatchResults(
    events: Pick<EventRow, 'id' | 'venue'>[],
    myTeamPlayerId: string | null,
  ): Promise<{
    resultsByEventId: Map<string, EventMatchResult>;
    myStatsByEventId: Map<string, EventMatchPlayerStats>;
  }> {
    const eventIds = events.map((e) => e.id);
    if (eventIds.length === 0) {
      return { resultsByEventId: new Map(), myStatsByEventId: new Map() };
    }
    const venueByEventId = new Map(events.map((e) => [e.id, e.venue]));
    const confirmedScoresheets = await this.prisma.eventScoresheet.findMany({
      where: { eventId: { in: eventIds }, status: 'CONFIRMED' },
      include: { extraction: true },
    });

    const resultsByEventId = new Map<string, EventMatchResult>();
    for (const scoresheet of confirmedScoresheets) {
      const parsedData = asParsedScoresheetData(scoresheet.extraction?.parsedData);
      const result = deriveMatchResult(venueByEventId.get(scoresheet.eventId) ?? null, parsedData);
      if (result) {
        resultsByEventId.set(scoresheet.eventId, result);
      }
    }

    const myStatsByEventId = new Map<string, EventMatchPlayerStats>();
    if (myTeamPlayerId) {
      const myStats = await this.prisma.matchPlayerStat.findMany({
        where: { eventId: { in: eventIds }, teamPlayerId: myTeamPlayerId },
      });
      for (const stat of myStats) {
        myStatsByEventId.set(stat.eventId, { points: stat.points, fouls: stat.fouls });
      }
    }

    return { resultsByEventId, myStatsByEventId };
  }

  // resolveEventRosterSummaries always populates an entry for every id it's
  // given (see its eventIds.length === 0 short-circuit above) — this just
  // spares every call site a non-null assertion for a case that can't
  // happen, falling back to an all-zero summary if it somehow did.
  private rsvpSummaryOrZero(
    eventId: string,
    summaries: Map<string, EventRsvpSummary>,
  ): EventRsvpSummary {
    return (
      summaries.get(eventId) ?? {
        rosterSize: 0,
        convoked: 0,
        answering: 0,
        going: 0,
        maybe: 0,
        notGoing: 0,
        pending: 0,
        isConvocationScoped: false,
      }
    );
  }

  // Resolves the set of event ids a THIS_AND_FUTURE/ALL scope applies to:
  // every row sharing the target event's recurrenceId, additionally bounded
  // to startsAt >= the target's own startsAt for THIS_AND_FUTURE.
  private async resolveScopeIds(
    teamId: string,
    event: { recurrenceId: string | null; startsAt: Date },
    scope: EventUpdateScope,
  ): Promise<string[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        teamId,
        recurrenceId: event.recurrenceId,
        ...(scope === 'THIS_AND_FUTURE' ? { startsAt: { gte: event.startsAt } } : {}),
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Team not found');
    }
  }

  // Re-verifies both that the team belongs to clubId and that the event
  // belongs to that team, so an admin of club A can't mutate an event that
  // lives on a team not linked to their club. Returns the row (rather than
  // just confirming it exists) since callers need its type/opponentName/
  // recurrenceId/startsAt to validate and resolve scope.
  private async assertEventInTeam(
    clubId: string,
    teamId: string,
    eventId: string,
  ): Promise<EventRow> {
    await this.assertTeamInClub(clubId, teamId);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.teamId !== teamId) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  // Assembles the TeamEvents for a batch of events on one team. Every
  // per-event concern is resolved once for the whole batch — never per event
  // — and the independent resolvers run in parallel. Callers that already
  // know the caller's own RSVP state from the write they just made pass it
  // in rather than re-reading it (see setMyRsvp).
  private async buildTeamEvents(
    teamId: string,
    events: EventRow[],
    caller: CallerEventState,
    // Set for a caller who may see the WhatsApp reminder (a team manager, not
    // acting for a child); null resolves both WhatsApp fields to null.
    whatsApp: { userId: string } | null = null,
  ): Promise<TeamEvent[]> {
    const eventIds = events.map((e) => e.id);
    const [
      logisticsAssignees,
      rsvpSummaries,
      { resultsByEventId, myStatsByEventId },
      plans,
      whatsAppView,
      jerseyDuties,
    ] = await Promise.all([
      this.resolveLogisticsAssignees(events),
      this.resolveEventRosterSummaries(teamId, eventIds),
      this.resolveMatchResults(events, caller.myTeamPlayerId),
      this.meetingPoints.resolvePlans(teamId, events),
      this.resolveWhatsAppView(teamId, events, whatsApp?.userId ?? null),
      this.jerseyDuty.resolveSummaries(teamId, events, caller.myTeamPlayerId),
    ]);
    return events.map((event) =>
      this.toTeamEvent({
        event,
        myRsvpStatus: caller.rsvpStatuses.get(event.id) ?? null,
        answer: caller.answers.get(event.id) ?? null,
        travelMode: caller.travelModes.get(event.id) ?? null,
        myConvocation: caller.convokedEventIds.has(event.id),
        logisticsAssignees,
        rsvpSummary: this.rsvpSummaryOrZero(event.id, rsvpSummaries),
        result: resultsByEventId.get(event.id) ?? null,
        myMatchStats: myStatsByEventId.get(event.id) ?? null,
        meetingPlan: plans.get(event.id) ?? null,
        jerseyDuty: jerseyDuties.get(event.id) ?? null,
        whatsAppShare: whatsAppView?.shares.get(event.id) ?? null,
        whatsAppSettings: whatsAppView ? whatsAppView.settings(event) : null,
      }),
    );
  }

  private async buildTeamEventsForUser(
    clubId: string,
    teamId: string,
    userId: string,
    events: EventRow[],
    forPlayerId?: string,
  ): Promise<TeamEvent[]> {
    const [caller, isManager] = await Promise.all([
      this.resolveMyEventState(
        teamId,
        userId,
        events.map((e) => e.id),
        forPlayerId,
      ),
      // A guardian acting for a child reads the child's page, never the manager's.
      forPlayerId ? false : this.teamManagerGuard.isTeamManager(clubId, teamId, userId),
    ]);
    return this.buildTeamEvents(teamId, events, caller, isManager ? { userId } : null);
  }

  // The manager-only WhatsApp fields for a batch: one shares read and one team
  // read, however many events. Null for anyone who does not manage the team.
  private async resolveWhatsAppView(teamId: string, events: EventRow[], userId: string | null) {
    if (userId === null || events.length === 0) return null;
    const [shares, team] = await Promise.all([
      this.prisma.eventShare.findMany({
        where: { eventId: { in: events.map((e) => e.id) }, type: 'REMINDER' },
        include: { sentBy: RSVP_RESPONDENT_SELECT },
      }),
      this.prisma.team.findUniqueOrThrow({
        where: { id: teamId },
        select: { waReminderEnabled: true, waDefaultOffsetMinutes: true },
      }),
    ]);
    return {
      shares: new Map(
        shares.map((row) => [
          row.eventId,
          {
            type: row.type,
            state: row.state,
            dueAt: row.dueAt?.toISOString() ?? null,
            sentAt: row.sentAt?.toISOString() ?? null,
            sentBy: toRsvpRespondent(row.sentBy, userId),
            platform: row.platform,
          },
        ]),
      ),
      settings: (event: EventRow) => ({
        override: event.waReminderOverride,
        offsetMinutes: event.waOffsetMinutes,
        effective: resolveSettings(event, team),
      }),
    };
  }

  private toTeamEvent({
    event,
    myRsvpStatus,
    answer,
    travelMode,
    myConvocation,
    logisticsAssignees,
    rsvpSummary,
    result,
    myMatchStats,
    meetingPlan,
    jerseyDuty,
    whatsAppShare,
    whatsAppSettings,
  }: {
    event: EventRow;
    myRsvpStatus: EventRsvpStatus | null;
    answer: RsvpAnswerMeta | null;
    // The caller's stored choice; only surfaced for a MATCH they're GOING to.
    travelMode: EventTravelMode | null;
    myConvocation: boolean;
    logisticsAssignees: Map<string, EventLogisticsAssignee>;
    rsvpSummary: EventRsvpSummary;
    result: EventMatchResult | null;
    myMatchStats: EventMatchPlayerStats | null;
    meetingPlan: EventMeetingPlan | null;
    jerseyDuty: EventJerseyDutySummary | null;
    whatsAppShare: EventShareStatus | null;
    whatsAppSettings: EventWhatsAppSettings | null;
  }): TeamEvent {
    return {
      id: event.id,
      teamId: event.teamId,
      type: event.type,
      startsAt: event.startsAt.toISOString(),
      location: event.location,
      locationName: event.locationName,
      notes: event.notes,
      opponentName: event.opponentName,
      venue: event.venue,
      recurrenceId: event.recurrenceId,
      createdAt: event.createdAt.toISOString(),
      isImported: event.externalId !== null,
      timeConfirmed: event.timeConfirmed,
      myRsvpStatus,
      myRsvpRespondedBy: answer?.respondedBy ?? null,
      myRsvpRespondedAt: answer?.respondedAt.toISOString() ?? null,
      myConvocation,
      rsvpSummary,
      result,
      myMatchStats,
      meetingPlan,
      jerseyDuty,
      whatsAppShare,
      whatsAppSettings,
      myTravelMode:
        event.type === EventType.MATCH && myRsvpStatus === EventRsvpStatus.GOING
          ? (travelMode ?? EventTravelMode.MEETING_POINT)
          : null,
      // Populated for both event types, except the jersey slot of a MATCH of a
      // team with the wash rotation on: that duty is `jerseyDuty`, and a value
      // set while the rotation was off must not show beside it. The slot is
      // labeled « Chasubles » for a TRAINING on the frontend.
      logistics: {
        jerseys:
          event.jerseysTeamPlayerId && jerseyDuty === null
            ? (logisticsAssignees.get(event.jerseysTeamPlayerId) ?? null)
            : null,
        balls: event.ballsTeamPlayerId
          ? (logisticsAssignees.get(event.ballsTeamPlayerId) ?? null)
          : null,
      },
    };
  }
}
