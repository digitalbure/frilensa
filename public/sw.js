// PWA Service Worker for Frilensa
// Prevents caching of JavaScript modules, chunks, and API endpoints

const CACHE_NAME = 'frilensa-pwa-v1';

self.addEventListener('install', (event) => {
  // Immediately activate the new worker
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clear all old caches to eliminate any stale module chunks
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Pass through all fetch requests natively
self.addEventListener('fetch', (event) => {
  return;
});

// Push notification handling
self.addEventListener('push', (event) => {
  if (event.data) {
    let data;
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
    const options = {
      body: data.body || 'New notification in Frilensa',
      icon: '/pwa-icon.svg',
      badge: '/pwa-icon.svg',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/'
      }
    };
    event.waitUntil(
      self.registration.showNotification(data.title || 'Frilensa', options)
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
