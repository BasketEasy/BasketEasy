import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MEETING_TRAVEL_QUEUE } from '../queue/queue.module';
import { MeetingPointsService, type MeetingTravelJobData } from './meeting-points.service';

/**
 * Thin by design — the computation lives in MeetingPointsService so the
 * synchronous « Recalculer » route runs exactly the same code. The limiter
 * keeps a club-wide default change (every upcoming match of every owned
 * team at once) under OpenRouteService's 40 requests/minute free tier; each
 * job makes at most one routing call and two (usually cached) geocodes.
 */
@Processor(MEETING_TRAVEL_QUEUE, { limiter: { max: 30, duration: 60_000 } })
export class MeetingTravelProcessor extends WorkerHost {
  constructor(private readonly meetingPoints: MeetingPointsService) {
    super();
  }

  async process(job: Job<MeetingTravelJobData>): Promise<void> {
    await this.meetingPoints.recomputeTravel(job.data.eventId);
  }
}
