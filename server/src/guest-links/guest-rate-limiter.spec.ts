import { HttpException } from '@nestjs/common';
import {
  GUEST_INVITE_REQUESTS_PER_TOKEN,
  GUEST_WRITES_PER_TOKEN,
  GUEST_WRITES_PER_TOKEN_AND_IP,
  GuestRateLimiter,
} from './guest-rate-limiter';

describe('GuestRateLimiter', () => {
  it('refuses the write after the per token + IP budget with a 429', () => {
    const limiter = new GuestRateLimiter();
    for (let i = 0; i < GUEST_WRITES_PER_TOKEN_AND_IP; i++) limiter.consumeIp('tok', '1.1.1.1', 0);

    expect(() => limiter.consumeIp('tok', '1.1.1.1', 1)).toThrow(HttpException);
    try {
      limiter.consumeIp('tok', '1.1.1.1', 1);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });

  it('does not let one IP spend another IP budget', () => {
    const limiter = new GuestRateLimiter();
    for (let i = 0; i < GUEST_WRITES_PER_TOKEN_AND_IP; i++) limiter.consumeIp('tok', '1.1.1.1', 0);

    expect(() => limiter.consumeIp('tok', '2.2.2.2', 1)).not.toThrow();
  });

  it('frees the per IP budget after ten minutes', () => {
    const limiter = new GuestRateLimiter();
    for (let i = 0; i < GUEST_WRITES_PER_TOKEN_AND_IP; i++) limiter.consumeIp('tok', '1.1.1.1', 0);

    expect(() => limiter.consumeIp('tok', '1.1.1.1', 10 * 60 * 1000 + 1)).not.toThrow();
  });

  it('caps a token across all IPs per hour, for charged writes only', () => {
    const limiter = new GuestRateLimiter();
    for (let i = 0; i < GUEST_WRITES_PER_TOKEN; i++) limiter.chargeToken('tok', i);

    expect(() => limiter.chargeToken('tok', GUEST_WRITES_PER_TOKEN)).toThrow(HttpException);
  });

  it('lets one visitor spam junk without touching the team budget', () => {
    const limiter = new GuestRateLimiter();
    for (let i = 0; i < GUEST_WRITES_PER_TOKEN_AND_IP; i++) limiter.consumeIp('tok', '1.1.1.1', 0);

    expect(() => limiter.consumeIp('tok', '1.1.1.1', 1)).toThrow(HttpException);
    expect(() => limiter.chargeToken('tok', 1)).not.toThrow();
    expect(() => limiter.consumeIp('tok', '2.2.2.2', 1)).not.toThrow();
  });

  it('keeps invite requests on their own smaller budget', () => {
    const limiter = new GuestRateLimiter();
    for (let i = 0; i < GUEST_INVITE_REQUESTS_PER_TOKEN; i++) limiter.chargeInviteRequest('tok', i);

    expect(() => limiter.chargeInviteRequest('tok', 1000)).toThrow(HttpException);
    expect(() => limiter.chargeToken('tok', 1000)).not.toThrow();
  });

  it('keeps tokens apart', () => {
    const limiter = new GuestRateLimiter();
    for (let i = 0; i < GUEST_WRITES_PER_TOKEN_AND_IP; i++) limiter.consumeIp('a', '1.1.1.1', 0);

    expect(() => limiter.consumeIp('b', '1.1.1.1', 1)).not.toThrow();
  });
});
