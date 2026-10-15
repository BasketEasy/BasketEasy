import { Injectable, Logger } from '@nestjs/common';

type Listener = (eventIds: string[]) => void | Promise<void>;

/**
 * « These events' resolved meeting may have changed », published by
 * MeetingPointsService and heard by whoever cares (today the WhatsApp update
 * prompts). It exists so meeting-points never imports its consumers: Events and
 * WhatsApp depend on it, never the reverse.
 *
 * In-process and fire-and-forget by design. The job that publishes runs on the
 * instance that changed the meeting, so a per-instance feed is enough, and a
 * listener's failure is logged, never thrown back into the publisher's save.
 */
@Injectable()
export class MeetingChangeFeed {
  private readonly logger = new Logger(MeetingChangeFeed.name);
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(eventIds: string[]): void {
    if (eventIds.length === 0) return;
    for (const listener of this.listeners) {
      try {
        void Promise.resolve(listener(eventIds)).catch((err: unknown) => this.logFailure(err));
      } catch (err) {
        this.logFailure(err);
      }
    }
  }

  private logFailure(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.warn(`A meeting change listener failed: ${message}`);
  }
}
