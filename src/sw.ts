/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigation fallback to index.html
registerRoute(
  new NavigationRoute(
    new NetworkFirst({ cacheName: 'navigate', networkTimeoutSeconds: 3 }),
    { denylist: [/^\/auth\//, /^\/api\//] }
  )
);

// Supabase REST API — NetworkFirst
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co') && url.pathname.startsWith('/rest/v1'),
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 })],
  })
);

// Google Fonts stylesheets — CacheFirst
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-stylesheets',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  })
);

// Google Fonts webfonts — CacheFirst
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  })
);

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json() as { title?: string; body?: string; tag?: string; url?: string };
  const title = data.title ?? 'Новое сообщение';
  const options: NotificationOptions = {
    body: data.body ?? '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: data.tag ?? 'avito-message',
    data: { url: data.url ?? '/?view=messages' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string | undefined) ?? '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            return (client as WindowClient).navigate(url).then((c) => c?.focus());
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
