// One in-app notification addressed to one user, plus the browser-push
// subscription shapes that carry the same payload out to a device.
//
// `title`/`body` are composed server-side as finished French sentences and
// rendered verbatim — the same contract as `ActionItem` in ./my-dashboard.ts.
// The client never re-derives copy from `type`; `type` exists only to pick an
// icon and to let a later preferences screen filter by category.

export type NotificationType =
  | 'EVENT_CONVOCATION'
  | 'EVENT_CANCELLED'
  | 'SCORESHEET_READY'
  | 'SCORESHEET_FAILED'
  | 'EVENT_MEETING_FIXED'
  | 'EVENT_MEETING_CHANGED';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /**
   * A frontend-relative path (e.g. `/clubs/x/teams/y/events/z`), never an
   * absolute URL — the app feeds it straight to react-router, and the server
   * prefixes it with FRONTEND_URL for the e-mailed and pushed copies. Null
   * when a notification has nowhere useful to go.
   */
  deepLink: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: AppNotification[];
  /**
   * Unread count across the whole account, not just the returned page — the
   * bell's badge has to be right even when the list is truncated.
   */
  unreadCount: number;
}

export interface ListNotificationsParams {
  limit?: number;
  /** ISO timestamp; returns notifications created strictly before it. */
  before?: string;
}

export interface VapidPublicKeyResponse {
  /**
   * Base64url VAPID application server key, or null when the deployment has
   * no VAPID keys configured — the client hides its push toggle rather than
   * offering a subscription that could never be delivered to.
   */
  publicKey: string | null;
}

/** Mirrors the browser's `PushSubscription.toJSON()` shape. */
export interface CreatePushSubscriptionRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface DeletePushSubscriptionRequest {
  endpoint: string;
}
