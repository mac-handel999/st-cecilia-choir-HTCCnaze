const CACHE_NAME = 'st-cecilia-choir-v19';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/events.html',
  '/tickets.html',
  '/ticket-admin.html',
  '/debt-ledger.html',
  '/hymn-books.html',
  '/hymn-book.html',
  '/css/design-system.css',
  '/css/components.css',
  '/css/styles.css',
  '/css/hymn-book.css',
  '/css/featured-events.css',
  '/css/tickets.css',
  '/css/debt-ledger.css',
  '/css/order-of-mass.css',
  '/css/announcement-box.css',
  '/manifest.json',
  '/IMAGES/choir-logo.jpg'
];

const JS_FILES = [
  '/js/shared.js',
  '/js/featured-events.js',
  '/js/tickets.js',
  '/js/ticket-admin.js',
  '/js/debt-ledger.js',
  '/js/events.js',
  '/js/hymn-books.js',
  '/js/hymn-book.js',
  '/js/musical-score.js',
  '/js/scores.js',
  '/js/member-home.js',
  '/js/members-directory.js',
  '/js/cecilia-ai.js',
  '/js/executives.js',
  '/js/image-gallery.js',
  '/js/notifications.js',
  '/js/attendance.js',
  '/js/announcement-box.js',
  '/js/order-of-mass.js',
  '/js/admin-dashboard.js',
  '/js/create-event.js',
  '/js/event-songs.js'
];

const IMAGE_ASSETS = [
  '/IMAGES/choir-logo.jpg',
  '/IMAGES/music-boom-2026.jpg',
  '/IMAGES/november-choir-month-2026.png',
  '/IMAGES/music-boom-ticket-regular.jpg',
  '/IMAGES/music-boom-ticket-vip.jpg',
  '/IMAGES/music-boom-ticket-family.jpg',
  '/IMAGES/choir.jpg',
  '/IMAGES/HTCC.png',
  '/IMAGES/singers1.png',
  '/IMAGES/logo-2.jpg',
  '/IMAGES/singers2.jpg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching static assets');
        return Promise.allSettled([
          ...STATIC_ASSETS.map(asset => cache.add(asset).catch(err => console.log('Failed to cache:', asset, err))),
          ...JS_FILES.map(asset => cache.add(asset).catch(err => console.log('Failed to cache JS:', asset, err))),
          ...IMAGE_ASSETS.map(asset => cache.add(asset).catch(err => console.log('Failed to cache image:', asset, err)))
        ]);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // For API requests: network first, cache fallback
  if (url.pathname.includes('/api/')) {
    if (url.pathname.startsWith('/api/tickets/') || url.pathname.startsWith('/api/debt-ledger')) {
      event.respondWith(
        fetch(event.request).catch(() => new Response(JSON.stringify({
          message: url.pathname.startsWith('/api/debt-ledger')
            ? 'The choir ledger needs an internet connection. Please reconnect and try again.'
            : 'Ticket services need an internet connection. Please reconnect and try again.'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }))
      );
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(cached => cached || new Response(JSON.stringify({ message: 'You are offline. Please check your connection.' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }));
        })
    );
    return;
  }

  // Authenticated hymn data must never be shared through the service-worker cache.
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Prefer deployed assets, retaining only the last successful response as an outage fallback.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        const cached = response.ok ? null : await caches.match(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response.status >= 500 && cached ? cached : response;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.headers.get('accept')?.includes('text/html')) {
          const offlinePage = await caches.match('/index.html');
          if (offlinePage) return offlinePage;
        }
        return new Response('Offline - content not cached', { status: 503 });
      }
    })()
  );
});

// Background sync for offline form submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  // This would sync any offline data when connection is restored
  console.log('Syncing offline data...');
  // Implementation would depend on your specific offline storage strategy
}

// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const text = event.data.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { body: text };
  }
  const notificationUrl = getNotificationUrl(data.url);
  const options = {
    body: data.body || 'New notification from St. Cecilia Choir',
    icon: '/IMAGES/choir-logo.jpg',
    badge: '/IMAGES/choir-logo.jpg',
    vibrate: [100, 50, 100],
    data: notificationUrl,
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Close' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'St. Cecilia Choir', options)
  );
});

function getNotificationUrl(value) {
  try {
    const url = typeof value === 'string' ? value : value?.url;
    const target = new URL(url || '/', self.location.origin);
    return target.origin === self.location.origin
      ? `${target.pathname}${target.search}${target.hash}`
      : '/';
  } catch {
    return '/';
  }
}

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const targetUrl = new URL(getNotificationUrl(event.notification.data), self.location.origin);
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then((clientList) => {
        for (const client of clientList) {
          if (new URL(client.url).origin === targetUrl.origin && 'focus' in client) {
            if (client.url !== targetUrl.href && 'navigate' in client) {
              return client.navigate(targetUrl.href).then(() => client.focus());
            }
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl.href);
        }
      })
  );
});
