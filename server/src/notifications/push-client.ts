export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string | null;
  /** Absolute URL the service worker opens on click. */
  url: string | null;
}

/**
 * Thrown by a PushClient when the push service says this subscription is
 * permanently gone (404/410) — the browser was uninstalled, the site data
 * cleared, or the subscription rotated. NotificationsService deletes the row
 * on this and only this error; a 500 or a timeout is transient and the
 * subscription is kept.
 */
export class PushSubscriptionGoneError extends Error {
  constructor(public readonly endpoint: string) {
    super(`Push subscription is gone: ${endpoint}`);
    this.name = 'PushSubscriptionGoneError';
  }
}

// Swappable seam, same shape as MAIL_CLIENT and SCORESHEET_VISION_CLIENT.
export interface PushClient {
  /**
   * Null when the deployment has no VAPID keys — the frontend hides its push
   * toggle rather than offering a subscription nothing could ever deliver to.
   */
  getPublicKey(): string | null;
  send(target: PushTarget, payload: PushPayload): Promise<void>;
}

export const PUSH_CLIENT = Symbol('PUSH_CLIENT');
