import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const GUEST_WRITES_PER_TOKEN_AND_IP = 30; // per 10 minutes, every request counts
export const GUEST_WRITES_PER_TOKEN = 300; // per hour, valid writes only
export const GUEST_INVITE_REQUESTS_PER_TOKEN = 30; // per hour, valid requests only

/**
 * Bounds guest writes: generous for a family answering for three children,
 * tight for a script. In memory per instance — the same shape as
 * LastActiveInterceptor, deliberately no Redis dependency for a public
 * endpoint. The IP never leaves this map, so it is never stored.
 *
 * Two stages, so one visitor cannot lock the whole team out: `consumeIp` runs
 * first and counts every request (junk included), but only against that
 * visitor's own address; `chargeToken` runs once a request has passed
 * validation, so the shared per-token budget is only spent by real writes.
 *
 * Per-IP buckets are only meaningful when `TRUSTED_PROXY` is set behind a
 * reverse proxy — otherwise every guest shares the proxy's address.
 */
@Injectable()
export class GuestRateLimiter {
  private readonly hits = new Map<string, number[]>();

  /** Counts a request against the visitor's own budget; throws 429 past it. */
  consumeIp(token: string, ip: string | undefined, now = Date.now()): void {
    const key = `${token}|${ip ?? 'unknown'}`;
    const perIp = this.recent(key, now - TEN_MINUTES_MS);
    if (perIp.length >= GUEST_WRITES_PER_TOKEN_AND_IP) this.refuse();
    perIp.push(now);
    this.hits.set(key, perIp);
    this.pruneIfLarge(now);
  }

  /** Charges the link's hourly budget for a write that passed validation. */
  chargeToken(token: string, now = Date.now()): void {
    this.charge(token, GUEST_WRITES_PER_TOKEN, now);
  }

  /** Smaller, separate budget for invite requests, which notify club admins. */
  chargeInviteRequest(token: string, now = Date.now()): void {
    this.charge(`invite|${token}`, GUEST_INVITE_REQUESTS_PER_TOKEN, now);
  }

  private charge(key: string, limit: number, now: number): void {
    const recent = this.recent(key, now - HOUR_MS);
    if (recent.length >= limit) this.refuse();
    recent.push(now);
    this.hits.set(key, recent);
    this.pruneIfLarge(now);
  }

  private refuse(): never {
    throw new HttpException(
      'Trop de réponses en peu de temps. Réessayez dans quelques minutes.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private pruneIfLarge(now: number): void {
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
