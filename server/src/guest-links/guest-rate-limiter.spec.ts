import { HttpException } from '@nestjs/common';
import {
  GUEST_WRITES_PER_TOKEN,
  GUEST_WRITES_PER_TOKEN_AND_IP,
  GuestRateLimiter,
} from './guest-rate-limiter';

describe('GuestRateLimiter', () => {
  it('refuses the write after the per token + IP budget with a 429', () => {
    const limiter = new GuestRateLimiter();
    for (let i = 0; i < GUEST_WRITES_PER_TOKEN_AND_IP; i++) limiter.consume('tok', '1.1.1.1', 0);

    expect(() => limiter.consume('tok', '1.1.1.1', 1)).toThrow(HttpException);
    try {
      limiter.consume('tok', '1.1.1.1', 1);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });

  it('does not let one IP spend another IP budget', () => {
    const limiter = new GuestRateLimiter();
    for (let i = 0; i < GUEST_WRITES_PER_TOKEN_AND_IP; i++) limiter.consume('tok', '1.1.1.1', 0);

    expect(() => limiter.consume('tok', '2.2.2.2', 1)).not.toThrow();
  });

  it('frees the per IP budget after ten minutes', () => {
    const limiter = new GuestRateLimiter();
    for (let i = 0; i < GUEST_WRITES_PER_TOKEN_AND_IP; i++) limiter.consume('tok', '1.1.1.1', 0);

    expect(() => limiter.consume('tok', '1.1.1.1', 10 * 60 * 1000 + 1)).not.toThrow();
  });

  it('caps a token across all IPs per hour', () => {
    const limiter = new GuestRateLimiter();
    // Spread over enough IPs and time that no per-IP budget is hit.
    for (let i = 0; i < GUEST_WRITES_PER_TOKEN; i++) {
      limiter.consume('tok', `10.0.${Math.floor(i / 10)}.${i % 10}`, i);
    }

    expect(() => limiter.consume('tok', '9.9.9.9', GUEST_WRITES_PER_TOKEN)).toThrow(HttpException);
  });

  it('keeps tokens apart', () => {
    const limiter = new GuestRateLimiter();
    for (let i = 0; i < GUEST_WRITES_PER_TOKEN_AND_IP; i++) limiter.consume('a', '1.1.1.1', 0);

    expect(() => limiter.consume('b', '1.1.1.1', 1)).not.toThrow();
  });
});
