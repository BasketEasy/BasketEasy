import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const GUEST_WRITES_PER_TOKEN_AND_IP = 30; // per 10 minutes
export const GUEST_WRITES_PER_TOKEN = 300; // per hour

/**
 * Bounds guest writes: generous for a family answering for three children,
 * tight for a script. In memory per instance — the same shape as
 * LastActiveInterceptor, deliberately no Redis dependency for a public
 * endpoint. The IP never leaves this map, so it is never stored.
 */
@Injectable()
export class GuestRateLimiter {
  private readonly hits = new Map<string, number[]>();

  /** Records a write and throws 429 when it would exceed either budget. */
  consume(token: string, ip: string | undefined, now = Date.now()): void {
    const perIpKey = `${token}|${ip ?? 'unknown'}`;
    const perIp = this.recent(perIpKey, now - TEN_MINUTES_MS);
    const perToken = this.recent(token, now - HOUR_MS);
    if (
      perIp.length >= GUEST_WRITES_PER_TOKEN_AND_IP ||
      perToken.length >= GUEST_WRITES_PER_TOKEN
    ) {
      throw new HttpException(
        'Trop de réponses en peu de temps. Réessayez dans quelques minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    perIp.push(now);
    perToken.push(now);
    this.hits.set(perIpKey, perIp);
    this.hits.set(token, perToken);
    if (this.hits.size > 10_000) this.prune(now);
  }

  private recent(key: string, since: number): number[] {
    return (this.hits.get(key) ?? []).filter((t) => t > since);
  }

  private prune(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((t) => t <= now - HOUR_MS)) this.hits.delete(key);
    }
  }
}
