// Lekka Wallet Service Worker for Android Push Notifications

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let title = 'Lekka Wallet';
  let body = 'New transaction notification in your ledger.';
  if (event.data) {
    try {
      const parsed = event.data.json();
      title = parsed.title || title;
      body = parsed.body || body;
    } catch {
      body = event.data.text() || body;
    }
  }

  const options = {
    body,
    icon: '/assets/icon.png',
    badge: '/assets/icon.png',
    vibrate: [100, 50, 100],
    data: { url: '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
