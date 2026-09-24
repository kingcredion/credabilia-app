import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

// Precaches the built JS/CSS/HTML app shell only -- deliberately no runtimeCaching rules here.
// Every Supabase call (listings, purchases, refunds, balances) must always hit the network, never
// a cached response: this is a live marketplace, not content that's safe to serve stale.
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const title = data.title || 'Credabilia';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/brand/app-icons/crown-c/web/icon-192.png',
    badge: '/brand/app-icons/crown-c/web/icon-192.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if (client.url.startsWith(self.location.origin)) {
        await client.navigate(url);
        return client.focus();
      }
    }
    return clients.openWindow(url);
  })());
});
