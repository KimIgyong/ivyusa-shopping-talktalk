/* ShopTalk PWA service worker (plain JS — not typechecked, see tsconfig include).
 * Scope: /app/ only. NEVER intercepts /api/ requests (network always). */

const SHELL_CACHE = 'shoptalk-shell-v2';
const SHELL_URL = '/app/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([SHELL_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Same-origin /app/ traffic only; the API (and everything else) is untouched.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (!url.pathname.startsWith('/app')) return;
  if (event.request.method !== 'GET') return;

  // App navigations: network-first, offline fallback to the cached shell.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL_URL)),
    );
    return;
  }

  // Hashed static assets: cache-first.
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        }),
    ),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }
  const title = payload.title || 'ShopTalk';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/app/icons/icon-192.png',
      data: payload.data || {},
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  // Campaign deep links (F4 A-9): product handle → in-app detail; absolute URL →
  // open directly (external allowed); else fall back to the category mapping.
  let url = '/app/alerts';
  if (data.productHandle) url = '/app/products/' + encodeURIComponent(data.productHandle);
  else if (data.url) {
    event.waitUntil(self.clients.openWindow(data.url));
    return;
  } else if (data.category === 'chat') url = '/app/chat';
  else if (data.category === 'shipping' || data.category === 'payment') url = '/app/orders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/app') && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
