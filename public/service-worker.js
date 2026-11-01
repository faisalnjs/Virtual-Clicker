const DEVELOPMENT = new URL(self.location.href).searchParams.get('dev') === '1';
const CACHE_PREFIX = 'virtual-clicker';
const CACHE_VERSION = new URL(self.location.href).searchParams.get('v') || 'v1';
const PAGE_CACHE = `${CACHE_PREFIX}-pages-${CACHE_VERSION}`;
const ASSET_CACHE = `${CACHE_PREFIX}-assets-${CACHE_VERSION}`;
const STATIC_DESTINATIONS = new Set(['style', 'script', 'worker', 'image', 'font', 'video', 'audio', 'manifest']);
const PRECACHE_URLS = ['/', '/index.html', '/404.html', '/resetcookies.html', '/manifest.webmanifest', '/banner-meta.png', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (DEVELOPMENT) {
      await self.skipWaiting();
      return;
    }
    const cache = await caches.open(PAGE_CACHE);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (DEVELOPMENT) {
      await self.clients.claim();
      return;
    }
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => {
      if (cacheName.startsWith(CACHE_PREFIX) && (cacheName !== PAGE_CACHE) && (cacheName !== ASSET_CACHE)) {
        return caches.delete(cacheName);
      }
      return Promise.resolve();
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (DEVELOPMENT) return;
  const { request } = event;
  if ((request.method !== 'GET') || (new URL(request.url).origin !== self.location.origin)) return;
  if ((request.mode === 'navigate') || (new URL(request.url).pathname === '/manifest.webmanifest')) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (!STATIC_DESTINATIONS.has(request.destination)) return;
  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clients.find(item => {
      const url = new URL(item.url);
      return url.origin === self.location.origin && ['/', '/index.html'].includes(url.pathname);
    });
    if (client) {
      await client.focus();
      client.postMessage({ type: event.notification.data?.type === 'bugs' ? 'open-bug-reports' : 'open-suggestions' });
    } else {
      await self.clients.openWindow(event.notification.data?.type === 'bugs' ? '/#bug-reports' : '/#suggestions');
    }
  })());
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try {
      payload = event.data?.json();
    } catch {
      return;
    }
    if (!['suggestions', 'bugs'].includes(payload?.type)) return;
    const bug = payload.type === 'bugs';
    await self.registration.showNotification(bug ? 'Reply to bug report' : 'Reply to suggestion', {
      body: `Seat ${payload.seatCode}: ${bug ? 'Your bug report has been replied to. Open My Bug Reports to read it.' : 'Your suggestion has been replied to. Open My Suggestions to read it.'}`,
      icon: '/banner-meta.png', badge: '/favicon.ico',
      tag: `${bug ? 'bug-report-replies' : 'suggestion-responses'}-${payload.seatCode}`,
      data: { type: payload.type, url: bug ? '/#bug-reports' : '/#suggestions' },
    });
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.postMessage({ type: bug ? 'bug-reports-updated' : 'suggestions-updated' }));
  })());
});
