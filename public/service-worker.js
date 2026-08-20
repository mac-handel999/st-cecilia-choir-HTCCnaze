const CACHE_NAME = 'st-cecilia-choir-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/design-system.css',
  '/css/components.css',
  '/css/styles.css',
  '/js/shared.js',
  '/js/musical-score.js',
  '/js/scores.js',
  '/js/member-home.js',
  '/js/cecilia-ai.js',
  '/js/executives.js',
  '/js/image-gallery.js',
  '/manifest.json',
  '/IMAGES/choir-logo.jpg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching static assets');
        return Promise.allSettled(
          STATIC_ASSETS.map(asset => cache.add(asset).catch(err => console.log('Failed to cache:', asset, err)))
        );
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
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API requests - always go to network
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone the response to cache it
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // Return offline fallback for API requests
          return new Response(
            JSON.stringify({ message: 'You are offline. Please check your connection.' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // For static assets: cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version immediately
          const fetchPromise = fetch(event.request)
            .then((networkResponse) => {
              // Update cache with fresh version
              if (networkResponse.ok) {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, responseClone));
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          // Return cached response immediately, update in background
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(event.request)
          .then((response) => {
            // Don't cache invalid responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone and cache the response
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseClone));

            return response;
          })
          .catch(() => {
            // Return offline fallback for HTML pages
            if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/index.html');
            }
            return new Response('Offline - content not cached', { status: 503 });
          });
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

  const data = event.data.json();
  const options = {
    body: data.body || 'New notification from St. Cecilia Choir',
    icon: '/IMAGES/choir-logo.jpg',
    badge: '/IMAGES/choir-logo.jpg',
    vibrate: [100, 50, 100],
    data: data.url || '/',
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Close' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'St. Cecilia Choir', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then((clientList) => {
        // If a window is already open, focus it
        for (const client of clientList) {
          if (client.url === event.notification.data && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data || '/');
        }
      })
  );
});
