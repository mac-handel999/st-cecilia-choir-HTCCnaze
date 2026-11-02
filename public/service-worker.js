const CACHE_NAME = 'st-cecilia-choir-v12';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/events.html',
  '/hymn-books.html',
  '/hymn-book.html',
  '/css/design-system.css',
  '/css/components.css',
  '/css/styles.css',
  '/css/hymn-book.css',
  '/css/featured-events.css',
  '/css/order-of-mass.css',
  '/css/announcement-box.css',
  '/manifest.json',
  '/IMAGES/choir-logo.jpg'
];

const JS_FILES = [
  '/js/shared.js',
  '/js/featured-events.js',
  '/js/events.js',
  '/js/hymn-books.js',
  '/js/hymn-book.js',
  '/js/musical-score.js',
  '/js/scores.js',
  '/js/member-home.js',
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
  '/IMAGES/november-choir-month-2026.png'
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

  // For JS files: network first, cache fallback
  if (url.pathname.endsWith('.js')) {
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
            .then(cached => cached || new Response('// Offline - JS not cached', { status: 503, headers: { 'Content-Type': 'application/javascript' } }));
        })
    );
    return;
  }

  // For static assets: stale-while-revalidate
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        const networkFetch = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || networkFetch;
      })
      .catch(() => {
        if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
          return caches.match('/index.html');
        }
        return new Response('Offline - content not cached', { status: 503 });
      })
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
