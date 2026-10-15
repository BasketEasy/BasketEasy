/*
 * Service worker for Web Push.
 *
 * Deliberately does nothing else — no offline caching, no fetch handler, no
 * precache manifest. A caching service worker is a whole class of stale-asset
 * bugs, and the app has no offline story to make it worth taking on; this
 * file exists solely because a push subscription cannot exist without a
 * registered worker.
 *
 * Plain JS in public/ rather than a bundled module: it is served verbatim
 * from the site root, which is what gives it scope over the whole origin.
 */

// The payload NotificationsService sends: { title, body, url }.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Some push services send a keep-alive with a non-JSON body; ignore it
    // rather than showing the user a notification titled "undefined".
    return;
  }

  const title = payload.title || 'Kluvo';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || undefined,
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      // The deep link travels in `data` so notificationclick can read it.
      data: { url: payload.url || '/' },
      // Collapses a burst (a manager convoking, then editing, then convoking
      // again) into one visible notification per tag.
      tag: payload.url || 'kluvo',
      renotify: false,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  // Prefer focusing a tab that is already open on this origin and steering it
  // to the deep link, over opening a second one: a volunteer checking a
  // convocation should not end up with six Kluvo tabs by the end of a season.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            return client.navigate(target).then((navigated) => navigated && navigated.focus());
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
