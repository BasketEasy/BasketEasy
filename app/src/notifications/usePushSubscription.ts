import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { VapidPublicKeyResponse } from '@basketeasy/types/notifications';
import { apiClient } from '../api/client';
import { pushPublicKeyQueryKey } from './queryKeys';

const SERVICE_WORKER_URL = '/sw.js';

export type PushSupport =
  /** The browser has no Push API at all — notably iOS Safari outside an installed PWA. */
  | 'unsupported'
  /** Supported, but the deployment has no VAPID keys, so there is nothing to subscribe to. */
  | 'unconfigured'
  | 'available';

export interface PushSubscriptionState {
  support: PushSupport;
  /** Mirrors Notification.permission; 'denied' can only be undone in browser settings. */
  permission: NotificationPermission;
  isSubscribed: boolean;
  isBusy: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * The VAPID application server key has to reach `pushManager.subscribe` as a
 * Uint8Array, but travels as base64url. Browsers still don't decode this for
 * us, so this is the standard conversion every Web Push client carries.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  // Explicitly backed by an ArrayBuffer (not the ArrayBufferLike a bare
  // Uint8Array admits): `applicationServerKey` takes a BufferSource, which
  // excludes a SharedArrayBuffer-backed view.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

/**
 * Owns one browser's Web Push subscription: the permission prompt, the
 * service-worker registration, and keeping the server's `PushSubscription`
 * row in step with the browser's own.
 *
 * Not a react-query mutation, because the state being read is the *browser's*
 * (permission, an existing subscription), not the server's — there is no
 * query key that could hold it, and it has to be re-read from the
 * PushManager rather than cached.
 *
 * Registration happens on subscribe, not on mount: registering a service
 * worker for every visitor to get a toggle's initial state is a cost paid by
 * everyone for a feature most will never turn on.
 */
export function usePushSubscription(): PushSubscriptionState {
  const supported = isPushSupported();
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    supported ? Notification.permission : 'default',
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // Null publicKey means the deployment has no VAPID keys — the toggle hides
  // rather than offering a subscription nothing could ever deliver to.
  const { data: vapid } = useQuery({
    queryKey: pushPublicKeyQueryKey,
    queryFn: () => apiClient.get<VapidPublicKeyResponse>('/me/push-subscriptions/public-key'),
    enabled: supported,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    // Reads an *existing* registration only — this must not register one as a
    // side effect of rendering the settings screen.
    void navigator.serviceWorker
      .getRegistration(SERVICE_WORKER_URL)
      .then((registration) => registration?.pushManager.getSubscription() ?? null)
      .then((subscription) => {
        if (!cancelled) setIsSubscribed(subscription !== null);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported || !vapid?.publicKey) return;
    setIsBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return;

      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
      // `ready` rather than using the registration straight away: a worker
      // that is still installing has no active PushManager to subscribe with.
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // Required to be true by every browser that implements Push: a
        // silent push is not allowed on the open web.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });

      await apiClient.post('/me/push-subscriptions', subscription.toJSON());
      setIsSubscribed(true);
    } finally {
      setIsBusy(false);
    }
  }, [supported, vapid?.publicKey]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setIsBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        // Server first: if the browser-side unsubscribe succeeded and the
        // API call then failed, the server would keep pushing to an endpoint
        // that no longer exists — recoverable (it prunes on 410), but it
        // leaves the toggle lying to the user in the meantime.
        await apiClient.delete('/me/push-subscriptions', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
    } finally {
      setIsBusy(false);
    }
  }, [supported]);

  return {
    support: !supported ? 'unsupported' : vapid && !vapid.publicKey ? 'unconfigured' : 'available',
    permission,
    isSubscribed,
    isBusy,
    subscribe,
    unsubscribe,
  };
}
