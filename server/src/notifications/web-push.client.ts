import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import {
  PushSubscriptionGoneError,
  type PushClient,
  type PushPayload,
  type PushTarget,
} from './push-client';

// Status codes the Web Push protocol defines as "this subscription will never
// work again": 404 the push service never heard of it, 410 it has been
// unsubscribed. Anything else (429, 5xx, a network error) is transient and
// the row stays.
const GONE_STATUS_CODES = new Set([404, 410]);

/**
 * Web Push over VAPID, via the `web-push` package.
 *
 * VAPID keys are read once per send rather than in the constructor so a
 * deployment that adds them later only needs a restart of the process, not a
 * code path change — and so a missing key is a *disabled feature* (getPublicKey
 * returns null, sends are skipped) rather than a boot failure. Same
 * "integration credentials are not boot-validated" policy as R2_* and
 * GEMINI_API_KEY.
 *
 * Generate a pair with: npx web-push generate-vapid-keys
 */
@Injectable()
export class WebPushClient implements PushClient {
  private readonly logger = new Logger(WebPushClient.name);

  constructor(private readonly config: ConfigService) {}

  getPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') || null;
  }

  async send(target: PushTarget, payload: PushPayload): Promise<void> {
    const publicKey = this.getPublicKey();
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) {
      this.logger.debug('No VAPID keys configured — skipping push');
      return;
    }

    // `subject` must be a mailto: or https: URL identifying the sender; push
    // services reject the request without it.
    const subject = this.config.get<string>('VAPID_SUBJECT') || 'mailto:contact@kluvo.net';

    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        JSON.stringify(payload),
        { vapidDetails: { subject, publicKey, privateKey } },
      );
    } catch (err) {
      if (
        err !== null &&
        typeof err === 'object' &&
        'statusCode' in err &&
        typeof (err as { statusCode: unknown }).statusCode === 'number' &&
        GONE_STATUS_CODES.has((err as { statusCode: number }).statusCode)
      ) {
        throw new PushSubscriptionGoneError(target.endpoint);
      }
      throw err;
    }
  }
}
